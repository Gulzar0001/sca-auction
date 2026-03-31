const mongoose = require('mongoose');

const auctionStateSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global', unique: true },

  // Current player being auctioned
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  currentBid: { type: Number, default: 0 },
  currentTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  // Round tracking
  // roundPhase: 'wildcard-plat' | 'plat' | 'wildcard-diamond' | 'diamond' | 'gold' | 'complete' | 'idle'
  // Round 1 sequence: wildcard-plat → plat → wildcard-diamond → diamond → gold
  // Round 2+ sequence: wildcard-diamond → diamond → gold  (no plat phase)
  roundPhase: {
    type: String,
    enum: ['wildcard-plat', 'plat', 'wildcard-diamond', 'diamond', 'gold', 'complete', 'idle'],
    default: 'idle'
  },
  roundNumber: { type: Number, default: 1 },

  // Auction status
  status: { type: String, enum: ['idle', 'live', 'sold', 'unsold', 'complete'], default: 'idle' },

  // Timer
  timerSeconds: { type: Number, default: 15 },
  timerActive: { type: Boolean, default: false },

  // Wild Card round state
  wcActive: { type: Boolean, default: false },
  wcTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  wcPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  rtmPending: { type: Boolean, default: false },
  rtmTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  // Queue for current phase (ordered list of player IDs)
  currentQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  queueIndex: { type: Number, default: 0 },

  // Bid history for current player
  bidHistory: [{
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    amount: Number,
    timestamp: { type: Date, default: Date.now }
  }],

  rtmUsed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('AuctionState', auctionStateSchema);