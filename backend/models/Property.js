const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  seller_name: { type: String, required: true },
  seller_address: {
  type: String,
  required: true,
  lowercase: true,
  trim: true,
  match: [/^0x[a-fA-F0-9]{40}$/, 'Seller address must be 0x followed by 40 hex chars (42 total)'],},
  num_of_rooms: { type: Number, required: true },
  num_of_bedroom: { type: Number, required: true },
  location: { type: String, required: true },
  price_in_ETH: { type: Number, required: true },
  imageURL: { type: String, required: true },
}, { collection: 'property' });

module.exports = mongoose.model('Property', propertySchema);
