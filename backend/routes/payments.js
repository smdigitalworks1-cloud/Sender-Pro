// routes/payments.js  – Razorpay subscription payment
const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const fs = require('fs');
const path = require('path');
const protect = require('../middleware/auth');
const { User, Subscription } = require('../models');
const syncToSheets = require('../utils/syncSheets');
const syncPayments = require('../utils/syncPayments');
const router = express.Router();

let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

// ── Plans ────────────────────────────────────────────────────────
const PLANS_FILE = path.join(__dirname, '../data/plans.json');

// Default Plans
let defaultPlans = {
    // User Plans
    'user_monthly': { label: 'User Monthly', amount: 600, days: 30, type: 'user', features: ['Unlimited WhatsApp Sending', 'Group Messaging', 'Auto Reply', 'Group Member Grabber', 'Advance Campaign Scheduling', 'Premium Priority Support'] },
    'user_quarterly': { label: 'User Quarterly', amount: 129900, days: 90, type: 'user', features: ['Unlimited WhatsApp Sending', 'Group Messaging', 'Auto Reply', 'Group Member Grabber', 'Advance Campaign Scheduling', 'Premium Priority Support'] },
};

let PLANS = { ...defaultPlans };

// Load custom plans if file exists
try {
    if (!fs.existsSync(path.join(__dirname, '../data'))) {
        fs.mkdirSync(path.join(__dirname, '../data'));
    }
    if (fs.existsSync(PLANS_FILE)) {
        const savedData = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
        // Only load and merge plans that are defined in defaultPlans
        PLANS = {};
        for (const key of Object.keys(defaultPlans)) {
            if (savedData[key]) {
                PLANS[key] = { ...defaultPlans[key], ...savedData[key] };
            } else {
                PLANS[key] = defaultPlans[key];
            }
        }
        // Auto-save cleaned configuration back to file
        fs.writeFileSync(PLANS_FILE, JSON.stringify(PLANS, null, 2));
    }
} catch (e) {
    console.error('Failed to load plans file:', e);
}

// Save Plans Helper
const savePlansToFile = () => {
    try {
        fs.writeFileSync(PLANS_FILE, JSON.stringify(PLANS, null, 2));
    } catch (e) {
        console.error('Failed to save plans to file:', e);
    }
};

// Allow Super Admin to update plan prices at runtime
const updatePlan = (planId, newAmount) => {
    if (PLANS[planId]) {
        PLANS[planId].amount = newAmount;
        savePlansToFile();
    }
};

// GET /api/payments/plans  – public
router.get('/plans', (req, res) => {
    res.json(Object.entries(PLANS).map(([id, p]) => ({
        id,
        label: p.label,
        amount: p.amount / 100,
        days: p.days,
        type: p.type,
        features: p.features || [],
        priceId: id,
    })));
});

// GET /api/payments/plan-config  – Super Admin or Admin: get raw plan config (in paise)
router.get('/plan-config', protect, async (req, res) => {
    if (!req.user?.isAdmin && req.user?.role !== 'superadmin') return res.status(403).json({ message: 'Admins only' });
    res.json(Object.entries(PLANS).map(([id, p]) => ({
        id,
        label: p.label,
        amountInRupees: p.amount / 100,
        days: p.days,
        type: p.type,
        features: p.features || [],
    })));
});

// PATCH /api/payments/plan-config  – Admin update plan pricing & features live
router.patch('/plan-config', protect, async (req, res) => {
    if (!req.user?.isAdmin && req.user?.role !== 'superadmin') return res.status(403).json({ message: 'Admins only' });
    const { planId, amountInRupees, features } = req.body;
    if (!planId) return res.status(400).json({ message: 'planId is required' });
    if (!PLANS[planId]) return res.status(404).json({ message: `Plan "${planId}" not found` });

    if (amountInRupees !== undefined && !isNaN(amountInRupees)) {
        PLANS[planId].amount = Math.round(parseFloat(amountInRupees) * 100);
    }
    if (features !== undefined && Array.isArray(features)) {
        PLANS[planId].features = features;
    }

    savePlansToFile(); // Save changes permanently
    res.json({ message: `Plan "${planId}" updated`, plans: PLANS });
});


// GET /api/payments/status  – current user subscription
router.get('/status', protect, async (req, res) => {
    const user = await User.findById(req.user._id).select('name email isAdmin subStatus subExpiry');
    res.json({
        isAdmin: user.isAdmin,
        subStatus: user.subStatus,
        subExpiry: user.subExpiry,
        isActive: user.hasActiveSubscription(),
    });
});

// POST /api/payments/create-order
router.post('/create-order', protect, async (req, res) => {
    try {
        const { plan } = req.body;
        const planData = PLANS[plan];
        if (!planData) return res.status(400).json({ message: 'Invalid plan' });

        if (!razorpay) return res.status(500).json({ message: 'Razorpay keys are not configured' });

        const order = await razorpay.orders.create({
            amount: planData.amount,
            currency: 'INR',
            receipt: `r_${req.user._id}_${Math.floor(Date.now() / 1000)}`,
            notes: { userId: String(req.user._id), plan },
        });

        // Save pending subscription
        await Subscription.create({
            userId: req.user._id,
            plan,
            amount: planData.amount,
            status: 'pending',
            razorpayOrderId: order.id,
        });

        res.json({
            orderId: order.id,
            amount: planData.amount,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (e) {
        console.error('Razorpay order error:', e);
        res.status(500).json({ message: e.message || (e.error && e.error.description) || 'Razorpay order creation failed' });
    }
});

// POST /api/payments/verify  – called after successful payment
router.post('/verify', protect, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expected = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expected !== razorpay_signature)
            return res.status(400).json({ message: 'Payment verification failed' });

        const planData = PLANS[plan] || PLANS.user_monthly;
        const startDate = new Date();
        const endDate = new Date(Date.now() + planData.days * 24 * 60 * 60 * 1000);

        // Update subscription record
        await Subscription.updateOne(
            { razorpayOrderId: razorpay_order_id },
            { status: 'paid', razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, startDate, endDate }
        );

        // Activate user and set role based on plan
        await User.updateOne(
            { _id: req.user._id },
            {
                subStatus: 'active',
                subExpiry: endDate,
                activePlan: plan,
                isAdmin: planData.type === 'admin' // Set Admin role if admin plan purchased
            }
        );

        res.json({ message: 'Payment verified! Subscription activated.', subExpiry: endDate });

        // Sync to Google Sheets (Async)
        const user = await User.findById(req.user._id);
        syncToSheets(user).catch(e => console.error('Sheet sync failed:', e.message));

        // Sync payment details specifically
        syncPayments({
            userId: req.user._id,
            name: user.name,
            email: user.email,
            whatsappNumber: user.whatsappNumber,
            plan: plan,
            amount: planData.amount,
            status: 'paid',
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            startDate: startDate,
            endDate: endDate
        }).catch(e => console.error('Payment sheet sync failed:', e.message));
    } catch (e) {
        console.error('Verify error:', e.message);
        res.status(500).json({ message: e.message });
    }
});

module.exports = router;
module.exports.updatePlan = updatePlan;
module.exports.PLANS = PLANS;
