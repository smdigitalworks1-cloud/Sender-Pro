const jwt = require('jsonwebtoken');
const { User, SuperAdmin } = require('../models');

module.exports = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role === 'superadmin') {
      req.user = await SuperAdmin.findById(decoded.id).select('-password');
      if (req.user) req.user.role = 'superadmin';
    } else {
      req.user = await User.findById(decoded.id).select('-password');
      if (req.user) {
        // Use the DB role column if set, otherwise fall back to legacy isAdmin check
        if (!req.user.role || req.user.role === 'user') {
          req.user.role = req.user.isAdmin ? 'admin' : (req.user.parentId ? 'subaccount' : 'user');
        }
      }
    }

    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ message: 'Token invalid or expired' });
  }
};
