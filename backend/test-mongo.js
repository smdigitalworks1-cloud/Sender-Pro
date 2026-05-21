const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const testConnection = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sender_pro';
        console.log('Testing connection to:', uri);
        await mongoose.connect(uri);
        console.log('✅ Success! Connected to MongoDB.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    }
};

testConnection();
