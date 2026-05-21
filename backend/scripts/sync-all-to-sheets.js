require('dotenv').config({ path: '../.env' });
const connectDB = require('../config/database');
const { User } = require('../models');
const syncToSheets = require('../utils/syncSheets');

async function syncAll() {
    console.log('🚀 Starting full synchronization to Google Sheets...');

    try {
        // Connect DB
        await connectDB();
        console.log('✅ Database connected.');

        // Fetch all top-level paid users/admins
        const users = await User.find();

        console.log(`Found ${users.length} accounts.`);

        let syncCount = 0;
        for (const user of users) {
            console.log(`Syncing: ${user.email} (${user.subStatus})`);
            await syncToSheets(user);
            syncCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`\n✨ Finished! Successfully synced ${syncCount} accounts to Google Sheets.`);
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
    } finally {
        process.exit();
    }
}

syncAll();
