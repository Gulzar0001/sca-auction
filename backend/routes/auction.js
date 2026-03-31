const express = require('express');
const router = express.Router();
const AuctionState = require('../models/AuctionState');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Category = require('../models/Category');

// Helper: get or create singleton auction state
async function getState() {
  let state = await AuctionState.findOne({ singleton: 'global' })
    .populate({ path: 'currentPlayer', populate: { path: 'category', select: 'name basePrice increment color order' } })
    .populate('currentTeam', 'name color')
    .populate('wcTeam', 'name color')
    .populate('wcPlayer', 'name role category')
    .populate('rtmTeam', 'name color');
  if (!state) {
    state = new AuctionState({ singleton: 'global' });
    await state.save();
  }
  return state;
}

// Helper: emit full state
async function emitState(io) {
  const state = await getState();
  const teams = await Team.find()
    .populate({ path: 'playersBought', populate: { path: 'category', select: 'name color order' } })
    .populate('captain', 'name role');
  io.emit('auction:update', { state, teams });
}

// Helper: get categories sorted by order
async function getCategories() {
  const categories = await Category.find().sort({ order: 1 });
  return {
    platCat:    categories.find(c => c.order === 1),
    diamondCat: categories.find(c => c.order === 2),
    goldCat:    categories.find(c => c.order === 3),
  };
}

// Helper: build queue for a given round phase + round number
// Round 1: plat → diamond → gold
// Round 2+: diamond → gold (plat skipped, demoted plats enter diamond pool)
async function buildQueue(roundPhase, roundNumber) {
  const { platCat, diamondCat, goldCat } = await getCategories();
  let players = [];

  if (roundPhase === 'plat') {
    // ALL pending platinum players go into the queue.
    // The 1-per-team slot limit is enforced during bidding via checkSlotAvailability.
    // Once all teams fill their plat slot, remaining plat players go unsold
    // and get demoted to diamond at the end of this phase.
    players = await Player.find({
      originalCategory: platCat._id,
      isCapt: false,
      status: 'pending',
    });

  } else if (roundPhase === 'diamond') {
    if (roundNumber === 1) {
      // Round 1: original diamonds only — demoted plats do NOT appear yet
      players = await Player.find({
        originalCategory: diamondCat._id,
        isCapt: false,
        status: 'pending',
      });
    } else {
      // Round 2+: original diamonds (pending/unsold) + demoted plats eligible this round
      players = await Player.find({
        isCapt: false,
        $or: [
          {
            originalCategory: diamondCat._id,
            status: { $in: ['pending', 'unsold'] },
          },
          {
            originalCategory: platCat._id,
            status: 'unsold',
            demotionCount: { $gt: 0 },
            roundEligible: { $lte: roundNumber },
          },
        ],
      });
    }

  } else if (roundPhase === 'gold') {
    if (roundNumber === 1) {
      players = await Player.find({
        originalCategory: goldCat._id,
        isCapt: false,
        status: 'pending',
      });
    } else {
      // Round 2+: pending + unsold golds
      players = await Player.find({
        originalCategory: goldCat._id,
        isCapt: false,
        status: { $in: ['pending', 'unsold'] },
      });
    }
  }

  // Shuffle
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  return players.map(p => p._id);
}

// Helper: determine next phase
// Round 1 sequence: wildcard-plat → plat → wildcard-diamond → diamond → gold
// Round 2+ sequence: wildcard-diamond → diamond → gold (no plat)
// After gold: check if more players remain → next round, else complete
async function determineNextPhase(currentPhase, currentRound) {
  const { platCat, diamondCat, goldCat } = await getCategories();

  const sequenceR1 = ['wildcard-plat', 'plat', 'wildcard-diamond', 'diamond', 'gold'];
  const sequenceR2 = ['wildcard-diamond', 'diamond', 'gold'];

  const sequence = currentRound === 1 ? sequenceR1 : sequenceR2;
  const idx = sequence.indexOf(currentPhase);

  // More phases left in this round
  if (idx !== -1 && idx < sequence.length - 1) {
    return { phase: sequence[idx + 1], round: currentRound };
  }

  // End of round — check if next round needed
  const nextRound = currentRound + 1;

  const unsoldDiamond = await Player.countDocuments({
    isCapt: false,
    $or: [
      { originalCategory: diamondCat._id, status: { $in: ['pending', 'unsold'] } },
      {
        originalCategory: platCat._id,
        status: 'unsold',
        demotionCount: { $gt: 0 },
        roundEligible: { $lte: nextRound },
      },
    ],
  });

  const unsoldGold = await Player.countDocuments({
    originalCategory: goldCat._id,
    isCapt: false,
    status: { $in: ['pending', 'unsold'] },
  });

  if (unsoldDiamond > 0 || unsoldGold > 0) {
    // Round 2+ starts at wildcard-diamond, no plat phase
    return { phase: 'wildcard-diamond', round: nextRound };
  }

  return { phase: 'complete', round: currentRound };
}

