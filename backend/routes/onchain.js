// server/routes/onchain.js
const express = require("express");
const { ethers } = require("ethers");

const DeedJson   = require("../abi/PropertyDeed.json");
const EscrowJson = require("../abi/PropertyEscrow.json");

const DeedAbi    = DeedJson.abi;
const EscrowAbi  = EscrowJson.abi;
const DeedByte   = DeedJson.bytecode || null;     // only used when autodeploying
const EscrowByte = EscrowJson.bytecode || null;

const router = express.Router();

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PK      = process.env.DEPLOYER_PRIVATE_KEY;
if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY missing");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PK, provider);

function asBn(x){ return ethers.toBigInt(x); }
function asWei(x){ return ethers.parseEther(String(x)); }

/** Attach (preferred) or deploy (dev) */
async function getContracts(deedAddr, escrowAddr) {
  if (deedAddr && escrowAddr) {
    return {
      deed:   new ethers.Contract(deedAddr, DeedAbi, wallet),
      escrow: new ethers.Contract(escrowAddr, EscrowAbi, wallet),
      deedAddr, escrowAddr
    };
  }
  if (!DeedByte || !EscrowByte) {
    throw new Error("Provide deed/escrow addresses OR compile with bytecode to autodeploy.");
  }
  const DeedF   = new ethers.ContractFactory(DeedAbi, DeedByte, wallet);
  const deed    = await DeedF.deploy();
  await deed.waitForDeployment();
  const deedAddress = await deed.getAddress();

  const EscrowF = new ethers.ContractFactory(EscrowAbi, EscrowByte, wallet);
  const escrow  = await EscrowF.deploy(deedAddress);    // IMPORTANT
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();

  return { deed, escrow, deedAddr: deedAddress, escrowAddr: escrowAddress };
}

/**
 * POST /onchain/list
 * body: {
 *   deed_address, escrow_address,          // preferred (already deployed)
 *   propertyId, seller_address, price_in_ETH, deadline_unix
 * }
 */
router.post("/list", async (req, res) => {
  try {
    const {
      deed_address,
      escrow_address,
      propertyId,
      seller_address,
      price_in_ETH,
      deadline_unix
    } = req.body || {};

    if (!seller_address || propertyId == null || price_in_ETH == null || !deadline_unix) {
      return res.status(400).json({ error: "seller_address, propertyId, price_in_ETH, deadline_unix required" });
    }

    const { deed, escrow, deedAddr, escrowAddr } =
      await getContracts(deed_address, escrow_address);

    // 1) Make sure seller owns propertyId and approves escrow
    const owner = await deed.ownerOf(asBn(propertyId));
    if (owner.toLowerCase() !== seller_address.toLowerCase()) {
      return res.status(400).json({ error: "Seller is not the current owner of this tokenId" });
    }
    const approved = await deed.getApproved(asBn(propertyId)).catch(() => ethers.ZeroAddress);
    if (!approved || approved.toLowerCase() !== escrowAddr.toLowerCase()) {
      const tx = await deed.connect(wallet).approve(escrowAddr, asBn(propertyId));
      await tx.wait();
    }

    // 2) List: escrow expects (propertyId, price, deadline)
    const priceWei = asWei(price_in_ETH);
    const deadline = BigInt(deadline_unix); // seconds since epoch
    const txList = await escrow.list(asBn(propertyId), priceWei, deadline);
    const rcpt   = await txList.wait();

    return res.json({
      deed_address: deedAddr,
      escrow_address: escrowAddr,
      propertyId: Number(propertyId),
      txHash: rcpt.hash
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "list failed" });
  }
});

/**
 * POST /onchain/deposit
 * body: { escrow_address, propertyId, amount_in_ETH, buyer_address? }
 * Note: buyer tx should be signed by buyer wallet in real app. For demo, using deployer signer.
 */
router.post("/deposit", async (req, res) => {
  try {
    const { escrow_address, propertyId, amount_in_ETH } = req.body || {};
    if (!escrow_address || propertyId == null || amount_in_ETH == null) {
      return res.status(400).json({ error: "escrow_address, propertyId, amount_in_ETH required" });
    }
    const escrow = new ethers.Contract(escrow_address, EscrowAbi, wallet);
    const tx = await escrow.deposit(asBn(propertyId), { value: asWei(amount_in_ETH) });
    const rcpt = await tx.wait();
    res.json({ txHash: rcpt.hash });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "deposit failed" });
  }
});

/** POST /onchain/seller-confirm { escrow_address, propertyId } */
router.post("/seller-confirm", async (req, res) => {
  try {
    const { escrow_address, propertyId } = req.body || {};
    const escrow = new ethers.Contract(escrow_address, EscrowAbi, wallet);
    const tx = await escrow.sellerConfirm(asBn(propertyId));
    const rcpt = await tx.wait();
    res.json({ txHash: rcpt.hash });
  } catch (e) {
    res.status(500).json({ error: e?.message || "sellerConfirm failed" });
  }
});

/** POST /onchain/buyer-confirm { escrow_address, propertyId } */
router.post("/buyer-confirm", async (req, res) => {
  try {
    const { escrow_address, propertyId } = req.body || {};
    const escrow = new ethers.Contract(escrow_address, EscrowAbi, wallet);
    const tx = await escrow.buyerConfirm(asBn(propertyId));
    const rcpt = await tx.wait();
    res.json({ txHash: rcpt.hash });
  } catch (e) {
    res.status(500).json({ error: e?.message || "buyerConfirm failed" });
  }
});

// POST /onchain/finalize
// body: { escrow_address, propertyId }
router.post("/finalize", async (req, res) => {
  try {
    const { ethers } = require("ethers");
    const EscrowJson = require("../abi/PropertyEscrow.json");
    const EscrowAbi  = EscrowJson.abi || EscrowJson;

    const { escrow_address, propertyId } = req.body || {};
    if (!escrow_address || propertyId == null) {
      return res.status(400).json({ error: "escrow_address and propertyId are required" });
    }

    const RPC_URL = process.env.RPC_URL;
    const PK      = process.env.DEPLOYER_PRIVATE_KEY; // or arbiter/relayer key
    if (!PK) throw new Error("DEPLOYER_PRIVATE_KEY missing");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet   = new ethers.Wallet(PK, provider);
    const escrow   = new ethers.Contract(escrow_address, EscrowAbi, wallet);

    const tx = await escrow.finalize(BigInt(propertyId));
    const rc = await tx.wait();
    res.json({ txHash: rc.hash });
  } catch (e) {
    res.status(500).json({ error: e?.message || "finalize failed" });
  }
});


/** POST /onchain/refund { escrow_address, propertyId } */
router.post("/refund", async (req, res) => {
  try {
    const { escrow_address, propertyId } = req.body || {};
    const escrow = new ethers.Contract(escrow_address, EscrowAbi, wallet);
    const tx = await escrow.refund(asBn(propertyId));
    const rcpt = await tx.wait();
    res.json({ txHash: rcpt.hash });
  } catch (e) {
    res.status(500).json({ error: e?.message || "refund failed" });
  }
});

/** POST /onchain/cancel { escrow_address, propertyId } */
router.post("/cancel", async (req, res) => {
  try {
    const { escrow_address, propertyId } = req.body || {};
    const escrow = new ethers.Contract(escrow_address, EscrowAbi, wallet);
    const tx = await escrow.cancel(asBn(propertyId));
    const rcpt = await tx.wait();
    res.json({ txHash: rcpt.hash });
  } catch (e) {
    res.status(500).json({ error: e?.message || "cancel failed" });
  }
});

module.exports = router;
