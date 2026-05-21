const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { AutomationLog } = require('./models');

const triggerAndCheck = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sender_pro';
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB.');

        // User ID for sathiyan
        const userId = '6a0da751ba51174cebc00ee7';
        const token = jwt.sign({ id: userId, isAdmin: true }, process.env.JWT_SECRET || 'senderpro_super_secret_2024', { expiresIn: '1d' });
        
        console.log('Generated Token:', token);
        console.log('Sending run request to backend...');

        const url = 'http://127.0.0.1:5000/api/automations/6a0df6614fc2190fbbd05ce2/run';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('HTTP Status Code:', res.status);
        const resText = await res.text();
        console.log('Response Body:', resText);

        console.log('Waiting 5 seconds to query AutomationLog...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('\n--- NEW AUTOMATION LOGS ---');
        const logs = await AutomationLog.find({ automationId: '6a0df6614fc2190fbbd05ce2' }).sort({ executedAt: -1 }).limit(10);
        if (logs.length === 0) {
            console.log('No logs found for this automation.');
        } else {
            for (const log of logs) {
                console.log(`Log ID: ${log._id}`);
                console.log(`Group ID: ${log.groupId}`);
                console.log(`Step ID: ${log.stepId}`);
                console.log(`Status: ${log.status}`);
                console.log(`Error: ${log.error}`);
                console.log(`Executed At: ${log.executedAt}`);
                console.log('---------------------------');
            }
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error triggering and checking:', err.message);
        process.exit(1);
    }
};

triggerAndCheck();