// Helper: demote unsold platinum players at end of plat phase
// Sets roundEligible = currentRound + 1 so they only appear in the NEXT round's diamond pool
async function demoteUnsoldPlatinums(currentRound) {
  const { platCat, diamondCat } = await getCategories();

  const unsoldPlats = await Player.find({
    originalCategory: platCat._id,
    isCapt: false,
    status: 'unsold',
    demotionCount: 0,
  });

  for (const p of unsoldPlats) {
    p.category = diamondCat._id;
    p.basePrice = diamondCat.basePrice;
    p.status = 'unsold';             // stays unsold; re-enters pool next round
    p.demotionCount = 1;
    p.roundEligible = currentRound + 1; // key: only eligible from next round onwards
    await p.save();
  }

  return unsoldPlats.length;
}

// Helper: check slot availability for a team bidding on a player
function checkSlotAvailability(team, player, roundPhase) {
  if (roundPhase === 'plat' || roundPhase === 'wildcard-plat') {
    if (team.platSlotFilled) return `${team.name} already has their Platinum player`;
  } else if (roundPhase === 'diamond' || roundPhase === 'wildcard-diamond') {
    const maxDiamond = team.maxDiamondSlots || 2;
    if (team.diamondSlotsFilled >= maxDiamond) return `${team.name} already has ${maxDiamond} Diamond players`;
  } else if (roundPhase === 'gold') {
    const maxGold = team.maxGoldSlots || 3;
    if (team.goldSlotsFilled >= maxGold) return `${team.name} already has ${maxGold} Gold players`;
  }
  return null;
}

