const express = require('express');
const router = express.Router();
const { SupportTicket, User, SuperAdmin } = require('../models');
const protect = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');

// Create a new support ticket (User)
router.post('/', protect, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ message: 'Subject and message are required' });
        }
        const ticket = await SupportTicket.create({
            userId: req.user._id,
            subject,
            message,
            status: 'open'
        });

        // Send Email to Super Admin
        try {
            const user = await User.findById(req.user._id);
            const superAdmin = await SuperAdmin.findOne();
            const supportEmail = superAdmin ? superAdmin.email : 'helpdesk@smdigitalworks.com';

            await sendEmail({
                email: supportEmail,
                replyTo: user ? user.email : undefined,
                subject: `New Support Ticket: ${subject}`,
                message: `New support ticket received from ${user ? user.name : 'Unknown User'} (${user ? user.email : 'Unknown Email'}).\n\nIssue:\n${message}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                      <h2 style="color: #7c3aed;">New Support Ticket Received</h2>
                      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>From User:</strong> ${user ? user.name : 'Unknown'} (${user ? user.email : 'Unknown'})</p>
                        <p style="margin: 5px 0;"><strong>Subject:</strong> ${subject}</p>
                      </div>
                      <h3>Issue Description:</h3>
                      <p style="white-space: pre-wrap; background: #fafafa; padding: 15px; border-left: 4px solid #7c3aed;">${message}</p>
                      <br/>
                      <a href="${process.env.FRONTEND_URL || 'https://senderpro.smdigitalworks.com'}/login" style="display: inline-block; padding: 10px 20px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Admin Portal to Reply</a>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error('Failed to send helpdesk email:', emailErr.message);
        }

        res.status(201).json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get tickets (User gets own, Admin gets all)
router.get('/', protect, async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'superadmin' && !req.user.isAdmin) {
            query.userId = req.user._id;
        }

        const tickets = await SupportTicket.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });
            
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update/Reply to ticket (Admin/Helpdesk)
router.patch('/:id/reply', protect, async (req, res) => {
    try {
        const { adminReply, status } = req.body;

        // Only admins or superadmins can reply
        if (req.user.role !== 'superadmin' && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized to reply to tickets' });
        }

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        if (adminReply !== undefined) ticket.adminReply = adminReply;
        if (status !== undefined) ticket.status = status;

        await ticket.save();
        res.json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Close ticket (User or Admin)
router.patch('/:id/close', protect, async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // User can only close their own ticket
        if (req.user.role !== 'superadmin' && !req.user.isAdmin && ticket.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        ticket.status = 'closed';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
