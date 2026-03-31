const express = require('express');
const router = express.Router();
const Player = require('../models/Player');
const Category = require('../models/Category');

// Get all players
router.get('/', async (req, res) => {
  try {
    const players = await Player.find()
      .populate('category', 'name basePrice increment color order')
      .populate('originalCategory', 'name basePrice increment color order')
      .populate('team', 'name color');
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single player
router.get('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id)
      .populate('category')
      .populate('team', 'name color');
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create player
router.post('/', async (req, res) => {
  try {
    const category = await Category.findById(req.body.category);
    if (!category) return res.status(400).json({ error: 'Category not found' });

    const player = new Player({
      ...req.body,
      originalCategory: req.body.category,
      basePrice: req.body.basePrice !== undefined ? req.body.basePrice : category.basePrice,
      currentPrice: 0,
    });
    await player.save();
    req.io.emit('players:updated');
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update player
router.put('/:id', async (req, res) => {
  try {
    const player = await Player.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('category')
      .populate('team', 'name color');
    req.io.emit('players:updated');
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete player
router.delete('/:id', async (req, res) => {
  try {
    await Player.findByIdAndDelete(req.params.id);
    req.io.emit('players:updated');
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign captain to team
router.post('/:id/set-captain', async (req, res) => {
  try {
    const { teamId } = req.body;
    const player = await Player.findById(req.params.id).populate('category');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Update player
    player.isCapt = true;
    player.status = 'sold';
    player.team = teamId;
    await player.save();

    // Update team
    const Team = require('../models/Team');
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    team.captain = player._id;
    if (!team.playersBought.includes(player._id)) {
      team.playersBought.push(player._id);
    }
    await team.save();

    req.io.emit('players:updated');
    req.io.emit('teams:updated');
    res.json({ player, team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;