// GET /api/auction/state
router.get('/state', async (req, res) => {
  try {
    const state = await getState();
    const teams = await Team.find()
      .populate({ path: 'playersBought', populate: { path: 'category', select: 'name color order' } })
      .populate('captain', 'name role');
    res.json({ state, teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/init-rounds — Admin starts the auction (sets up R1)
router.post('/init-rounds', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });
    if (!state) state = new AuctionState({ singleton: 'global' });

    state.roundPhase = 'wildcard-plat';
    state.roundNumber = 1;
    state.status = 'idle';
    state.currentPlayer = null;
    state.currentBid = 0;
    state.currentTeam = null;
    state.wcActive = false;
    state.wcTeam = null;
    state.wcPlayer = null;
    state.rtmPending = false;
    state.rtmTeam = null;
    state.currentQueue = [];
    state.queueIndex = 0;
    state.bidHistory = [];
    await state.save();

    await emitState(req.io);
    res.json({ message: 'Auction initialized', phase: 'wildcard-plat', round: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/advance-round — Admin manually advances to next round/phase
router.post('/advance-round', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });

    // End of plat phase in Round 1: demote unsold platinums
    // They get roundEligible = 2, so they only appear in Round 2's diamond pool
    if (state.roundPhase === 'plat' && state.roundNumber === 1) {
      const demoted = await demoteUnsoldPlatinums(state.roundNumber);
      console.log(`Demoted ${demoted} platinum players → Diamond pool (eligible from Round ${state.roundNumber + 1})`);
    }

    const next = await determineNextPhase(state.roundPhase, state.roundNumber);

    if (next.phase === 'complete') {
      state.roundPhase = 'complete';
      state.status = 'complete';
      state.currentPlayer = null;
      await state.save();
      await emitState(req.io);
      return res.json({ message: 'Auction complete!' });
    }

    const queue = await buildQueue(next.phase, next.round);

    state.roundPhase = next.phase;
    state.roundNumber = next.round;
    state.currentQueue = queue;
    state.queueIndex = 0;
    state.currentPlayer = null;
    state.currentBid = 0;
    state.currentTeam = null;
    state.status = 'idle';
    state.wcActive = false;
    state.wcTeam = null;
    state.wcPlayer = null;
    state.rtmPending = false;
    state.bidHistory = [];
    await state.save();

    await emitState(req.io);
    res.json({ message: `Advanced to ${next.phase} (Round ${next.round})`, queue: queue.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/start-player — Admin picks the next player from queue to auction
router.post('/start-player', async (req, res) => {
  try {
    const { playerId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' });

    let player;
    if (playerId) {
      player = await Player.findById(playerId).populate('category');
    } else {
      if (state.queueIndex >= state.currentQueue.length) {
        return res.status(400).json({ error: 'No more players in queue for this phase' });
      }
      player = await Player.findById(state.currentQueue[state.queueIndex]).populate('category');
      state.queueIndex += 1;
    }

    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.status = 'live';
    player.currentPrice = player.basePrice;
    await player.save();

    state.currentPlayer = player._id;
    state.currentBid = player.basePrice;
    state.currentTeam = null;
    state.status = 'live';
    state.timerActive = true;
    state.bidHistory = [];
    await state.save();

    await emitState(req.io);
    res.json({ message: 'Player started', player });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/bid — Team places bid
router.post('/bid', async (req, res) => {
  try {
    const { teamId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' })
      .populate({ path: 'currentPlayer', populate: { path: 'category' } });

    if (state.status !== 'live') return res.status(400).json({ error: 'No active auction' });
    if (!state.currentPlayer) return res.status(400).json({ error: 'No player being auctioned' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const player = state.currentPlayer;
    const category = player.category;
    const newBid = state.currentBid + category.increment;

    if (team.purseRemaining < newBid) {
      return res.status(400).json({ error: `Insufficient purse. ${team.name} has ${team.purseRemaining} pts, bid requires ${newBid}` });
    }

    const slotError = checkSlotAvailability(team, player, state.roundPhase);
    if (slotError) return res.status(400).json({ error: slotError });

    state.currentBid = newBid;
    state.currentTeam = teamId;
    state.timerActive = true;
    state.bidHistory.push({ team: teamId, amount: newBid });
    await state.save();

    await emitState(req.io);
    req.io.emit('auction:bid', { team: team.name, amount: newBid });

    res.json({ message: 'Bid placed', newBid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/sold — Admin marks current player as SOLD
router.post('/sold', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' })
      .populate({ path: 'currentPlayer', populate: { path: 'category' } });

    if (!state.currentPlayer || !state.currentTeam) {
      return res.status(400).json({ error: 'No active bid to finalize' });
    }

    const player = await Player.findById(state.currentPlayer._id).populate('category');
    const team = await Team.findById(state.currentTeam);

    team.purseRemaining -= state.currentBid;
    team.playersBought.push(player._id);

    const roundPhase = state.roundPhase;
    if (roundPhase === 'plat' || roundPhase === 'wildcard-plat') {
      team.platSlotFilled = true;
    } else if (roundPhase === 'diamond' || roundPhase === 'wildcard-diamond') {
      team.diamondSlotsFilled += 1;
    } else if (roundPhase === 'gold') {
      team.goldSlotsFilled += 1;
    }

    await team.save();

    player.status = 'sold';
    player.team = team._id;
    player.currentPrice = state.currentBid;
    await player.save();

    state.status = 'sold';
    state.timerActive = false;
    await state.save();

    req.io.emit('player:sold', {
      player: { name: player.name, id: player._id },
      team: { name: team.name, id: team._id },
      price: state.currentBid,
    });

    await emitState(req.io);
    res.json({ message: `${player.name} SOLD to ${team.name} for ${state.currentBid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/unsold — Admin marks current player as UNSOLD
router.post('/unsold', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });

    if (!state.currentPlayer) return res.status(400).json({ error: 'No active player' });

    const player = await Player.findById(state.currentPlayer);
    player.status = 'unsold';
    player.currentPrice = 0;
    player.team = null;
    await player.save();

    state.status = 'unsold';
    state.currentTeam = null;
    state.timerActive = false;
    await state.save();

    req.io.emit('player:unsold', { player: { name: player.name, id: player._id } });
    await emitState(req.io);
    res.json({ message: `${player.name} marked as unsold` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/wildcard — Team declares Wild Card on a player (UNCHANGED)
router.post('/wildcard', async (req, res) => {
  try {
    const { teamId, playerId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' });

    if (!['wildcard-plat', 'wildcard-diamond'].includes(state.roundPhase)) {
      return res.status(400).json({ error: 'Not in a Wild Card round' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.wildCardUsed) return res.status(400).json({ error: `${team.name} has already used their Wild Card` });

    const player = await Player.findById(playerId).populate('category');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    if (state.roundPhase === 'wildcard-plat') {
      if (player.category.order === 1) return res.status(400).json({ error: 'Cannot Wild Card a Platinum player in Platinum round' });
    } else if (state.roundPhase === 'wildcard-diamond') {
      if (player.category.order !== 3) return res.status(400).json({ error: 'In Diamond Wild Card round, can only pick Gold players' });
    }

    const categories = await Category.find().sort({ order: 1 });
    const targetCat = state.roundPhase === 'wildcard-plat'
      ? categories.find(c => c.order === 1)
      : categories.find(c => c.order === 2);

    player.currentPrice = targetCat.basePrice;
    player.status = 'live';
    await player.save();

    state.wcActive = true;
    state.wcTeam = teamId;
    state.wcPlayer = playerId;
    state.currentPlayer = playerId;
    state.currentBid = targetCat.basePrice;
    state.currentTeam = teamId;
    state.rtmPending = true;
    state.status = 'live';
    await state.save();

    req.io.emit('auction:wildcard', {
      team: team.name,
      player: player.name,
      basePrice: targetCat.basePrice,
      roundPhase: state.roundPhase,
    });

    await emitState(req.io);
    res.json({ message: `Wild Card declared by ${team.name} on ${player.name}`, basePrice: targetCat.basePrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/rtm — Other team uses Right to Match (UNCHANGED)
router.post('/rtm', async (req, res) => {
  try {
    const { teamId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' })
      .populate({ path: 'currentPlayer', populate: { path: 'category' } });

    if (!state.rtmPending) return res.status(400).json({ error: 'No RTM pending' });

    const team = await Team.findById(teamId);
    const player = state.currentPlayer;
    const category = player.category;
    const newBid = state.currentBid + category.increment;

    if (team.purseRemaining < newBid) {
      return res.status(400).json({ error: `Insufficient purse for RTM. ${team.name} has ${team.purseRemaining} pts` });
    }

    state.rtmPending = false;
    state.rtmUsed = true;
    state.rtmTeam = teamId;
    state.currentBid = newBid;
    state.currentTeam = teamId;
    state.bidHistory.push({ team: teamId, amount: newBid });
    await state.save();

    req.io.emit('auction:rtm', { team: team.name, amount: newBid });
    await emitState(req.io);

    res.json({ message: `RTM used by ${team.name}, new bid: ${newBid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/skip-wildcard — Admin skips Wild Card round (UNCHANGED)
router.post('/skip-wildcard', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });
    if (!['wildcard-plat', 'wildcard-diamond'].includes(state.roundPhase)) {
      return res.status(400).json({ error: 'Not in a wildcard phase' });
    }

    const next = await determineNextPhase(state.roundPhase, state.roundNumber);

    if (next.phase === 'complete') {
      state.roundPhase = 'complete';
      state.status = 'complete';
      state.currentPlayer = null;
      await state.save();
      await emitState(req.io);
      return res.json({ message: 'Auction complete!' });
    }

    const queue = await buildQueue(next.phase, next.round);

    state.roundPhase = next.phase;
    state.roundNumber = next.round;
    state.currentQueue = queue;
    state.queueIndex = 0;
    state.wcActive = false;
    state.wcTeam = null;
    state.wcPlayer = null;
    state.rtmPending = false;
    state.status = 'idle';
    state.currentPlayer = null;
    state.currentBid = 0;
    state.currentTeam = null;
    await state.save();

    await emitState(req.io);
    res.json({ message: `Skipped to ${next.phase} (Round ${next.round})` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/reset — Full reset
router.post('/reset', async (req, res) => {
  try {
    const allPlayers = await Player.find({ isCapt: false });
    for (const p of allPlayers) {
      p.category = p.originalCategory;
      p.status = 'pending';
      p.team = null;
      p.currentPrice = 0;
      p.demotionCount = 0;
      p.roundEligible = 1;
      await p.save();
    }

    const teams = await Team.find();
    for (const t of teams) {
      t.purseRemaining = t.initialPurse;
      t.playersBought = [];
      t.wildCardUsed = false;
      t.wildCardPlayer = null;
      t.platSlotFilled = false;
      t.diamondSlotsFilled = 0;
      t.goldSlotsFilled = 0;
      if (t.captain) {
        const cap = await Player.findById(t.captain);
        if (cap) t.playersBought = [cap._id];
      }
      await t.save();
    }

    await AuctionState.findOneAndUpdate({ singleton: 'global' }, {
      roundPhase: 'idle',
      roundNumber: 1,
      status: 'idle',
      currentPlayer: null,
      currentBid: 0,
      currentTeam: null,
      wcActive: false,
      wcTeam: null,
      wcPlayer: null,
      rtmPending: false,
      rtmTeam: null,
      currentQueue: [],
      queueIndex: 0,
      bidHistory: [],
      timerActive: false,
    });

    req.io.emit('auction:reset');
    await emitState(req.io);
    res.json({ message: 'Auction reset complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auction/available-players — players available for wildcard picking (UNCHANGED)
router.get('/available-players', async (req, res) => {
  try {
    const state = await AuctionState.findOne({ singleton: 'global' });
    const { diamondCat, goldCat } = await getCategories();

    let query = { status: 'pending', isCapt: false };

    if (state?.roundPhase === 'wildcard-plat') {
      query.category = { $in: [diamondCat._id, goldCat._id] };
    } else if (state?.roundPhase === 'wildcard-diamond') {
      query.category = goldCat._id;
    }

    const players = await Player.find(query).populate('category', 'name color order basePrice');
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;