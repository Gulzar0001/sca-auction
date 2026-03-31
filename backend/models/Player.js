const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  role:     { type: String },
  locality: { type: String },
  image:    { type: String },
  isCapt:   { type: Boolean, default: false },

  // Current active category (changes on demotion)
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

  // Original category — never changes after creation; used to identify demoted plats
  originalCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

  basePrice:    { type: Number, default: 0 },
  currentPrice: { type: Number, default: 0 },

  status: { type: String, enum: ['pending', 'live', 'sold', 'unsold'], default: 'pending' },
  team:   { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  // How many times this player has been demoted (0 = never demoted)
  demotionCount: { type: Number, default: 0 },

  // The round number from which this player is eligible to appear in the auction pool.
  // Default 1 (available from Round 1).
  // Demoted platinum players get roundEligible = currentRound + 1,
  // so they only appear in the NEXT round's diamond pool, not the current one.
  roundEligible: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('Player', playerSchema);