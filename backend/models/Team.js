const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────
// Team Schema
// Added maxDiamondSlots / maxGoldSlots so slot limits are
// configurable per team rather than hardcoded in the route.
// Defaults match your original rules (3 diamond, 2 gold).
// ─────────────────────────────────────────────────────────────
const teamSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  color:  { type: String, default: '#3b82f6' },
  logo:   { type: String },

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

  // Slot tracking
  platSlotFilled:   { type: Boolean, default: false },   // max 1 plat per team
  diamondSlotsFilled: { type: Number, default: 0 },
  goldSlotsFilled:    { type: Number, default: 0 },

  // Configurable slot maximums
  maxDiamondSlots: { type: Number, default: 2 },   // adjust per your rules
  maxGoldSlots:    { type: Number, default: 3 },   // adjust per your rules
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);