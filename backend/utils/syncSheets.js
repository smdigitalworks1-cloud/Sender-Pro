const axios = require('axios');

/**
 * Syncs user data to Google Sheets via Apps Script Web App
 * @param {Object} user - User object from DB
 */
const syncToSheets = async (user) => {
    const scriptUrl = process.env.GOOGLE_SHEETS_SYNC_URL;
    if (!scriptUrl) return;

    const targetSheet = 'Users';

    const payload = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.isAdmin ? 'Admin' : (user.role === 'superadmin' ? 'SuperAdmin' : 'User'),
        subStatus: user.subStatus,
        subExpiry: user.subExpiry,
        createdAt: user.createdAt,
        whatsappNumber: user.whatsappNumber, // primary contact number
    };

    try {
        // Sync to specific targetSheet (Admin, Users, or Sub Acc)
        await axios.post(scriptUrl, {
            action: 'upsertUser',
            sheetName: targetSheet,
            userData: payload
        });
        console.log(`Synced ${user.email} to ${targetSheet} sheet`);
    } catch (error) {
        console.error(`Sync Error [${user.email}]:`, error.message);
    }
};

module.exports = syncToSheets;
