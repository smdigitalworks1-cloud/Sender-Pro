const express = require('express');
const protect = require('../middleware/auth');
const { Contact, Campaign, AutoReply, Schedule } = require('../models');
const router = express.Router();

router.get('/stats', protect, async (req, res) => {
  try {
    const uid = req.user._id;
    const [contacts, campaignStats, autoreplies, schedules] = await Promise.all([
      Contact.countDocuments({ userId: uid }),
      Campaign.aggregate([
        { $match: { userId: uid } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sent: { $sum: { $ifNull: ['$sent', 0] } },
            failed: { $sum: { $ifNull: ['$failed', 0] } },
            running: { $sum: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
      ]),
      AutoReply.countDocuments({ userId: uid, active: true }),
      Schedule.countDocuments({ userId: uid, active: true }),
    ]);

    const stats = campaignStats[0] || { total: 0, sent: 0, failed: 0, running: 0, completed: 0 };

    res.json({
      contacts,
      campaigns: stats.total,
      totalSent: stats.sent,
      totalFailed: stats.failed,
      running: stats.running,
      completed: stats.completed,
      autoreplies,
      schedules,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
