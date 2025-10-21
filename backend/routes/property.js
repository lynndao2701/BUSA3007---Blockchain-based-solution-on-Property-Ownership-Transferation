// routes/property.js
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const authenticateUser = require('../middleware/authMiddleware');
const { ethers } = require('ethers'); // for wallet validation

// CREATE a new property (seller must have wallet saved)
router.post('/create', authenticateUser, async (req, res) => {
  try {
    // Normalize & verify wallet from authenticated user profile
    const rawWallet = (req.user.wallet_address ?? '').toString().trim();
    let normalizedWallet;
    try {
      normalizedWallet = ethers.getAddress(rawWallet).toLowerCase(); // throws if invalid
    } catch {
      return res.status(400).json({ error: 'Seller wallet on profile is not a valid 42-char address' });
    }

    // Pull body and normalize
    let { seller_name, num_of_rooms, num_of_bedroom, location, price_in_ETH, imageUrl, imageURL } = req.body;

    seller_name = (seller_name ?? req.user.name ?? req.user.email ?? '').toString().trim();
    location    = (location ?? '').toString().trim();

    // accept either key, strip accidental trailing punctuation
    let finalImageUrl = (imageUrl || imageURL || '').toString().trim().replace(/[.,]+$/, '');

    num_of_rooms   = Number(num_of_rooms);
    num_of_bedroom = Number(num_of_bedroom);
    price_in_ETH   = Number(price_in_ETH);

    // Validate fields
    if (!seller_name || !location || !finalImageUrl) {
      return res.status(422).json({ error: 'seller_name, location, imageUrl are required' });
    }
    if (!/^https?:\/\/.+/i.test(finalImageUrl)) {
      return res.status(422).json({ error: 'imageUrl must start with http(s)://' });
    }
    if (!Number.isFinite(num_of_rooms) || !Number.isFinite(num_of_bedroom) || !Number.isFinite(price_in_ETH)) {
      return res.status(422).json({ error: 'num_of_rooms, num_of_bedroom, price_in_ETH must be numbers' });
    }
    if (price_in_ETH <= 0) {
      return res.status(422).json({ error: 'price_in_ETH must be > 0' });
    }
    if (!req.user.wallet_address) {
      return res.status(400).json({ error: 'Connect wallet first (wallet_address missing on profile)' });
    }
    try {
      // normalize & validate 0x…
      req.user.wallet_address = ethers.getAddress(req.user.wallet_address);
    } catch {
      return res.status(400).json({ error: 'Invalid wallet address on profile' });
    }
    if (!req.user.wallet_verified) {
      return res.status(403).json({ error: 'Verify wallet signature first' });
    }

    // Create — IMPORTANT: match your schema’s field name exactly.
    const created = await Property.create({
      seller_name,
      seller_address: normalizedWallet,
      num_of_rooms,
      num_of_bedroom,
      location,
      price_in_ETH,
      imageURL: finalImageUrl,   // <- if your schema uses imageURL
      // imageUrl: finalImageUrl, // <- use this instead if your schema uses camelCase
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error('Create property error:', e);
    return res.status(400).json({ error: e?.message || 'Create failed' });
  }
});

// LIST properties
router.get('/list', async (req, res) => {
  try {
    const { page = 1, limit = 24 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Property.find().sort({ _id: -1 }).skip(skip).limit(Number(limit)),
      Property.countDocuments(),
    ]);

    res.json({ page: Number(page), limit: Number(limit), total, items });
  } catch (e) {
    console.error('List properties error:', e);
    res.status(500).json({ error: 'Failed to load properties' });
  }
});

// UPDATE property (seller only): allow changing price and/or image
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const propId = req.params.id;
    const prop = await Property.findById(propId);
    if (!prop) return res.status(404).json({ error: 'Property not found' });

    if (!req.user?.wallet_address) {
      return res.status(401).json({ error: 'Login & connect wallet first' });
    }

    // Only the seller can edit the property
    if (String(prop.seller_address).toLowerCase() !== String(req.user.wallet_address).toLowerCase()) {
      return res.status(403).json({ error: 'Only the seller can edit this property' });
    }

    let { imageUrl, imageURL, price_in_ETH } = req.body;
    const updates = {};

    // update price
    if (price_in_ETH !== undefined) {
      const n = Number(price_in_ETH);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(422).json({ error: 'price_in_ETH must be a number > 0' });
      }
      updates.price_in_ETH = n;
    }

    // update image (accept either key; trim & strip trailing punctuation)
    const incomingUrl = (imageUrl || imageURL || '').toString().trim().replace(/[.,]+$/, '');
    if (incomingUrl) {
      if (!/^https?:\/\/.+/i.test(incomingUrl)) {
        return res.status(422).json({ error: 'imageUrl must start with http(s)://' });
      }
      // IMPORTANT: write to the exact schema key you use (imageURL)
      updates.imageURL = incomingUrl; // change to imageUrl if your schema uses camelCase
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await Property.findByIdAndUpdate(propId, { $set: updates }, { new: true });
    res.json({ ok: true, property: updated });
  } catch (e) {
    console.error('Update property error:', e);
    res.status(400).json({ error: e?.message || 'Update failed' });
  }
});

// Keep this if you still want a URL-only endpoint
router.put('/:id/image', authenticateUser, async (req, res) => {
  try {
    const propId = req.params.id;
    const { imageUrl, imageURL } = req.body;

    let finalUrl = (imageUrl || imageURL || '').toString().trim().replace(/[.,]+$/, '');
    if (!finalUrl) return res.status(422).json({ error: 'imageUrl is required' });
    if (!/^https?:\/\/.+/i.test(finalUrl)) {
      return res.status(422).json({ error: 'imageUrl must start with http(s)://' });
    }

    const prop = await Property.findById(propId);
    if (!prop) return res.status(404).json({ error: 'Property not found' });

    if (!req.user?.wallet_address) {
      return res.status(401).json({ error: 'Login & connect wallet first' });
    }
    if (String(prop.seller_address).toLowerCase() !== String(req.user.wallet_address).toLowerCase()) {
      return res.status(403).json({ error: 'Only the seller can edit this property' });
    }

    prop.imageURL = finalUrl; // or imageUrl if schema uses camelCase
    await prop.save();
    res.json({ ok: true, property: prop });
  } catch (e) {
    console.error('Update image error:', e);
    res.status(400).json({ error: e?.message || 'Update failed' });
  }
});

module.exports = router;
