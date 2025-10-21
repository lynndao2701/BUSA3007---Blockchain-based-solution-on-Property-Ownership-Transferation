const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  password: { type: String, required: true },                 // bcrypt hash
  wallet_address: {                                           // optional at register; set later
    type: String,
    lowercase: true,
    trim: true,
    match: [/^0x[a-fA-F0-9]{40}$/, 'Wallet must be 0x + 40 hex'],
  },
  wallet_verified: { type: Boolean, default: false },// after signature check
  wallet_nonce: { type: String, default: '' },       // random string for SIWE-like verification
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
