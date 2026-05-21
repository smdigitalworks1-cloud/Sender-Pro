const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { User, SuperAdmin, Automation } = require('./models');

const checkLogs = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sender_pro';
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB.');

        console.log('\n--- USERS ---');
        const users = await User.find();
        for (const u of users) {
            console.log(`ID: ${u._id}`);
            console.log(`Name: ${u.name}`);
            console.log(`Email: ${u.email}`);
            console.log(`Role: ${u.role}`);
            console.log(`isAdmin: ${u.isAdmin}`);
            console.log(`whatsappNumber: ${u.whatsappNumber}`);
            console.log('---------------------------');
        }

        console.log('\n--- SUPERADMINS ---');
        const sas = await SuperAdmin.find();
        for (const sa of sas) {
            console.log(`ID: ${sa._id}`);
            console.log(`Name: ${sa.name}`);
            console.log(`Email: ${sa.email}`);
            console.log(`whatsappNumber: ${sa.whatsappNumber}`);
            console.log('---------------------------');
        }

        console.log('\n--- AUTOMATION TARGET ---');
        const auto = await Automation.findById('6a0df6614fc2190fbbd05ce2');
        if (auto) {
            console.log(`ID: ${auto._id}`);
            console.log(`Name: ${auto.name}`);
            console.log(`userId: ${auto.userId}`);
            console.log(`isSuper: ${auto.isSuper}`);
            console.log(`Target Groups: ${JSON.stringify(auto.targetGroups)}`);
        } else {
            console.log('Automation 6a0df6614fc2190fbbd05ce2 not found');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error checking logs:', err.message);
        process.exit(1);
    }
};

checkLogs();
