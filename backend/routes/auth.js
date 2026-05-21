const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, SuperAdmin, Subscription } = require('../models');
const protect = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');
const router = express.Router();

const sign = (id, isAdmin = false) => jwt.sign({ id, isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, whatsappNumber } = req.body;
    if (!name || !email || !password || !whatsappNumber)
      return res.status(400).json({ message: 'Name, email, password, and WhatsApp number are required' });

    if (await User.findOne({ email }))
      return res.status(400).json({ message: 'Email already registered' });

    const user = await User.create({
      name, email, password, whatsappNumber,
      subStatus: 'none',
      subExpiry: null
    });

    // Sync to Google Sheets (Async)
    const syncToSheets = require('../utils/syncSheets');
    syncToSheets(user).catch(e => console.error('Registration sheet sync failed:', e.message));

    // Send Welcome Email (Async)
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
    sendEmail({
      email: user.email,
      subject: 'Welcome to Sender Pro - Account Created Successfully!',
      message: `Welcome ${user.name}!\nYour account has been created successfully.\n\nLogin Details:\nEmail: ${user.email}\nPassword: ${password}\n\nLogin here: ${loginUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #7c3aed;">Welcome to Sender Pro! 🎉</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Your account has been created successfully. Here are your account details:</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${user.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${user.email}</p>
            <p style="margin: 5px 0;"><strong>WhatsApp Number:</strong> ${user.whatsappNumber}</p>
            <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
          </div>
          <p>You can login to your dashboard using the link below:</p>
          <a href="${loginUrl}" style="display: inline-block; padding: 10px 20px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Dashboard</a>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">If you didn't request this account, please ignore this email.</p>
        </div>
      `
    }).catch(e => console.error('Welcome email failed:', e.message));

    res.status(201).json({
      id: user._id, name: user.name, email: user.email,
      whatsappNumber: user.whatsappNumber,
      isAdmin: user.isAdmin, parentId: user.parentId,
      subStatus: user.subStatus,
      subExpiry: user.subExpiry,
      activePlan: user.activePlan || null,
      token: sign(user._id, user.isAdmin)
    });
  } catch (e) {
    console.error('[AUTH] Registration crashed:', e);
    res.status(500).json({ message: e.message });
  }
});

