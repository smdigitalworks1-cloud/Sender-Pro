const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Recursive helper to list and add files to zip, excluding heavy caches
function addFilesToZip(zip, baseDir, currentDir = baseDir) {
  const items = fs.readdirSync(currentDir);
  const excludeKeywords = [
    'Cache',
    'Code Cache',
    'Service Worker',
    'Crashpad',
    'GPUCache',
    'Dictionaries',
    'blob_storage',
    'IndexedDB',
    'BrowserMetrics',
    'component_crx_cache',
    'CertificateRevocation',
    '.pma',
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
    'lockfile',
    'lock'
  ];

  for (const item of items) {
    const fullPath = path.join(currentDir, item);
    const relativePath = path.relative(baseDir, fullPath);
    
    // Check if relative path stat is directory or file
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      // Ignore locked or missing files
      continue;
    }

    // Skip if path contains any exclude keywords
    if (excludeKeywords.some(keyword => relativePath.includes(keyword))) {
      continue;
    }

    if (stat.isDirectory()) {
      addFilesToZip(zip, baseDir, fullPath);
    } else {
      try {
        const fileData = fs.readFileSync(fullPath);
        const zipEntryPath = relativePath.replace(/\\/g, '/');
        zip.addFile(zipEntryPath, fileData);
      } catch (err) {
        console.error(`⚠️ [sessionStore] Skip packing file ${relativePath} due to lock/error:`, err.message);
      }
    }
  }
}

async function saveSessionToDB(guid) {
  try {
    const sessionDir = path.join(__dirname, '../.wwebjs_auth', `session-${guid}`);
    if (!fs.existsSync(sessionDir)) {
      console.log(`⚠️ [sessionStore] Session directory does not exist for [${guid}], skipping DB save.`);
      return false;
    }

    console.log(`📦 [sessionStore] Packing session files for [${guid}]...`);
    const zip = new AdmZip();
    addFilesToZip(zip, sessionDir);
    const zipBuffer = zip.toBuffer();

    const { WhatsAppSession } = require('../models');
    await WhatsAppSession.findOneAndUpdate(
      { guid },
      { sessionData: zipBuffer, lastSaved: new Date() },
      { upsert: true, new: true }
    );
    console.log(`✅ [sessionStore] Successfully saved session zip (${(zipBuffer.length / 1024).toFixed(1)} KB) to MongoDB for [${guid}]`);
    return true;
  } catch (err) {
    console.error(`❌ [sessionStore] Failed to save session to DB for [${guid}]:`, err.message);
    return false;
  }
}

async function restoreSessionFromDB(guid) {
  try {
    const sessionDir = path.join(__dirname, '../.wwebjs_auth', `session-${guid}`);
    if (fs.existsSync(sessionDir)) {
      console.log(`ℹ️ [sessionStore] Session folder already exists on disk for [${guid}]. Skipping DB restore.`);
      return true;
    }

    const { WhatsAppSession } = require('../models');
    const doc = await WhatsAppSession.findOne({ guid });
    if (!doc) {
      console.log(`ℹ️ [sessionStore] No saved session found in MongoDB for [${guid}]`);
      return false;
    }

    console.log(`📥 [sessionStore] Validating saved session for [${guid}] in MongoDB...`);
    let isValid = false;
    try {
      const zip = new AdmZip(doc.sessionData);
      const entries = zip.getEntries();
      const hasLocalStorage = entries.some(entry => entry.entryName.includes('Local Storage'));
      if (hasLocalStorage && entries.length > 0) {
        isValid = true;
      } else {
        console.warn(`⚠️ [sessionStore] MongoDB session zip for [${guid}] contains no Local Storage entries.`);
      }
    } catch (zipErr) {
      console.error(`❌ [sessionStore] Session zip data is corrupted for [${guid}]:`, zipErr.message);
    }

    if (!isValid) {
      console.error(`❌ [sessionStore] Deeming MongoDB session invalid/corrupt for [${guid}]. Skipping restore.`);
      return false;
    }

    console.log(`📥 [sessionStore] Session validated successfully. Extracting session files for [${guid}] to disk...`);
    fs.mkdirSync(sessionDir, { recursive: true });
    
    const zip = new AdmZip(doc.sessionData);
    zip.extractAllTo(sessionDir, true);
    console.log(`✅ [sessionStore] Successfully restored session files to disk for [${guid}]`);
    return true;
  } catch (err) {
    console.error(`❌ [sessionStore] Failed to restore session from DB for [${guid}]:`, err.message);
    return false;
  }
}

module.exports = {
  saveSessionToDB,
  restoreSessionFromDB
};
