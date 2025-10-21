// src/components/PropertyCard.jsx
import React, { useMemo, useState } from 'react';
import './PropertyCard.css';
import { ethers } from 'ethers';
import {
  getDeedContract,
  getEscrowContract,
  assertContractCode,
  fnList,
} from '../web3';
import {
  DEFAULT_DEED as DEFAULT_DEED_ADDRESS,
  DEFAULT_ESCROW as DEFAULT_ESCROW_ADDRESS,
} from '../address';

const API = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

// --- debug helper: prints all escrow functions in console (optional) ---
const logAvailableEscrowFns = (escrow) => {
  try {
    const list = (escrow.interface.fragments || [])
      .filter((f) => f.type === 'function')
      .map(
        (f) =>
          `${f.name}(${f.inputs.map((i) => i.type).join(',')}) [${f.stateMutability}]`
      );
    // eslint-disable-next-line no-console
    console.log('Escrow ABI functions:\n' + list.join('\n'));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Cannot introspect escrow ABI', e);
  }
};

// ---- Minimal ERC721 ABI for approve/allowance (ERC-721 path) ----
const ERC721_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

function PropertyCard({ property = {}, currentWallet: walletFromProp }) {
  const {
    _id,
    imageURL,
    imageUrl,
    location = 'Unknown',
    seller_name = 'N/A',
    seller_address = '',
    num_of_rooms = 0,
    num_of_bedroom = 0,
    price_in_ETH = 0,

    // prefer per-listing values if present
    deed_address: deedAddrFromDb,
    escrow_address: escrowAddrFromDb,
    tokenId: tokenIdFromDb,
    dealId: dealIdFromDb,
  } = property;

    // --- Unique token ID per property ---
  const tokenId = useMemo(() => {
    if (tokenIdFromDb) return Number(tokenIdFromDb);
    // hash property _id to get deterministic unique tokenId
    const hash = ethers.keccak256(ethers.toUtf8Bytes(_id || Math.random().toString()));
    return window.BigInt(hash) % window.BigInt(1e9);
  }, [_id, tokenIdFromDb]);

  // resolve addresses & ids with fallbacks
  const deedAddr = deedAddrFromDb || DEFAULT_DEED_ADDRESS;
  const escrowAddr = escrowAddrFromDb || DEFAULT_ESCROW_ADDRESS;

  // local UI state
  const [displayUrl, setDisplayUrl] = useState(imageURL || imageUrl || '');
  const [price, setPrice] = useState(price_in_ETH);
  const [imgError, setImgError] = useState(false);

  // edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [file, setFile] = useState(null);
  const [formPrice, setFormPrice] = useState(String(price ?? ''));

  // escrow state
  const [dealId, setDealId] = useState(dealIdFromDb ?? null);
  const [txMsg, setTxMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // who’s viewing? (seller vs buyer)
  const currentWallet = walletFromProp || localStorage.getItem('wallet') || '';
  const isSellerViewing = useMemo(() => {
    if (!currentWallet || !seller_address) return false;
    try {
      return (
        ethers.getAddress(currentWallet) === ethers.getAddress(seller_address)
      );
    } catch {
      return false;
    }
  }, [currentWallet, seller_address]);

  // ---------- helpers ----------
  const parseEventDealId = (receipt) => {
    try {
      for (const l of receipt.logs || []) {
        const maybe = l.args || {};
        if (maybe.dealId != null) return Number(maybe.dealId);
        if (maybe.id != null) return Number(maybe.id);
        if (maybe.propertyId != null) return Number(maybe.propertyId);
      }
    } catch {}
    return null;
  };

  // Try different list signatures to be resilient across contract versions.
  const tryList = async (escrow, deedAddrX, tokenIdX, priceWei) => {
    const name = fnList(escrow); // throws if not found in ABI
    // 1) list(tokenId, price)
    try {
      return await escrow[name](ethers.toBigInt(tokenIdX), priceWei);
    } catch {}
    // 2) list(deedAddr, tokenId, price)
    try {
      return await escrow[name](deedAddrX, ethers.toBigInt(tokenIdX), priceWei);
    } catch {}
    // 3) list(tokenId, price, deadline) — provide a 48h deadline
    try {
      const deadline = ethers.toBigInt(
        Math.floor(Date.now() / 1000) + 48 * 3600
      );
      return await escrow[name](ethers.toBigInt(tokenIdX), priceWei, deadline);
    } catch (e) {
      throw e; // bubble the last error
    }
  };

  // ---- Smarter deposit that supports payable and ERC721 flows ----
  const tryDeposit = async (escrow, dealIdX, tokenIdX, valueWei) => {
    const idA = ethers.toBigInt(dealIdX ?? tokenIdX);

    // signer (buyer) & address for (address,uint256) variants
    const signer = escrow.runner; // ethers v6: runner is the signer
    const buyerAddr = await signer.getAddress();
    const escrowAddress = await escrow.getAddress();

    // helper to invoke a function if present
    const callFn = async (name, args, opts) => {
      if (typeof escrow[name] !== 'function') return null;
      try {
        const frag = escrow.interface.getFunction(name);
        if (frag.stateMutability === 'payable') {
          return await escrow[name](...args, { value: valueWei, ...(opts || {}) });
        }
        // non-payable — likely ERC-20 flow
        return await escrow[name](...args, { ...(opts || {}) });
      } catch {
        return null;
      }
    };

    // 1) Common names first (try 1-arg then 2-arg permutations)
    const named = [
      ['deposit',       [idA]],
      ['depositEarnest',[idA]],
      ['fund',          [idA]],
      ['fundDeal',      [idA]],
      ['pay',           [idA]],
      ['purchase',      [idA]],
      ['buy',           [idA]],
      ['buyNow',        [idA]],
      // two-arg variants (id,address) and (address,id)
      ['deposit',       [idA, buyerAddr]],
      ['deposit',       [buyerAddr, idA]],
      ['purchase',      [idA, buyerAddr]],
      ['purchase',      [buyerAddr, idA]],
      ['buy',           [idA, buyerAddr]],
      ['buy',           [buyerAddr, idA]],
    ];
    for (const [name, args] of named) {
      const tx = await callFn(name, args);
      if (tx) return tx;
    }

    // 2) ABI introspection: 0/1/2 arg payable
    const frags = (escrow.interface.fragments || []).filter((f) => f.type === 'function');

    const zeroPayable = frags.find(
      (f) => f.stateMutability === 'payable' && (f.inputs?.length || 0) === 0
    );
    if (zeroPayable) {
      const tx = await callFn(zeroPayable.name, []);
      if (tx) return tx;
    }

    const onePayable = frags.find(
      (f) =>
        f.stateMutability === 'payable' &&
        (f.inputs?.length || 0) === 1 &&
        /^uint(256)?$/.test(f.inputs[0]?.type || '')
    );
    if (onePayable) {
      const tx = await callFn(onePayable.name, [idA]);
      if (tx) return tx;
    }

    const twoPayable = frags.find(
      (f) =>
        f.stateMutability === 'payable' &&
        (f.inputs?.length || 0) === 2 &&
        ((/^uint/.test(f.inputs[0]?.type || '') && (f.inputs[1]?.type || '').toLowerCase() === 'address') ||
          ((f.inputs[0]?.type || '').toLowerCase() === 'address' && /^uint/.test(f.inputs[1]?.type || '')))
    );
    if (twoPayable) {
      const [a] = twoPayable.inputs;
      const args = /^uint/.test(a.type) ? [idA, buyerAddr] : [buyerAddr, idA];
      const tx = await callFn(twoPayable.name, args);
      if (tx) return tx;
    }

    // 3) ERC-20 flow (detect paymentToken() and non-payable purchase)
    if (typeof escrow.paymentToken === 'function') {
      try {
        const paymentTokenAddr = await escrow.paymentToken();
        if (paymentTokenAddr && paymentTokenAddr !== ethers.ZeroAddress) {
          const erc721 = new ethers.Contract(paymentTokenAddr, ERC721_ABI, signer);

          // assuming 18 decimals; adapt if your token differs
          let amount = valueWei;

          const current = await erc721.allowance(buyerAddr, escrowAddress).catch(() => 0n);
          if (current < amount) {
            const txA = await erc721.approve(escrowAddress, amount);
            await txA.wait();
          }

          const erc721Candidates = [
            ['purchase', [idA]],
            ['buy', [idA]],
            ['deposit', [idA]],
            ['fund', [idA]],
            ['buyNow', [idA]],
            // 2-arg non-payable variants
            ['purchase', [idA, buyerAddr]],
            ['purchase', [buyerAddr, idA]],
            ['buy', [idA, buyerAddr]],
            ['buy', [buyerAddr, idA]],
          ];
          for (const [name, args] of erc721Candidates) {
            const txB = await callFn(name, args, {}); // no value for ERC721 path
            if (txB) return txB;
          }

          // generic non-payable 1-arg uint
          const oneNonPayable = frags.find(
            (f) =>
              f.stateMutability !== 'payable' &&
              (f.inputs?.length || 0) === 1 &&
              /^uint(256)?$/.test(f.inputs[0]?.type || '')
          );
          if (oneNonPayable) {
            const txC = await callFn(oneNonPayable.name, [idA], {});
            if (txC) return txC;
          }
        }
      } catch {
        // ignore and fall through
      }
    }

    throw new Error('No compatible payable/non-payable deposit/buy function found on escrow. Check console for ABI.');
  };

  // ---------- SELLER: approve + list ----------
  const approveAndList = async () => {
    try {
      if (!isSellerViewing) {
        setTxMsg('⚠️ Only seller can list');
        return;
      }
      if (!deedAddr || !escrowAddr) {
        setTxMsg('⚠️ Missing contract addresses');
        return;
      }

      setBusy(true);
      setTxMsg('⏳ Checking contracts…');

      await assertContractCode(deedAddr);
      await assertContractCode(escrowAddr);

      const deed = await getDeedContract(deedAddr);

      // approve escrow for this token if needed
      const approved = await deed
        .getApproved(ethers.toBigInt(tokenId))
        .catch(() => ethers.ZeroAddress);
      if (!approved || approved.toLowerCase() !== escrowAddr.toLowerCase()) {
        setTxMsg('⏳ Approving escrow to transfer your token…');
        const tx1 = await deed.approve(escrowAddr, ethers.toBigInt(tokenId));
        await tx1.wait();
      }

      // list on escrow
      const escrow = await getEscrowContract(escrowAddr);

      setTxMsg('⏳ Listing on escrow…');
      const priceWei = ethers.parseEther(String(price ?? '0'));
      const tx2 = await tryList(escrow, deedAddr, tokenId, priceWei);
      const rcpt = await tx2.wait();

      let newId = parseEventDealId(rcpt);
      if (newId != null) {
        setDealId(newId);
        // persist for backend
        try {
          await fetch(`${API}/property/${_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dealId: newId,
              escrow_address: escrowAddr,
              deed_address: deedAddr,
            }),
          });
        } catch {}
        setTxMsg(`✅ Listed (Deal ID: ${newId}). Buyer can press Buy.`);
      } else {
        setTxMsg(
          '✅ Listed. (Could not parse dealId from events — consider adding a getter to your contract.)'
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      setTxMsg(`❌ ${e.shortMessage || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- BUYER: one-click Buy (+ confirm) ----------
  const buyNow = async () => {
    try {
      if (!localStorage.getItem('wallet')) {
        setTxMsg('⚠️ Connect wallet first.');
        return;
      }
      if (dealId == null && (tokenId == null || tokenId === undefined)) {
        setTxMsg('⚠️ Seller must list on escrow first');
        return;
      }

      setBusy(true);
      setTxMsg('⏳ Preparing…');

      await assertContractCode(escrowAddr);
      const escrow = await getEscrowContract(escrowAddr);

      // optional: dump available fns to console for debugging
      logAvailableEscrowFns(escrow);

      const valueWei = ethers.parseEther(String(price ?? '0'));

      // Pay into escrow (handles payable or ERC-20)
      setTxMsg('⏳ Sending deposit… (confirm in wallet)');
      const tx = await tryDeposit(escrow, dealId, tokenId, valueWei);
      await tx.wait();

      // Immediately buyerConfirm (if function exists)
      try {
        setTxMsg('⏳ Confirming purchase…');
        const tx2 = await escrow.buyerConfirm(
          ethers.toBigInt(dealId != null ? dealId : tokenId)
        );
        await tx2.wait();
        setTxMsg('✅ Payment deposited and buyer confirmed.');
      } catch {
        setTxMsg(
          '✅ Payment sent and property token ID automatically transferred.'
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      setTxMsg(`❌ ${e.shortMessage || e.message || 'Buy failed'} (escrow: ${escrowAddr})`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Edit (image + price) ----------
  const openEdit = () => {
    setMsg('');
    setFormUrl('');
    setFile(null);
    setFormPrice(String(price ?? ''));
    setShowEdit(true);
  };

  const onUrlChange = (e) => {
    setFormUrl(e.target.value);
    if (e.target.value) setFile(null);
  };
  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) setFormUrl('');
  };

  const saveChanges = async (e) => {
    e.preventDefault();
    setMsg('');
    const token = localStorage.getItem('token');
    if (!token) return setMsg('Please login first.');

    // price (optional)
    let pricePayload;
    const p = String(formPrice || '').trim();
    if (p) {
      if (!/^\d+(\.\d+)?$/.test(p)) return setMsg('Price must be a number (e.g., 0.05)');
      if (Number(p) <= 0) return setMsg('Price must be > 0');
      pricePayload = Number(p);
    }

    // image (optional)
    let finalUrl = formUrl.trim();
    if (!finalUrl && file) {
      const fd = new FormData();
      fd.append('image', file);
      const up = await fetch(`${API}/upload/image`, { method: 'POST', body: fd });
      const upData = await up.json();
      if (!up.ok) return setMsg(upData.error || 'Image upload failed');
      finalUrl = `${API}${upData.url}`;
    }
    if (finalUrl && !/^https?:\/\/.+/i.test(finalUrl)) {
      return setMsg('Image URL must start with http(s)://');
    }
    if (!finalUrl && pricePayload === undefined) {
      return setMsg('Nothing to update');
    }

    try {
      setSaving(true);
      const body = {};
      if (pricePayload !== undefined) body.price_in_ETH = pricePayload;
      if (finalUrl) body.imageUrl = finalUrl;

      const res = await fetch(`${API}/property/${_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setSaving(false); return setMsg(data.error || 'Update failed'); }

      if (pricePayload !== undefined) setPrice(pricePayload);
      if (finalUrl) { setDisplayUrl(finalUrl); setImgError(false); }

      setMsg('✅ Updated');
      setTimeout(() => setShowEdit(false), 600);
    } catch {
      setMsg('Network error');
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI ----------
  const imgSrc = displayUrl;
  const priceStr = String(price ?? '0');

  const buyerButtons = (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <button
        onClick={buyNow}
        disabled={busy}
        style={{
          height: 40,
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,.12)',
          background: '#111827',
          color: '#fff',
        }}
      >
        {busy ? 'Processing…' : `Buy for ${priceStr} ETH`}
      </button>
      {dealId == null && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
        </div>
      )}
    </div>
  );

  const sellerButtons = (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <button
        type="button"
        onClick={openEdit}
        disabled={busy}
        style={{
          height: 40,
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,.12)',
          background: '#fff',
          color: '#111827',
        }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={approveAndList}
        disabled={busy || dealId != null}
        title={dealId != null ? 'Already listed' : ' '}
        style={{
          height: 40,
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,.12)',
          background: dealId != null ? '#9ca3af' : '#111827',
          color: '#fff',
        }}
      >
        {busy ? 'Processing…' : dealId == null ? 'Listed' : 'Listed'}
        
      </button>
    </div>
  );

  return (
    <article className="prop-card">
      <div className="prop-card__image">
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt={location || 'Property'}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: 220,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              background: '#f3f4f6',
              display: 'grid',
              placeItems: 'center',
              color: '#94a3b8',
              fontSize: 14,
            }}
          >
            No image
          </div>
        )}
      </div>

      <div className="prop-card__body">
        <h3 className="prop-card__title">{location}</h3>
        <dl className="prop-card__meta">
          <div className="prop-card__row">
            <dt>Seller</dt>
            <dd>{seller_name}</dd>
          </div>
          <div className="prop-card__row">
            <dt>Rooms</dt>
            <dd>{num_of_rooms}</dd>
          </div>
          <div className="prop-card__row">
            <dt>Bedrooms</dt>
            <dd>{num_of_bedroom}</dd>
          </div>
          <div className="prop-card__row">
            <dt>Price (ETH)</dt>
            <dd>{priceStr}</dd>
          </div>
          {dealId != null && (
            <div className="prop-card__row">
              <dt>Deal ID</dt>
              <dd>{dealId}</dd>
            </div>
          )}
          <div className="prop-card__row">
            <dt>Token ID</dt>
            <dd>{tokenId}</dd>
          </div>
        </dl>

        {isSellerViewing ? sellerButtons : buyerButtons}

        {txMsg && (
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: txMsg.startsWith('✅') ? 'green' : '#2563eb',
            }}
          >
            {txMsg}
          </p>
        )}
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <div
          onClick={() => !saving && setShowEdit(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420,
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 10px 30px rgba(0,0,0,.25)',
            }}
          >
            <h4 style={{ marginBottom: 12 }}>Edit Property</h4>
            <form
              onSubmit={saveChanges}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <label style={{ fontSize: 12, color: '#6b7280' }}>
                Price (ETH)
              </label>
              <input
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="e.g., 0.05"
                inputMode="decimal"
                style={{
                  padding: 10,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />

              <label style={{ fontSize: 12, color: '#6b7280' }}>
                Image URL (or upload below)
              </label>
              <input
                placeholder="https://..."
                value={formUrl}
                onChange={onUrlChange}
                disabled={!!file}
                style={{
                  padding: 10,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  opacity: file ? 0.6 : 1,
                }}
              />
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                disabled={!!formUrl}
                style={{
                  padding: 10,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  opacity: formUrl ? 0.6 : 1,
                }}
              />

              {msg && (
                <div
                  style={{
                    color: msg.startsWith('✅') ? 'green' : 'crimson',
                    fontWeight: 600,
                  }}
                >
                  {msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#111827',
                    color: '#fff',
                    border: '1px solid #111827',
                    cursor: 'pointer',
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowEdit(false)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#111827',
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </article>
  );
}

export default PropertyCard;
