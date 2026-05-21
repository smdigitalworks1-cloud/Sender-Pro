const express = require('express');
const protect = require('../middleware/auth');
const { Contact, Campaign, AutoReply, Schedule } = require('../models');
const router = express.Router();

router.get('/stats', protect, async (req, res) => {
  try {
    const uid = req.user._id;
    const [contacts, campaigns, autoreplies, schedules] = await Promise.all([
      Contact.countDocuments({ userId: uid }),
      Campaign.find({ userId: uid }),
      AutoReply.countDocuments({ userId: uid, active: true }),
      Schedule.countDocuments({ userId: uid, active: true }),
    ]);
    const totalSent = campaigns.reduce((s, c) => s + (c.sent || 0), 0);
    const totalFailed = campaigns.reduce((s, c) => s + (c.failed || 0), 0);
    const running = campaigns.filter(c => c.status === 'running').length;
    const completed = campaigns.filter(c => c.status === 'completed').length;

    res.json({
      contacts,
      campaigns: campaigns.length,
      totalSent,
      totalFailed,
      running,
      completed,
      autoreplies,
      schedules,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
