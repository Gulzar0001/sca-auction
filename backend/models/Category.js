const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  basePrice: { type: Number, required: true },
  increment: { type: Number, required: true },
  color: { type: String, default: '#FFD700' },
  order: { type: Number, default: 0 } // 1=Platinum, 2=Diamond, 3=Gold
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
