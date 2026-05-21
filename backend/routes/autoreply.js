const express = require('express');
const protect = require('../middleware/auth');
const { AutoReply } = require('../models');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const rules = await AutoReply.find({ userId: req.user._id }).sort({ order: 1 });
    res.json(rules);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    const { trigger, triggerType, response, mediaUrl, order, delayHours } = req.body;
    const rule = await AutoReply.create({ userId: req.user._id, trigger, triggerType, response, mediaUrl, order, delayHours });
    res.status(201).json(rule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const rule = await AutoReply.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );
    if (!rule) return res.status(404).json({ message: 'Not found' });
    res.json(rule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.patch('/:id/toggle', protect, async (req, res) => {
  try {
    const rule = await AutoReply.findOne({ _id: req.params.id, userId: req.user._id });
    if (!rule) return res.status(404).json({ message: 'Not found' });
    rule.active = !rule.active;
    await rule.save();
    res.json(rule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await AutoReply.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