// Login - Step 1: Request OTP
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid email or password' });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 mins
    await user.save();

    // Send OTP Email
    console.log(`\n🔐 LOGIN OTP for ${user.email}: ${otp} (Expires in 5 mins)\n`);
    sendEmail({
      email: user.email,
      subject: 'Login OTP - Sender Pro',
      message: `Your login OTP is: ${otp}. It will expire in 5 minutes.`,
      html: `<h3>Login Verification</h3><p>Your login OTP is: <strong style="font-size: 24px; color: #7c3aed;">${otp}</strong></p><p>This code will expire in 5 minutes.</p>`
    }).catch(e => console.error('OTP email send failed (check SMTP config):', e.message));

    res.json({ message: 'OTP sent to email', requiresOtp: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Verify OTP for User
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(401).json({ message: 'Invalid or expired OTP' });

    // Clear OTP
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({
      id: user._id, name: user.name, email: user.email,
      whatsappNumber: user.whatsappNumber || null,
      isAdmin: user.isAdmin, parentId: user.parentId,
      role: user.role || (user.isAdmin ? 'admin' : 'user'),
      subStatus: user.subStatus || 'none',
      subExpiry: user.subExpiry || null,
      activePlan: user.activePlan || null,
      token: sign(user._id, user.isAdmin)
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Admin Login - Step 1: Request OTP
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await SuperAdmin.findOne({ email });

    if (!admin || !(await admin.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid admin email or password' });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.otp = otp;
    admin.otpExpires = Date.now() + 5 * 60 * 1000; // 5 mins
    await admin.save();

    // Send OTP Email
    console.log(`\n👑 ADMIN LOGIN OTP for ${admin.email}: ${otp} (Expires in 5 mins)\n`);
    sendEmail({
      email: admin.email,
      subject: 'Super Admin Login OTP',
      message: `Your Super Admin login OTP is: ${otp}.`,
      html: `<h3>Admin Verification</h3><p>Your Super Admin login OTP is: <strong style="font-size: 24px; color: #f59e0b;">${otp}</strong></p><p>This code will expire in 5 minutes.</p>`
    }).catch(e => console.error('Admin OTP email send failed:', e.message));

    res.json({ message: 'OTP sent to email', requiresOtp: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Verify OTP for Admin
router.post('/admin-verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await SuperAdmin.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() }
    });

    if (!admin) return res.status(401).json({ message: 'Invalid or expired OTP' });

    // Clear OTP
    admin.otp = null;
    admin.otpExpires = null;
    await admin.save();

    const token = jwt.sign({ id: admin._id, role: 'superadmin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      id: admin._id, name: admin.name, email: admin.email, role: 'superadmin', token
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Me - returns fresh user data always from DB
router.get('/me', protect, (req, res) => {
  const u = req.user;
  // Return key fields (middleware already loaded fresh from DB)
  res.json({
    id: u._id,
    name: u.name,
    email: u.email,
    whatsappNumber: u.whatsappNumber || null,
    isAdmin: u.isAdmin || false,
    parentId: u.parentId || null,
    role: u.role || (u.isAdmin ? 'admin' : 'user'),
    subStatus: u.subStatus || 'none',
    subExpiry: u.subExpiry || null,
    activePlan: u.activePlan || null,
  });
});

// Profile - detailed profile with payment history
router.get('/profile', protect, async (req, res) => {
  try {
    // For superadmin, we don't have subscriptions in the same way, 
    // but we can return basic info.
    if (req.user.role === 'superadmin') {
      return res.json({
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: 'superadmin'
        },
        subscriptions: []
      });
    }

    const user = await User.findById(req.user._id)
      .select('name email whatsappNumber isAdmin subStatus subExpiry activePlan createdAt');

    const subscriptions = await Subscription.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ user, subscriptions });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Update Profile
router.put('/update-profile', protect, async (req, res) => {
  try {
    const { name, whatsappNumber } = req.body;
    let account;

    if (req.user.role === 'superadmin') {
      account = await SuperAdmin.findById(req.user._id);
    } else {
      account = await User.findById(req.user._id);
    }

    if (!account) return res.status(404).json({ message: 'Account not found' });

    if (name) account.name = name;
    if (whatsappNumber !== undefined) account.whatsappNumber = whatsappNumber;

    await account.save();

    // Trigger Sheet Sync if it's a regular user/admin
    if (req.user.role !== 'superadmin') {
      const syncToSheets = require('../utils/syncSheets');
      syncToSheets(account).catch(e => console.error('Profile sync failed:', e.message));
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: account._id,
        name: account.name,
        email: account.email,
        whatsappNumber: account.whatsappNumber,
        role: req.user.role
      }
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    let account = await User.findOne({ email: req.body.email });

    // Fallback to SuperAdmin if not found in User
    if (!account) {
      account = await SuperAdmin.findOne({ email: req.body.email });
    }

    if (!account) return res.status(404).json({ message: 'User not found' });

    const resetToken = crypto.randomBytes(20).toString('hex');
    account.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    account.resetPasswordExpire = Date.now() + 5 * 60 * 1000;
    await account.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

    try {
      await sendEmail({
        email: account.email,
        subject: 'Password reset token',
        message: message,
        html: `<h3>Password Reset</h3><p>You are receiving this email because you requested the reset of your password.</p><p>Please click the link below to reset your password:</p><a href="${resetUrl}">${resetUrl}</a><br/><p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`
      });
      res.json({ message: 'Email sent' });
    } catch (err) {
      account.resetPasswordToken = null;
      account.resetPasswordExpire = null;
      await account.save();
      console.log('Email could not be sent. Please check your SMTP configuration in the .env file.', err);
      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    let account = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!account) {
      account = await SuperAdmin.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() }
      });
    }

    if (!account) return res.status(400).json({ message: 'Invalid or expired token' });

    account.password = password;
    account.resetPasswordToken = null;
    account.resetPasswordExpire = null;
    await account.save();

    res.json({ message: 'Password reset successful' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Change Password (logged-in)
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Load fresh account with password for verification (since middleware excludes it)
    let account;
    if (req.user.role === 'superadmin') {
      account = await SuperAdmin.findById(req.user._id);
    } else {
      account = await User.findById(req.user._id);
    }

    if (!account || !(await account.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    account.password = newPassword;
    await account.save();

    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
