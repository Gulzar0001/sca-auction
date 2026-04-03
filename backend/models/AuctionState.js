const mongoose = require('mongoose');

const auctionStateSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global', unique: true },

  // Current player being auctioned
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  currentBid:    { type: Number, default: 0 },
  currentTeam:   { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  // Round tracking
  // Round 1 sequence : wildcard-plat → plat → wildcard-diamond → diamond → gold
  // Round 2+ sequence: wildcard-diamond → diamond → gold
  roundPhase: {
    type: String,
    enum: ['wildcard-plat', 'plat', 'wildcard-diamond', 'diamond', 'gold', 'complete', 'idle'],
    default: 'idle',
  },
  roundNumber: { type: Number, default: 1 },

  // Auction status
  status: {
    type: String,
    enum: ['idle', 'live', 'sold', 'unsold', 'complete'],
    default: 'idle',
  },

  // Timer
  timerSeconds: { type: Number, default: 15 },
  timerActive:  { type: Boolean, default: false },

  // Wild Card round state
  wcActive:   { type: Boolean, default: false },
  wcTeam:     { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  wcPlayer:   { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  rtmPending: { type: Boolean, default: false },
  rtmTeam:    { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  rtmUsed:    { type: Boolean, default: false },

  // Queue for current phase (ordered list of player IDs)
  currentQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  queueIndex:   { type: Number, default: 0 },

  // Bid history for current player
  bidHistory: [{
    team:      { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    amount:    Number,
    timestamp: { type: Date, default: Date.now },
  }],

  // Tracks which teams have already bought in the current category phase.
  // Cleared on every phase transition.
  // Enforces "1 player per team per category per round" and drives auto-advance.
  teamsBoughtThisPhase: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],

}, { timestamps: true });

module.exports = mongoose.model('AuctionState', auctionStateSchema);