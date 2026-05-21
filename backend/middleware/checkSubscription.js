const { User } = require('../models');

module.exports = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // 0. Super Admin always has access
    if (req.user.role === 'superadmin') return next();

    // 1. If it's a sub-account, check the parent's subscription
    if (req.user.parentId) {
        const parent = await User.findById(req.user.parentId);
        if (!parent || !parent.hasActiveSubscription()) {
            return res.status(403).json({
                message: 'Your Admin\'s subscription has expired. Please contact your administrator.',
                code: 'PARENT_SUBSCRIPTION_REQUIRED',
            });
        }
        return next();
    }

    // 2. Direct account (or Admin) - check their own subscription
    if (req.user.hasActiveSubscription()) return next();

    return res.status(403).json({
        message: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        subStatus: req.user.subStatus || 'none',
    });
};
