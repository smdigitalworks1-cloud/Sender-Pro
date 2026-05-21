const mongoose = require('mongoose');
require('dotenv').config({ override: true });

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/sender_pro';
        const maskedURI = mongoURI.replace(/:([^@]+)@/, ':****@');
        console.log(`📡 Connecting to MongoDB: ${maskedURI}`);
        const conn = await mongoose.connect(mongoURI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
