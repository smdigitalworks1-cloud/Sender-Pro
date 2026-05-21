const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { AutomationStep } = require('./models');

const run = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sender_pro';
        await mongoose.connect(uri);
        
        const steps = await AutomationStep.find({ automationId: '6a0df6614fc2190fbbd05ce2' }).sort({ stepOrder: 1 });
        console.log(JSON.stringify(steps, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};
run();
