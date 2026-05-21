const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { AutomationLog, Automation } = require('./models');

const checkAllLogs = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sender_pro';
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB.');

        console.log('\n--- ALL AUTOMATION LOGS ---');
        const logs = await AutomationLog.find().sort({ executedAt: -1 }).limit(100);
        if (logs.length === 0) {
            console.log('No logs found in the entire collection.');
        } else {
            for (const log of logs) {
                const auto = await Automation.findById(log.automationId);
                console.log(`Log ID: ${log._id}`);
                console.log(`Automation: ${auto ? auto.name : 'Unknown'} (${log.automationId})`);
                console.log(`Group ID: ${log.groupId}`);
                console.log(`Step ID: ${log.stepId}`);
                console.log(`Status: ${log.status}`);
                console.log(`Error: ${log.error || 'None'}`);
                console.log(`Executed At: ${log.executedAt}`);
                console.log('---------------------------');
            }
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error checking logs:', err.message);
        process.exit(1);
    }
};

checkAllLogs();
