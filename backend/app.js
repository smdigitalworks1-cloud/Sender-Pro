const express = require('express');
const cors = require('cors');
const path = require('path');
const originalPort = process.env.PORT; // Capture environment PORT (e.g. from Railway)
require('dotenv').config({ override: true });
if (originalPort) process.env.PORT = originalPort; // Restore it to avoid override
const connectDB = require('./config/database');

// Trigger MongoDB connection and seed database in serverless/production environments
connectDB().then(async () => {
    try {
        const { SuperAdmin, User } = require('./models');
        const existingAdmin = await SuperAdmin.findOne({ email: 'smdigitalworks1@gmail.com' });
        if (!existingAdmin) {
            console.log('👑 Seeding default SuperAdmin...');
            const newAdmin = await SuperAdmin.create({
                name: 'Super Admin',
                email: 'smdigitalworks1@gmail.com',
                password: 'smdigitalworks', // Hashed automatically on save
            });
            console.log('👑 Default SuperAdmin seeded successfully: smdigitalworks1@gmail.com / smdigitalworks');
            
            const shadowUser = await User.findOne({ _id: newAdmin._id });
            if (!shadowUser) {
                await User.create({
                    _id: newAdmin._id,
                    name: 'Super Admin',
                    email: 'sa_shadow_system_admin@smdigitalworks.com',
                    password: 'shadow_password_do_not_use123',
                    role: 'superadmin',
                    isAdmin: true,
                    subStatus: 'active',
                    subExpiry: new Date('2099-12-31')
                });
                console.log('🔥 Shadow user seeded successfully to match SuperAdmin in User model.');
            }
        }
    } catch (e) {
        console.error("❌ Error seeding default credentials on startup:", e.message);
    }
}).catch(err => {
    console.error("❌ MongoDB connection error on app startup:", err.message);
});

const app = express();

// ── App Settings / Helpers ──────────────────────────────────
// Define a dummy helper so routes don't crash when calling undefined
app.set('getClientForUser', () => null); 

const allowedOrigins = [
  'https://senderpro.smdigitalworks.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ── Ensure uploads directory exists (local only) ───────────────
if (process.env.NODE_ENV !== 'production') {
    const fs = require('fs');
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Database Connection Middleware for Serverless ────────────
const mongoose = require('mongoose');
app.use(async (req, res, next) => {
    // If connected, proceed
    if (mongoose.connection.readyState === 1) {
        return next();
    }
    try {
        console.log("🔄 Database connection not fully established. Re-attempting/awaiting connection...");
        await connectDB();
        next();
    } catch (err) {
        console.error("❌ Database connection middleware failed:", err.message);
        return res.status(500).json({
            success: false,
            message: "Database connection failed! Please ensure your MongoDB Atlas IP Whitelist (Network Access) is set to 'Allow Access From Anywhere' (0.0.0.0/0) and that the Vercel MONGO_URI environment variable is correct.",
            error: err.message
        });
    }
});

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/autoreply', require('./routes/autoreply'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/global-vars', require('./routes/globalVars'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/support', require('./routes/support'));

// ── Serve Frontend ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Fallback to React (optional, usually handled by vercel.json)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
// });

// Custom error handling middleware to set CORS headers on exceptions
app.use((err, req, res, next) => {
  console.error('🔥 Express Error Handler:', err.message || err);
  
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app;
