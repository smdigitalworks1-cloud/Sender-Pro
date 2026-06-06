const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { Project, Automation, AutomationStep, AutomationLog } = require('../models');
const { runAutomation } = require('../utils/automationEngine');

// ========================
// PROJECTS
// ========================

// Get all projects for user
router.get('/projects', protect, async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.user._id })
            .sort({ createdAt: -1 });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create project
router.post('/projects', protect, async (req, res) => {
    try {
        const { name, description } = req.body;
        const project = await Project.create({ userId: req.user._id, name, description });
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
// AUTOMATIONS
// ========================

// Get automations by project
router.get('/projects/:projectId/automations', protect, async (req, res) => {
    try {
        const automations = await Automation.find({ projectId: req.params.projectId, userId: req.user._id })
            .sort({ createdAt: -1 });
        
        // In Mongoose, targetGroups is already an array in our schema, 
        // but we'll ensure it just in case of legacy data or inconsistencies.
        const parsedAutomations = automations.map(a => {
            const autoObj = a.toObject();
            if (!Array.isArray(autoObj.targetGroups)) autoObj.targetGroups = [];
            return autoObj;
        });
        res.json(parsedAutomations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create automation
router.post('/projects/:projectId/automations', protect, async (req, res) => {
    try {
        const { name, triggerType, scheduledAt, targetGroups } = req.body;
        const automation = await Automation.create({
            userId: req.user._id,
            isSuper: req.user.role === 'superadmin',
            projectId: req.params.projectId,
            name,
            triggerType,
            scheduledAt,
            targetGroups
        });
        res.json(automation);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single automation details (with steps)
router.get('/:id', protect, async (req, res) => {
    try {
        const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id });
        if (!automation) return res.status(404).json({ error: 'Not found' });

        const steps = await AutomationStep.find({ automationId: automation._id })
            .sort({ stepOrder: 1 });
            
        const autoObj = automation.toObject();
        if (!Array.isArray(autoObj.targetGroups)) autoObj.targetGroups = [];

        res.json({ ...autoObj, steps });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save Automation Flow (Steps)
router.post('/:id/steps', protect, async (req, res) => {
    try {
        const { steps } = req.body; // Array of { actionType, message, mediaUrl, delayMinutes, stepOrder }
        const automationId = req.params.id;

        // Verify automation belongs to user
        const automation = await Automation.findOne({ _id: automationId, userId: req.user._id });
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        // Delete existing steps and recreate for simplicity (or update them)
        await AutomationStep.deleteMany({ automationId });

        const cleanSteps = steps.map((s, idx) => {
            const stepData = { ...s, automationId, stepOrder: idx + 1 };
            delete stepData._id;
            delete stepData.id;
            
            if (!stepData.delayUntilDate || stepData.delayUntilDate === '' || stepData.delayUntilDate === 'null') {
                delete stepData.delayUntilDate;
            } else {
                const dateObj = new Date(stepData.delayUntilDate);
                if (isNaN(dateObj.getTime())) {
                    delete stepData.delayUntilDate;
                } else {
                    stepData.delayUntilDate = dateObj;
                }
            }
            return stepData;
        });

        const createdSteps = await AutomationStep.insertMany(cleanSteps);

        res.json(createdSteps);
    } catch (err) {
        console.error("Error saving steps:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update target groups for automation
router.patch('/:id/groups', protect, async (req, res) => {
    try {
        const { targetGroups } = req.body;
        const automation = await Automation.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { targetGroups },
            { new: true }
        );
        res.json(automation);
    } catch (err) {
        console.error("Error saving groups:", err);
        res.status(500).json({ error: err.message });
    }
});

// Run Manual Trigger
router.post('/:id/run', protect, async (req, res) => {
    try {
        const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id });
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        automation.status = 'active';
        await automation.save();

        if (automation.triggerType === 'schedule') {
            res.json({ message: 'Automation activated & scheduled for later', automation });
        } else {
            // Non-blocking trigger
            const client = req.app.get('getClientForUser')(req.user._id, automation.isSuper);
            if (!client || !client.info) return res.status(400).json({ error: 'WhatsApp not connected. Please connect your WhatsApp first.' });

            runAutomation(automation._id, client).catch(err => console.error(err));
            res.json({ message: 'Automation Started Now', automation });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pause / Update Status
router.patch('/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body; // 'active', 'paused'
        const automation = await Automation.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { status },
            { new: true }
        );
        res.json(automation);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/trigger', protect, async (req, res) => {
    try {
        const { triggerType, scheduledAt, eventTime } = req.body;
        const updateData = { triggerType };
        
        // Robustly parse and validate scheduledAt
        if (scheduledAt && scheduledAt !== 'null' && scheduledAt !== 'undefined') {
            const dateObj = new Date(scheduledAt);
            updateData.scheduledAt = isNaN(dateObj.getTime()) ? null : dateObj;
        } else {
            updateData.scheduledAt = null;
        }

        // Robustly parse and validate eventTime
        if (eventTime && eventTime !== 'null' && eventTime !== 'undefined') {
            const dateObj = new Date(eventTime);
            updateData.eventTime = isNaN(dateObj.getTime()) ? null : dateObj;
        } else {
            updateData.eventTime = null;
        }

        const automation = await Automation.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            updateData,
            { new: true }
        );
        res.json(automation);
    } catch (err) {
        console.error("Error patching trigger settings:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get automation logs & steps
router.get('/:id/logs', protect, async (req, res) => {
    try {
        const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id });
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const steps = await AutomationStep.find({ automationId: automation._id }).sort({ stepOrder: 1 });
        const logs = await AutomationLog.find({ automationId: automation._id }).sort({ executedAt: -1 });

        res.json({
            automation,
            steps,
            logs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete automation
router.delete('/:id', protect, async (req, res) => {
    try {
        const automationId = req.params.id;
        
        // Verify ownership
        const automation = await Automation.findOne({ _id: automationId, userId: req.user._id });
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        // Delete steps, logs, and the automation document
        await AutomationStep.deleteMany({ automationId });
        await AutomationLog.deleteMany({ automationId });
        await Automation.deleteOne({ _id: automationId });

        res.json({ message: 'Automation deleted successfully', id: automationId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
