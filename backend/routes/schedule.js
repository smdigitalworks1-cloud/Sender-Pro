const express = require('express');
const cron = require('node-cron');
const protect = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  res.json(await Schedule.find({ userId: req.user._id }).sort({ createdAt: -1 }));
});

router.post('/', protect, async (req, res) => {
  const { name, message, contacts, targetGroups, mediaUrl, cronExpr, isRecurring, scheduledAt } = req.body;

  if (isRecurring && cronExpr && !cron.validate(cronExpr))
    return res.status(400).json({ message: 'Invalid cron expression' });

  const schedule = await Schedule.create({
    userId: req.user._id,
    isSuper: req.user.role === 'superadmin',
    name, message, contacts, targetGroups, mediaUrl, cronExpr, isRecurring, scheduledAt
  });
  const startScheduleCron = req.app.get('startScheduleCron');
  if (startScheduleCron) startScheduleCron(schedule);
  res.status(201).json(schedule);
});

router.put('/:id', protect, async (req, res) => {
  const schedule = await Schedule.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true }
  );
  if (!schedule) return res.status(404).json({ message: 'Not found' });
  const startScheduleCron = req.app.get('startScheduleCron');
  if (startScheduleCron) startScheduleCron(schedule);
  res.json(schedule);
});

router.patch('/:id/toggle', protect, async (req, res) => {
  const schedule = await Schedule.findOne({ _id: req.params.id, userId: req.user._id });
  if (!schedule) return res.status(404).json({ message: 'Not found' });
  schedule.active = !schedule.active;
  await schedule.save();
  const startScheduleCron = req.app.get('startScheduleCron');
  if (startScheduleCron) startScheduleCron(schedule);
  res.json(schedule);
});

router.delete('/:id', protect, async (req, res) => {
  const activeCrons = req.app.get('activeCrons');
  if (activeCrons?.[req.params.id]) {
    if (typeof activeCrons[req.params.id].stop === 'function') activeCrons[req.params.id].stop();
    else clearTimeout(activeCrons[req.params.id]);
    delete activeCrons[req.params.id];
  }
  await Schedule.deleteOne({ _id: req.params.id, userId: req.user._id });
  res.json({ message: 'Deleted. Any in-progress message batch will finish sending.' });
});

module.exports = router;
