const express = require('express');
const router = express.Router();
const Team = require('../models/Team');

// Get all teams
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('playersBought', 'name role category status currentPrice')
      .populate('captain', 'name role');
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single team
router.get('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate({ path: 'playersBought', populate: { path: 'category', select: 'name color' } })
      .populate('captain', 'name role');
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create team
router.post('/', async (req, res) => {
  try {
    const team = new Team({
      ...req.body,
      purseRemaining: req.body.initialPurse,
    });
    await team.save();
    req.io.emit('teams:updated');
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update team
router.put('/:id', async (req, res) => {
  try {
    // If initialPurse is updated, also update purseRemaining proportionally
    const existing = await Team.findById(req.params.id);
    if (req.body.initialPurse && existing) {
      const spent = existing.initialPurse - existing.purseRemaining;
      req.body.purseRemaining = req.body.initialPurse - spent;
    }
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true });
    req.io.emit('teams:updated');
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete team
router.delete('/:id', async (req, res) => {
  try {
    await Team.findByIdAndDelete(req.params.id);
    req.io.emit('teams:updated');
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
