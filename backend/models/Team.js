const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name:  { type: String, required: true },
  color: { type: String, default: '#3b82f6' },
  logo:  { type: String },

  // Purse
  initialPurse:   { type: Number, default: 0 },
  purseRemaining: { type: Number, default: 0 },

  // Captain (pre-assigned, not auctioned)
  captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },

  // Players bought at auction (includes captain)
  playersBought: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],

  // Wild Card
  wildCardUsed:   { type: Boolean, default: false },
  wildCardPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },

  // ── Fully dynamic slot maximums — admin sets these per team ──
  maxPlatSlots:    { type: Number, default: 1 },
  maxDiamondSlots: { type: Number, default: 2 },
  maxGoldSlots:    { type: Number, default: 3 },

  // ── Fill counters — all numeric, no more boolean for plat ──
  platSlotsFilled:    { type: Number, default: 0 },
  diamondSlotsFilled: { type: Number, default: 0 },
  goldSlotsFilled:    { type: Number, default: 0 },

}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);