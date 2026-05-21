const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { User } = require('./models');

async function run() {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/sender_pro';
  await mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const user = await User.findOne({ email: 'sathiyans2003@gmail.com' });
  if (!user) {
    console.error('Superadmin user not found!');
    await mongoose.disconnect();
    return;
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const endpoints = [
    'http://127.0.0.1:5000/api/admin/stats',
    'http://127.0.0.1:5000/api/admin/users',
    'http://127.0.0.1:5000/api/admin/payments',
    'http://127.0.0.1:5000/api/admin/limits',
    'http://127.0.0.1:5000/api/payments/plan-config',
  ];

  for (const url of endpoints) {
    console.log(`\nQuerying endpoint: ${url}`);
    try {
      const res = await fetch(url, { headers });
      console.log('Status Code:', res.status);
      const text = await res.text();
      console.log('Response Snippet:', text.slice(0, 500));
    } catch (err) {
      console.error(`Error querying ${url}:`, err.message);
    }
  }

  await mongoose.disconnect();
}

run().catch(err => console.error(err));
