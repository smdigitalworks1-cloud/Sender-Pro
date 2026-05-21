require('dotenv').config();
const connectDB = require('./config/database');
const { SuperAdmin } = require('./models');

async function updatePassword() {
    await connectDB();
    const admin = await SuperAdmin.findOne({ email: 'smdigitalworks1@gmail.com' });
    if (admin) {
        admin.password = 'smdigitalworks';
        await admin.save();
        console.log("Updated password to 'smdigitalworks'");
    } else {
        console.log("No superadmin found.");
    }
    process.exit();
}
updatePassword();
