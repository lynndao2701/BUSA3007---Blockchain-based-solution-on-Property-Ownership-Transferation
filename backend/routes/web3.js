const express = require('express');
const { ethers } = require('ethers');
const Property = require('../models/Property');

const router = express.Router();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

router.post('/verify', async (req, res) => {
  try {
    const { txHash, propertyId, from } = req.body;
    if (!txHash || !propertyId) return res.status(400).json({ error: 'txHash and propertyId are required' });

    // Load property from DB
    const prop = await Property.findById(propertyId).lean();
    if (!prop) return res.status(404).json({ error: 'Property not found' });
    if (!prop.seller_address) return res.status(400).json({ error: 'Seller address missing for property' });

    const expectedTo = prop.seller_address.toLowerCase();
    const expectedEth = Number(prop.price_in_ETH);

    // Confirm transaction on Linea
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 59144) { // Linea Mainnet
      return res.status(400).json({ error: 'Wrong network (expect Linea mainnet)' });
    }

    const tx = await provider.getTransaction(txHash);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const receipt = await provider.waitForTransaction(txHash, 1, 60_000);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Transaction not confirmed or failed' });
    }

    // Validate sender, recipient, and amount
    const toAddr = (tx.to || '').toLowerCase();
    const fromAddr = (tx.from || '').toLowerCase();
    const valEth = Number(ethers.formatEther(tx.value));

    if (toAddr !== expectedTo)
      return res.status(400).json({ error: 'Recipient mismatch (wrong seller)' });
    if (from && fromAddr !== from.toLowerCase())
      return res.status(400).json({ error: 'Sender mismatch' });
    if (valueEth !== expectedEth)
      return res.status(400).json({ error: 'Amount mismatch' });

    // TODO: mark booking paid / create Payment record
    // await Payment.create({ propertyId, from: fromAddr, to: toAddr, valueEth: valEth, txHash });

    res.json({
      ok: true,
      txHash,
      from: fromAddr,
      to: toAddr,
      valueEth,
      message: 'Transaction verified successfully',
    });
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ error: 'Server verification failed' });
  }
});

module.exports = router;