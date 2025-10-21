// src/components/WalletButton.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';

const API = process.env.REACT_APP_API || 'http://localhost:5000';
const TARGET_CHAIN_ID = (process.env.REACT_APP_CHAIN_ID || '').toLowerCase(); 

function WalletButton({ onAddress, onVerified, onProvider, onSigner }) {
  const [addr, setAddr] = useState(localStorage.getItem('wallet') || '');
  const [verified, setVerified] = useState(localStorage.getItem('wallet_verified') === 'true');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  // ---- notify parent --------------------------------------------------------
  const notifyParent = useCallback(() => {
    onAddress?.(addr || '');
    onVerified?.(verified || false);
    onProvider?.(provider || null);
    onSigner?.(signer || null);
  }, [addr, verified, provider, signer, onAddress, onVerified, onProvider, onSigner]);

  useEffect(() => { notifyParent(); }, [notifyParent]);

  // keep in sync with MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = async (accounts) => {
      const a = accounts?.[0] ? ethers.getAddress(accounts[0]) : '';
      setAddr(a);
      if (a) {
        localStorage.setItem('wallet', a);
        try {
          const p = new ethers.BrowserProvider(window.ethereum);
          const s = await p.getSigner();
          setProvider(p);
          setSigner(s);
        } catch {}
      } else {
        localStorage.removeItem('wallet');
        localStorage.removeItem('wallet_verified');
        setVerified(false);
        setProvider(null);
        setSigner(null);
      }
    };

    const onChainChanged = () => {
      // simplest: reload so providers/signers reset
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);
    return () => {
      window.ethereum?.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum?.removeListener('chainChanged', onChainChanged);
    };
  }, []);

  // ---- chain guard (optional) ----------------------------------------------
  const ensureTargetChain = async () => {
    if (!TARGET_CHAIN_ID || !window.ethereum) return;
    const current = (await window.ethereum.request({ method: 'eth_chainId' }))?.toLowerCase();
    if (current === TARGET_CHAIN_ID) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_ID }],
      });
    } catch (e) {
      // If the chain isn't added to MetaMask, user must add it manually (or you can implement addChain here).
      throw new Error('Wrong network. Please switch to the target chain in MetaMask.');
    }
  };

  // ---- backend wallet verification -----------------------------------------
  const doVerify = useCallback(async (prov, address) => {
    const token = localStorage.getItem('token');
    if (!token) return; // skip verify if not logged in

    await fetch(`${API}/user/wallet`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wallet_address: address }),
    });

    const nr = await fetch(`${API}/user/wallet/nonce`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { nonce } = await nr.json();

    const signer_ = await prov.getSigner();
    const message = `Sign to verify wallet with your account. Nonce: ${nonce}`;
    const signature = await signer_.signMessage(message);

    const vr = await fetch(`${API}/user/wallet/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, signature }),
    });
    const vj = await vr.json();
    if (!vr.ok) {
      setVerified(false);
      localStorage.setItem('wallet_verified', 'false');
      throw new Error(vj.error || 'Wallet verification failed');
    }
    setVerified(true);
    localStorage.setItem('wallet_verified', 'true');
  }, []);

  // Connect when not connected; otherwise open MetaMask account picker to switch
  const connectOrSwitch = async () => {
    try {
      if (!window.ethereum) return alert('Install MetaMask');
      setBusy(true);

      await ensureTargetChain();

      const prov = new ethers.BrowserProvider(window.ethereum);

      // If already connected, request permissions to trigger the account picker
      if (addr) {
        try {
          await window.ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }],
          });
        } catch { /* older MetaMask fallback */ }
      }

      const accounts = await prov.send('eth_requestAccounts', []);
      const a = accounts && accounts[0] ? ethers.getAddress(accounts[0]) : '';
      if (!a) throw new Error('No account selected');

      const s = await prov.getSigner();

      setAddr(a);
      setProvider(prov);
      setSigner(s);
      localStorage.setItem('wallet', a);

      // Optional: (re)verify on every (re)connect
      try {
        await doVerify(prov, a);
      } catch (e) {
        console.warn('verify failed:', e?.message || e);
      }
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Connect failed');
    } finally {
      setBusy(false);
    }
  };

  const label = addr
    ? `${addr.slice(0, 6)}…${addr.slice(-4)}${verified ? ' ✅' : ''}`
    : 'Connect Wallet';

  return (
    <div style={{ display: 'inline-flex', gap: 8 }}>
      <button
        className="role-btn"
        onClick={connectOrSwitch}
        title={addr ? 'Click to switch wallet' : (verified ? 'Verified wallet' : 'Connect & verify wallet')}
        disabled={busy}
      >
        {busy ? 'Working…' : label}
      </button>
    </div>
  );
}
export default WalletButton;
