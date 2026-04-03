const express = require('express');
const router  = express.Router();
const AuctionState = require('../models/AuctionState');
const Player       = require('../models/Player');
const Team         = require('../models/Team');
const Category     = require('../models/Category');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getState() {
  let state = await AuctionState.findOne({ singleton: 'global' })
    .populate({
      path: 'currentPlayer',
      populate: { path: 'category', select: 'name basePrice increment color order' },
    })
    .populate('currentTeam', 'name color')
    .populate('wcTeam',      'name color')
    .populate('wcPlayer',    'name role category')
    .populate('rtmTeam',     'name color');

  if (!state) {
    state = new AuctionState({ singleton: 'global' });
    await state.save();
  }
  return state;
}

async function emitState(io) {
  const state = await getState();
  const teams = await Team.find()
    .populate({ path: 'playersBought', populate: { path: 'category', select: 'name color order' } })
    .populate('captain', 'name role');
  io.emit('auction:update', { state, teams });
}

async function getCategories() {
  const cats = await Category.find().sort({ order: 1 });
  return {
    platCat:    cats.find(c => c.order === 1),
    diamondCat: cats.find(c => c.order === 2),
    goldCat:    cats.find(c => c.order === 3),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT HELPERS
// All slot logic reads from team fields — zero hardcoding.
// ─────────────────────────────────────────────────────────────────────────────

// Returns true if a team has filled all slots for a given category phase
function isSlotFull(team, phase) {
  if (phase === 'plat')    return team.platSlotsFilled    >= team.maxPlatSlots;
  if (phase === 'diamond') return team.diamondSlotsFilled >= team.maxDiamondSlots;
  if (phase === 'gold')    return team.goldSlotsFilled    >= team.maxGoldSlots;
  return false;
}

// Maps a roundPhase to its base category name for slot checks
function phaseToCategory(roundPhase, playerCategoryOrder) {
  if (roundPhase === 'plat')    return 'plat';
  if (roundPhase === 'diamond') return 'diamond';
  if (roundPhase === 'gold')    return 'gold';

  // Wildcard phases: slot is determined by the player's own category
  if (roundPhase === 'wildcard-plat' || roundPhase === 'wildcard-diamond') {
    if (playerCategoryOrder === 1) return 'plat';
    if (playerCategoryOrder === 2) return 'diamond';
    if (playerCategoryOrder === 3) return 'gold';
  }
  return null;
}

// Returns an error string if the team cannot buy this player, or null if OK
function checkSlotAvailability(team, player, roundPhase) {
  const catPhase = phaseToCategory(roundPhase, player.category?.order);
  if (!catPhase) return 'Unknown phase';

  if (isSlotFull(team, catPhase)) {
    const max =
      catPhase === 'plat'    ? team.maxPlatSlots    :
      catPhase === 'diamond' ? team.maxDiamondSlots :
                               team.maxGoldSlots;
    const label = catPhase.charAt(0).toUpperCase() + catPhase.slice(1);
    return `${team.name} has already filled all ${max} ${label} slot(s) this round`;
  }
  return null;
}

// Increments the correct slot counter on a team document (does NOT save)
function incrementSlot(team, catPhase) {
  if (catPhase === 'plat')    team.platSlotsFilled    += 1;
  if (catPhase === 'diamond') team.diamondSlotsFilled += 1;
  if (catPhase === 'gold')    team.goldSlotsFilled    += 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD QUEUE
// ─────────────────────────────────────────────────────────────────────────────
async function buildQueue(roundPhase, roundNumber) {
  const { platCat, diamondCat, goldCat } = await getCategories();
  let players = [];

  if (roundPhase === 'plat') {
    players = await Player.find({
      originalCategory: platCat._id,
      isCapt: false,
      status: 'pending',
    });

  } else if (roundPhase === 'diamond') {
    if (roundNumber === 1) {
      players = await Player.find({
        originalCategory: diamondCat._id,
        isCapt: false,
        status: 'pending',
      });
    } else {
      players = await Player.find({
        isCapt: false,
        $or: [
          { originalCategory: diamondCat._id, status: { $in: ['pending', 'unsold'] } },
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
      players = await Player.find({
        originalCategory: goldCat._id,
        isCapt: false,
        status: { $in: ['pending', 'unsold'] },
      });
    }
  }

  // Fisher-Yates shuffle
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  return players.map(p => p._id);
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINE NEXT PHASE
// ─────────────────────────────────────────────────────────────────────────────
async function determineNextPhase(currentPhase, currentRound) {
  const { platCat, diamondCat, goldCat } = await getCategories();

  const sequenceR1 = ['wildcard-plat', 'plat', 'wildcard-diamond', 'diamond', 'gold'];
  const sequenceR2 = ['wildcard-diamond', 'diamond', 'gold'];
  const sequence   = currentRound === 1 ? sequenceR1 : sequenceR2;
  const idx        = sequence.indexOf(currentPhase);

  if (idx !== -1 && idx < sequence.length - 1) {
    return { phase: sequence[idx + 1], round: currentRound };
  }

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
    return { phase: 'wildcard-diamond', round: nextRound };
  }

  return { phase: 'complete', round: currentRound };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMOTE UNSOLD PLATINUMS
// ─────────────────────────────────────────────────────────────────────────────
async function demoteUnsoldPlatinums(currentRound) {
  const { platCat, diamondCat } = await getCategories();

  const unsoldPlats = await Player.find({
    originalCategory: platCat._id,
    isCapt: false,
    status: 'unsold',
  });

  for (const p of unsoldPlats) {
    p.category      = diamondCat._id;
    p.basePrice     = diamondCat.basePrice;
    p.currentPrice  = 0;
    p.status        = 'unsold';
    p.demotionCount = (p.demotionCount || 0) + 1;
    p.roundEligible = currentRound + 1;
    await p.save();
  }

  return unsoldPlats.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE COMPLETION CHECK + AUTO-ADVANCE
// A phase is complete when every team has EITHER bought OR has no slots left.
// ─────────────────────────────────────────────────────────────────────────────
async function checkAndAutoAdvancePhase(io, state) {
  if (!['plat', 'diamond', 'gold'].includes(state.roundPhase)) return;

  const teams     = await Team.find();
  const boughtIds = state.teamsBoughtThisPhase.map(id => id.toString());

  const allDone = teams.every(team => {
    if (boughtIds.includes(team._id.toString())) return true;
    return isSlotFull(team, state.roundPhase);
  });

  if (allDone) {
    console.log(`[AUTO-ADVANCE] All teams done in "${state.roundPhase}" phase — advancing`);
    await advancePhase(io, state);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCE PHASE (shared by auto-advance + manual /advance-round endpoint)
// ─────────────────────────────────────────────────────────────────────────────
async function advancePhase(io, state) {
  if (state.roundPhase === 'plat' && state.roundNumber === 1) {
    const demoted = await demoteUnsoldPlatinums(state.roundNumber);
    console.log(`Demoted ${demoted} platinum → diamond (eligible from Round ${state.roundNumber + 1})`);
  }

  const next = await determineNextPhase(state.roundPhase, state.roundNumber);

  if (next.phase === 'complete') {
    state.roundPhase    = 'complete';
    state.status        = 'complete';
    state.currentPlayer = null;
    await state.save();
    await emitState(io);
    io.emit('auction:phase-complete', { message: 'Auction complete!' });
    return;
  }

  const queue = await buildQueue(next.phase, next.round);

  state.roundPhase           = next.phase;
  state.roundNumber          = next.round;
  state.currentQueue         = queue;
  state.queueIndex           = 0;
  state.currentPlayer        = null;
  state.currentBid           = 0;
  state.currentTeam          = null;
  state.status               = 'idle';
  state.wcActive             = false;
  state.wcTeam               = null;
  state.wcPlayer             = null;
  state.rtmPending           = false;
  state.bidHistory           = [];
  state.teamsBoughtThisPhase = [];    // reset per-phase tracker
  await state.save();

  await emitState(io);
  io.emit('auction:phase-advanced', {
    phase:     next.phase,
    round:     next.round,
    queueSize: queue.length,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

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

// POST /api/auction/init-rounds
router.post('/init-rounds', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });
    if (!state) state = new AuctionState({ singleton: 'global' });

    state.roundPhase           = 'wildcard-plat';
    state.roundNumber          = 1;
    state.status               = 'idle';
    state.currentPlayer        = null;
    state.currentBid           = 0;
    state.currentTeam          = null;
    state.wcActive             = false;
    state.wcTeam               = null;
    state.wcPlayer             = null;
    state.rtmPending           = false;
    state.rtmTeam              = null;
    state.currentQueue         = [];
    state.queueIndex           = 0;
    state.bidHistory           = [];
    state.teamsBoughtThisPhase = [];
    await state.save();

    await emitState(req.io);
    res.json({ message: 'Auction initialized', phase: 'wildcard-plat', round: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/advance-round — admin manually forces phase advance
router.post('/advance-round', async (req, res) => {
  try {
    const state = await AuctionState.findOne({ singleton: 'global' });
    await advancePhase(req.io, state);
    res.json({ message: `Advanced to ${state.roundPhase} (Round ${state.roundNumber})` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/start-player
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

    player.status       = 'live';
    player.currentPrice = player.basePrice;
    await player.save();

    state.currentPlayer = player._id;
    state.currentBid    = player.basePrice;
    state.currentTeam   = null;
    state.status        = 'live';
    state.timerActive   = true;
    state.bidHistory    = [];
    await state.save();

    await emitState(req.io);
    res.json({ message: 'Player started', player });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/bid
router.post('/bid', async (req, res) => {
  try {
    const { teamId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' })
      .populate({ path: 'currentPlayer', populate: { path: 'category' } });

    if (state.status !== 'live')  return res.status(400).json({ error: 'No active auction' });
    if (!state.currentPlayer)     return res.status(400).json({ error: 'No player being auctioned' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Increment from the ROUND's category, not the player's own category
    const { platCat, diamondCat, goldCat } = await getCategories();
    let roundCat;
    if      (state.roundPhase === 'plat'    || state.roundPhase === 'wildcard-plat')    roundCat = platCat;
    else if (state.roundPhase === 'diamond' || state.roundPhase === 'wildcard-diamond') roundCat = diamondCat;
    else                                                                                 roundCat = goldCat;

    const newBid = state.currentBid + roundCat.increment;

    if (team.purseRemaining < newBid) {
      return res.status(400).json({
        error: `Insufficient purse. ${team.name} has ${team.purseRemaining} pts, bid requires ${newBid}`,
      });
    }

    const slotError = checkSlotAvailability(team, state.currentPlayer, state.roundPhase);
    if (slotError) return res.status(400).json({ error: slotError });

    // Enforce 1-per-team-per-phase for non-wildcard phases
    if (['plat', 'diamond', 'gold'].includes(state.roundPhase)) {
      const alreadyBought = state.teamsBoughtThisPhase.some(
        id => id.toString() === teamId.toString()
      );
      if (alreadyBought) {
        return res.status(400).json({
          error: `${team.name} has already bought a player in this ${state.roundPhase} phase`,
        });
      }
    }

    state.currentBid  = newBid;
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

// POST /api/auction/sold
router.post('/sold', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' })
      .populate({ path: 'currentPlayer', populate: { path: 'category' } });

    if (!state.currentPlayer || !state.currentTeam) {
      return res.status(400).json({ error: 'No active bid to finalize' });
    }

    const player = await Player.findById(state.currentPlayer._id).populate('category');
    const team   = await Team.findById(state.currentTeam);

    team.purseRemaining -= state.currentBid;
    team.playersBought.push(player._id);

    const phase    = state.roundPhase;
    const catPhase = phaseToCategory(phase, player.category?.order);

    // Increment slot counter (fully dynamic — reads maxPlatSlots etc.)
    incrementSlot(team, catPhase);

    // Wildcard — record usage
    if (phase === 'wildcard-plat' || phase === 'wildcard-diamond') {
      team.wildCardUsed   = true;
      team.wildCardPlayer = player._id;
    }

    await team.save();

    player.status       = 'sold';
    player.team         = team._id;
    player.currentPrice = state.currentBid;
    await player.save();

    state.status      = 'sold';
    state.timerActive = false;

    // Track team as done in this phase (non-wildcard phases)
    if (['plat', 'diamond', 'gold'].includes(phase)) {
      const alreadyTracked = state.teamsBoughtThisPhase.some(
        id => id.toString() === team._id.toString()
      );
      if (!alreadyTracked) state.teamsBoughtThisPhase.push(team._id);
    }

    await state.save();

    req.io.emit('player:sold', {
      player: { name: player.name, id: player._id },
      team:   { name: team.name,   id: team._id   },
      price:  state.currentBid,
    });

    await emitState(req.io);

    // Auto-advance if all teams are done in this phase
    const freshState = await AuctionState.findOne({ singleton: 'global' });
    await checkAndAutoAdvancePhase(req.io, freshState);

    res.json({ message: `${player.name} SOLD to ${team.name} for ${state.currentBid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/unsold
router.post('/unsold', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });
    if (!state.currentPlayer) return res.status(400).json({ error: 'No active player' });

    const player     = await Player.findById(state.currentPlayer).populate('category');
    const currentCat = await Category.findById(player.category._id);

    // Reset price to their current category's base (handles demoted plats correctly)
    player.basePrice    = currentCat.basePrice;
    player.currentPrice = 0;
    player.status       = 'unsold';
    player.team         = null;
    await player.save();

    state.status      = 'unsold';
    state.currentTeam = null;
    state.timerActive = false;
    await state.save();

    req.io.emit('player:unsold', { player: { name: player.name, id: player._id } });
    await emitState(req.io);

    // Auto-advance check after unsold too
    const freshState = await AuctionState.findOne({ singleton: 'global' });
    await checkAndAutoAdvancePhase(req.io, freshState);

    res.json({ message: `${player.name} marked as unsold` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/wildcard
router.post('/wildcard', async (req, res) => {
  try {
    const { teamId, playerId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' });

    if (!['wildcard-plat', 'wildcard-diamond'].includes(state.roundPhase)) {
      return res.status(400).json({ error: 'Not in a Wild Card round' });
    }

    const team = await Team.findById(teamId);
    if (!team)             return res.status(404).json({ error: 'Team not found' });
    if (team.wildCardUsed) return res.status(400).json({ error: `${team.name} has already used their Wild Card` });

    const player = await Player.findById(playerId).populate('category');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    if (state.roundPhase === 'wildcard-plat' && player.category.order === 1) {
      return res.status(400).json({ error: 'Cannot Wild Card a Platinum player in Platinum round' });
    }
    if (state.roundPhase === 'wildcard-diamond' && player.category.order !== 3) {
      return res.status(400).json({ error: 'In Diamond Wild Card round, can only pick Gold players' });
    }

    // Pricing uses the ROUND's category
    const { platCat, diamondCat } = await getCategories();
    const targetCat = state.roundPhase === 'wildcard-plat' ? platCat : diamondCat;

    player.currentPrice = targetCat.basePrice;
    player.status       = 'live';
    await player.save();

    state.wcActive      = true;
    state.wcTeam        = teamId;
    state.wcPlayer      = playerId;
    state.currentPlayer = playerId;
    state.currentBid    = targetCat.basePrice;
    state.currentTeam   = teamId;
    state.rtmPending    = true;
    state.status        = 'live';
    await state.save();

    req.io.emit('auction:wildcard', {
      team:       team.name,
      player:     player.name,
      basePrice:  targetCat.basePrice,
      increment:  targetCat.increment,
      roundPhase: state.roundPhase,
    });

    await emitState(req.io);
    res.json({
      message:   `Wild Card declared by ${team.name} on ${player.name}`,
      basePrice: targetCat.basePrice,
      increment: targetCat.increment,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/rtm
router.post('/rtm', async (req, res) => {
  try {
    const { teamId } = req.body;
    let state = await AuctionState.findOne({ singleton: 'global' })
      .populate({ path: 'currentPlayer', populate: { path: 'category' } });

    if (!state.rtmPending) return res.status(400).json({ error: 'No RTM pending' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Increment from ROUND's category
    const { platCat, diamondCat, goldCat } = await getCategories();
    let roundCat;
    if      (state.roundPhase === 'wildcard-plat')    roundCat = platCat;
    else if (state.roundPhase === 'wildcard-diamond') roundCat = diamondCat;
    else                                              roundCat = goldCat;

    const newBid = state.currentBid + roundCat.increment;

    if (team.purseRemaining < newBid) {
      return res.status(400).json({
        error: `Insufficient purse for RTM. ${team.name} has ${team.purseRemaining} pts`,
      });
    }

    state.rtmPending  = false;
    state.rtmUsed     = true;
    state.rtmTeam     = teamId;
    state.currentBid  = newBid;
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

// POST /api/auction/skip-wildcard
router.post('/skip-wildcard', async (req, res) => {
  try {
    let state = await AuctionState.findOne({ singleton: 'global' });
    if (!['wildcard-plat', 'wildcard-diamond'].includes(state.roundPhase)) {
      return res.status(400).json({ error: 'Not in a wildcard phase' });
    }
    await advancePhase(req.io, state);
    res.json({ message: `Skipped wildcard — advancing` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction/reset
router.post('/reset', async (req, res) => {
  try {
    // Reset all non-captain players to their original category and pending status
    const allPlayers = await Player.find({ isCapt: false });
    for (const p of allPlayers) {
      const origCat  = await Category.findById(p.originalCategory);
      p.category     = p.originalCategory;
      p.basePrice    = origCat ? origCat.basePrice : p.basePrice;
      p.status       = 'pending';
      p.team         = null;
      p.currentPrice = 0;
      p.demotionCount = 0;
      p.roundEligible = 1;
      await p.save();
    }

    // Reset teams — deduct captain base price from purse
    const teams = await Team.find();
    for (const t of teams) {
      t.purseRemaining     = t.initialPurse;
      t.playersBought      = [];
      t.wildCardUsed       = false;
      t.wildCardPlayer     = null;
      t.platSlotsFilled    = 0;
      t.diamondSlotsFilled = 0;
      t.goldSlotsFilled    = 0;

      if (t.captain) {
        const cap = await Player.findById(t.captain);
        if (cap) {
          t.playersBought   = [cap._id];
          t.purseRemaining -= (cap.basePrice || 0);
        }
      }
      await t.save();
    }

    await AuctionState.findOneAndUpdate(
      { singleton: 'global' },
      {
        roundPhase:           'idle',
        roundNumber:          1,
        status:               'idle',
        currentPlayer:        null,
        currentBid:           0,
        currentTeam:          null,
        wcActive:             false,
        wcTeam:               null,
        wcPlayer:             null,
        rtmPending:           false,
        rtmTeam:              null,
        currentQueue:         [],
        queueIndex:           0,
        bidHistory:           [],
        timerActive:          false,
        teamsBoughtThisPhase: [],
      },
      { upsert: true }
    );

    req.io.emit('auction:reset');
    await emitState(req.io);
    res.json({ message: 'Auction reset complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auction/available-players
router.get('/available-players', async (req, res) => {
  try {
    const state = await AuctionState.findOne({ singleton: 'global' });
    const { diamondCat, goldCat } = await getCategories();

    let query = { isCapt: false, status: { $in: ['pending', 'unsold'] } };

    if (state?.roundPhase === 'wildcard-plat') {
      // Diamond and gold players eligible (includes demoted plats whose category=diamond)
      query.category = { $in: [diamondCat._id, goldCat._id] };
    } else if (state?.roundPhase === 'wildcard-diamond') {
      query.category = goldCat._id;
    }

    const players = await Player.find(query)
      .populate('category', 'name color order basePrice increment');
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;