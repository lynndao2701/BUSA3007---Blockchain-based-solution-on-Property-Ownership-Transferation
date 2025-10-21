// routes/user.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ethers } = require('ethers');
const authenticateUser = require('../middleware/authMiddleware');
const User = require('../models/User');

// Save / replace wallet (public address only)
router.put('/wallet', authenticateUser, async (req, res) => {
  try {
    const { wallet_address } = req.body;
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address || '')) {
      return res.status(422).json({ error: 'Invalid wallet address' });
    }

    // Save address; reset verification to force a new verify step if changed
    req.user.wallet_address = ethers.getAddress(wallet_address);
    req.user.wallet_verified = false;
    await req.user.save();

    return res.json({ ok: true, wallet_address: req.user.wallet_address, wallet_verified: false });
  } catch (e) {
    console.error('Save wallet error:', e);
    return res.status(500).json({ error: 'Failed to save wallet' });
  }
});

// Get a nonce to sign (prevents replay)
router.get('/wallet/nonce', authenticateUser, async (req, res) => {
  try {
    const nonce = crypto.randomBytes(16).toString('hex');
    req.user.wallet_nonce = nonce;
    await req.user.save();
    return res.json({ nonce });
  } catch (e) {
    console.error('Nonce error:', e);
    return res.status(500).json({ error: 'Failed to create nonce' });
  }
});

// Verify signature -> marks wallet_verified = true
router.post('/wallet/verify', authenticateUser, async (req, res) => {
  try {
    const { signature, message } = req.body;
    if (!signature || !message) return res.status(400).json({ error: 'signature and message are required' });

    const recovered = ethers.verifyMessage(message, signature);
    if (!req.user.wallet_address) return res.status(400).json({ error: 'No wallet saved on profile' });

    // Must match the saved address
    if (ethers.getAddress(recovered) !== ethers.getAddress(req.user.wallet_address)) {
      return res.status(400).json({ error: 'Signature does not match saved wallet' });
    }

    // Must include the last nonce we issued
    if (!req.user.wallet_nonce || !message.includes(req.user.wallet_nonce)) {
      return res.status(400).json({ error: 'Nonce missing or invalid' });
    }

    req.user.wallet_verified = true;
    req.user.wallet_nonce = ''; // one-time use
    await req.user.save();

    return res.json({ ok: true, wallet_address: req.user.wallet_address, wallet_verified: true });
  } catch (e) {
    console.error('Verify wallet error:', e);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
