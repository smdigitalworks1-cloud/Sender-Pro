const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ override: true });

const app = express();

// ── App Settings / Helpers ──────────────────────────────────
// Define a dummy helper so routes don't crash when calling undefined
app.set('getClientForUser', () => null); 

app.use(cors({ origin: '*' }));
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

module.exports = app;
