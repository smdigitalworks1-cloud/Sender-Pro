const originalPort = process.env.PORT; // Capture environment PORT (e.g. from Railway)
const app = require('./app');
const http = require('http');
const connectDB = require('./config/database');
const { User, SuperAdmin, Schedule, Automation, Subscription } = require('./models');
const { Server } = require('socket.io');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { saveSessionToDB, restoreSessionFromDB } = require('./utils/sessionStore');
const { verifyClientReadyForSend, enqueueMessage } = require('./utils/messageQueue');
require('dotenv').config({ override: true });
if (originalPort) process.env.PORT = originalPort; // Restore environment PORT to prevent override

// 🛡️ Puppeteer Stability Wrapper Interceptor
const puppeteer = require('puppeteer');

const wrapPage = (page) => {
  if (!page || page._isWrapped) return;
  page._isWrapped = true;

  console.log('🛡️ [Puppeteer Wrapper] Wrapping page object for stability...');

  try {
    page.setDefaultNavigationTimeout(300000); // 5 min
    page.setDefaultTimeout(300000); // 5 min
  } catch (e) {
    console.warn('⚠️ [Puppeteer Wrapper] Error setting page default timeouts:', e.message);
  }

  // 1. Intercept page.goto to wait for network stability
  const originalGoto = page.goto;
  page.goto = async function(url, options) {
    console.log(`🧭 [Puppeteer Wrapper] Page navigating to: ${url}`);
    if (page.isClosed()) {
      throw new Error('page.goto failed: Page is closed');
    }
    const response = await originalGoto.call(page, url, options);
    
    try {
      if (!page.isClosed()) {
        console.log('⏳ [Puppeteer Wrapper] Waiting for network idle (stability)...');
        await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {
          console.warn('⚠️ [Puppeteer Wrapper] networkidle timeout reached, proceeding anyway...');
        });
      }
    } catch (e) {
      console.warn('⚠️ [Puppeteer Wrapper] Error during networkidle wait:', e.message);
    }
    return response;
  };

  // 2. Intercept page.evaluate to retry on navigation/context-destroyed errors
  const originalEvaluate = page.evaluate;
  page.evaluate = async function(pageFunction, ...args) {
    if (page.isClosed()) {
      throw new Error('page.evaluate failed: Page is closed');
    }

    let retries = 3;
    while (retries > 0) {
      try {
        return await originalEvaluate.call(page, pageFunction, ...args);
      } catch (err) {
        const msg = err.message || '';
        const isNav = msg.includes('Execution context was destroyed') || msg.includes('navigation');
        const isTransient = isNav || msg.includes('timed out') || msg.includes('timeout') || msg.includes('Protocol error');
        const isClosed = msg.includes('closed') || msg.includes('detached') || msg.includes('target');

        if (isClosed) {
          console.error(`❌ [Puppeteer Wrapper] Evaluation failed: Page is closed/detached.`);
          throw err;
        }

        if (isTransient && retries > 1) {
          retries--;
          console.warn(`⚠️ [Puppeteer Wrapper] Evaluation failed (transient error). Retrying in 1.5s... (${retries} retries left). Error: ${msg}`);
          await new Promise(r => setTimeout(r, 1500));
          try {
            if (!page.isClosed()) {
              await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
            }
          } catch (e) {}
          continue;
        }
        throw err;
      }
    }
  };
};

const originalLaunch = puppeteer.launch;
puppeteer.launch = async function(opts) {
  opts = opts || {};
  opts.protocolTimeout = 300000;
  opts.timeout = 300000;
  console.log('🚀 [Puppeteer Interceptor] Intercepting puppeteer.launch. Headless:', opts.headless);
  const browser = await originalLaunch.call(puppeteer, opts);
  console.log('✅ [Puppeteer Interceptor] Browser launched successfully.');

  try {
    const pages = await browser.pages();
    pages.forEach(wrapPage);
  } catch (err) {
    console.error('⚠️ [Puppeteer Interceptor] Error wrapping initial pages:', err.message);
  }

  browser.on('disconnected', () => {
    console.error('🚨 [Puppeteer Interceptor] Browser crashed or disconnected from Puppeteer context.');
  });

  browser.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      try {
        const page = await target.page();
        if (page) {
          wrapPage(page);
        }
      } catch (err) {
        console.error('⚠️ [Puppeteer Interceptor] Error wrapping new page:', err.message);
      }
    }
  });

  return browser;
};

const originalConnect = puppeteer.connect;
puppeteer.connect = async function(opts) {
  opts = opts || {};
  opts.protocolTimeout = 300000;
  opts.timeout = 300000;
  console.log('🚀 [Puppeteer Interceptor] Intercepting puppeteer.connect...');
  const browser = await originalConnect.call(puppeteer, opts);
  console.log('✅ [Puppeteer Interceptor] Browser connected successfully.');

  try {
    const pages = await browser.pages();
    pages.forEach(wrapPage);
  } catch (err) {
    console.error('⚠️ [Puppeteer Interceptor] Error wrapping initial pages on connect:', err.message);
  }

  browser.on('disconnected', () => {
    console.error('🚨 [Puppeteer Interceptor] Browser crashed or disconnected from Puppeteer context on connect.');
  });

  browser.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      try {
        const page = await target.page();
        if (page) {
          wrapPage(page);
        }
      } catch (err) {
        console.error('⚠️ [Puppeteer Interceptor] Error wrapping new page on connect:', err.message);
      }
    }
  });

  return browser;
};



const allowedOrigins = [
  'https://senderpro.smdigitalworks.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000'
];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// ── Global Error Catching for Puppeteer / Whatsapp-web.js Unhandled Errors
process.on('uncaughtException', (err) => {
  console.error('🔥 Global Uncaught Exception (ignored):', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Global Unhandled Rejection (ignored):', reason?.message || reason);
});

// ── Database Connection & Seeding ──────────────────────────────
connectDB().then(async () => {
    // 👑 Seed Default SuperAdmin
    const existingAdmin = await SuperAdmin.findOne({ email: 'smdigitalworks1@gmail.com' });
    if (!existingAdmin) {
      await SuperAdmin.create({
        name: 'Super Admin',
        email: 'smdigitalworks1@gmail.com',
        password: 'smdigitalworks', // Will be hashed by pre-save hook
      });
      console.log('👑 Default SuperAdmin seeded: smdigitalworks1@gmail.com / smdigitalworks');
    }

    // 🔥 Create Shadow User to satisfy legacy requirements if any
    try {
      const sa = await SuperAdmin.findOne({ email: 'smdigitalworks1@gmail.com' });
      if (sa) {
         const shadowUser = await User.findOne({ _id: sa._id });
         if (!shadowUser) {
           await User.create({
             _id: sa._id,
             name: 'Super Admin',
             email: 'sa_shadow_system_admin@smdigitalworks.com',
             password: 'shadow_password_do_not_use123',
             role: 'superadmin',
             isAdmin: true,
             whatsappNumber: sa.whatsappNumber || '919094788457',
             subStatus: 'active',
             subExpiry: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 years
           });
         }
      }
      
      // Automatically make 'sathiyans2003@gmail.com' a Super Admin
      await User.findOneAndUpdate(
        { email: 'sathiyans2003@gmail.com' },
        { isAdmin: true, role: 'superadmin', subStatus: 'active' }
      );
    } catch(err) { console.error('Failed to seed shadow user:', err.message); }

    // Load schedules after DB is connected
    loadSchedules();
    bootstrap();

}).catch(e => {
    console.error(`❌ MongoDB connection error:`, e.message);
});

// ── Per-User WhatsApp State ───────────────────────────────────
const waClients = new Map(); // globalUid → Client (globalUid is "user_#ID" or "sa_#ID")
const waStatuses = new Map(); // globalUid → status string
const pendingInits = new Set(); // Tracks active initialization sequences to prevent concurrent double-initializations
const statusTimestamps = new Map(); // globalUid → timestamp of last status change
const qrTimeouts = new Map(); // globalUid → NodeJS.Timeout
const authFailures = new Map(); // globalUid → retry count
const initTimeouts = new Map(); // globalUid → NodeJS.Timeout for scheduled retries

function updateStatus(guid, status, data = {}) {
  // Clear timeout if a terminal status is reached
  if (['qr', 'connected', 'disconnected', 'qr_failed', 'auth_failure'].includes(status)) {
    if (qrTimeouts.has(guid)) {
      clearTimeout(qrTimeouts.get(guid));
      qrTimeouts.delete(guid);
    }
  }

  waStatuses.set(guid, status);
  statusTimestamps.set(guid, Date.now());
  
  // Emit status update to user
  emitToUser(guid, 'whatsapp:status', { status, ...data });

  // Specifically emit whatsapp:qr if status is 'qr' to support useWhatsApp hook
  if (status === 'qr' && data.qr) {
    console.log(`✉️ [QR] QR sent to frontend for [${guid}]`);
    emitToUser(guid, 'whatsapp:qr', { qr: data.qr });
  }
}


function isClientReady(client) {
  try {
    return client && client.info && client.pupPage && !client.pupPage.isClosed() && client.pupPage.browser() && client.pupPage.browser().isConnected();
  } catch (e) {
    return false;
  }
}

// Return a specific account's client
function getClientForUser(userId, isSuper = false) {
  const primaryGuid = isSuper ? `sa_${userId}` : `user_${userId}`;
  const secondaryGuid = isSuper ? `user_${userId}` : `sa_${userId}`;

  // 1. Try to find primary client and ensure it is ready (info exists)
  const primaryClient = waClients.get(primaryGuid);
  if (primaryClient && primaryClient.info) {
    return primaryClient;
  }

  // 2. Try the other secondary prefix as fallback if it is ready
  const secondaryClient = waClients.get(secondaryGuid);
  if (secondaryClient && secondaryClient.info) {
    return secondaryClient;
  }

  // 3. Fallback to whichever client exists if neither has info yet
  return primaryClient || secondaryClient || null;
}

// Fallback: return any connected client (legacy helper)
function getClient() {
  for (const [, c] of waClients) { if (c) return c; }
  return null;
}
app.set('whatsappClient', getClient);
app.set('getClientForUser', getClientForUser);


// Emit only to a specific user's socket room
function emitToUser(guid, event, data) {
  io.to(`room_${guid}`).emit(event, data);
}
global.emitToUser = emitToUser;

// ── Wipe Corrupt Session Helper ───────────────────────────────
async function wipeCorruptSession(guid, userId, isSuper, msg) {
  console.error(`❌ [Wipe] Persistent failure for [${guid}]. Wiping corrupt session. Reason: ${msg}`);
  const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`🧹 Wiped corrupt local session folder for [${guid}]`);
    }
  } catch (e) {
    console.error(`⚠️ Error wiping local folder for [${guid}]:`, e.message);
  }

  try {
    const { User, SuperAdmin, WhatsAppSession } = require('./models');
    const account = isSuper ? await SuperAdmin.findById(userId) : await User.findById(userId);
    if (account) {
      account.whatsappNumber = null;
      await account.save();
      console.log(`✅ Database WhatsApp number cleared for [${guid}] due to persistent failure`);
    }
    await WhatsAppSession.deleteOne({ guid });
    console.log(`🧹 Deleted corrupt session backup from MongoDB for [${guid}] due to persistent failure`);
  } catch (err) {
    console.error(`⚠️ Error wiping DB session for [${guid}]:`, err.message);
  }
}

async function initWhatsApp(userId, isSuper = false, attempt = 1) {
  const guid = isSuper ? `sa_${userId}` : `user_${userId}`;

  // Clear any existing scheduled retry timeouts to prevent parallel overlapping loops
  if (initTimeouts.has(guid)) {
    console.log(`🧹 [initWhatsApp] Clearing existing retry timeout for [${guid}]`);
    clearTimeout(initTimeouts.get(guid));
    initTimeouts.delete(guid);
  }

  if (pendingInits.has(guid)) {
    console.log(`⏳ [initWhatsApp] Skipping duplicate call: initialization already in progress for [${guid}]`);
    return;
  }
  pendingInits.add(guid);

  try {
    const existing = waClients.get(guid);
    if (existing) {
      console.log(`🧹 [initWhatsApp] Destroying existing client for [${guid}]...`);
      try {
        await existing.destroy();
        console.log(`✅ [initWhatsApp] Existing client browser destroyed for [${guid}]`);
      } catch (e) {
        console.error(`⚠️ [initWhatsApp] Error destroying existing client for [${guid}]:`, e.message);
      }
      waClients.delete(guid);
      waStatuses.delete(guid);
      statusTimestamps.delete(guid);
      // Wait to ensure all file handles are closed
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    await _doInit(guid, userId, isSuper, attempt);
  } finally {
    pendingInits.delete(guid);
  }
}

function cleanSessionLocks(guid) {
  const sessionDir = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
  if (!fs.existsSync(sessionDir)) return;

  const filesToDelete = [
    path.join(sessionDir, 'SingletonLock'),
    path.join(sessionDir, 'SingletonCookie'),
    path.join(sessionDir, 'SingletonSocket'),
    path.join(sessionDir, 'lockfile'),
    path.join(sessionDir, 'lock'),
    path.join(sessionDir, 'Default', 'SingletonLock'),
    path.join(sessionDir, 'Default', 'SingletonCookie'),
    path.join(sessionDir, 'Default', 'lockfile'),
    path.join(sessionDir, 'Default', 'lock')
  ];

  filesToDelete.forEach(file => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`🧹 [cleanSessionLocks] Deleted lock file: ${file}`);
      }
    } catch (err) {
      console.warn(`⚠️ [cleanSessionLocks] Failed to delete lock file ${file}:`, err.message);
    }
  });
}

async function _doInit(guid, userId, isSuper, attempt = 1) {
  // 📥 Restore session from MongoDB if disk folder is missing
  await restoreSessionFromDB(guid);

  // Clean lock files to prevent "The browser is already running" errors
  cleanSessionLocks(guid);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: guid }),
    webVersion: '2.3000.1039860984-alpha',
    webVersionCache: {
      type: 'local',
      path: path.join(__dirname, '.wwebjs_cache'),
      strict: false
    },
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      protocolTimeout: 300000, // ⏱️ 5 min timeout
      timeout: 300000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-accelerated-2d-canvas',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        `--js-flags=--max-old-space-size=${process.env.PUPPETEER_MAX_OLD_SPACE_SIZE || '512'}`,
        '--disable-sync',
        '--no-default-browser-check',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--disable-ipc-flooding-protection'
      ],
    },
  });

  console.log(`✅ [init] WhatsApp client initialized for [${guid}]`);

  waClients.set(guid, client);
  updateStatus(guid, 'connecting');

  // Register the 30-second timeout for QR code generation or successful connection
  if (qrTimeouts.has(guid)) {
    clearTimeout(qrTimeouts.get(guid));
  }
  const timeoutId = setTimeout(async () => {
    console.error(`❌ [Failure] Connection failed (timeout) for [${guid}] - QR not generated within 30s`);
    const activeClient = waClients.get(guid);
    if (activeClient) {
      try {
        console.log(`🧹 [Timeout] Terminating client browser for [${guid}] due to timeout...`);
        await activeClient.destroy();
        console.log(`✅ [Timeout] Client browser terminated for [${guid}]`);
      } catch (err) {
        console.error(`⚠️ [Timeout] Error destroying client browser for [${guid}]:`, err.message);
      }
      waClients.delete(guid);
    }
    updateStatus(guid, 'qr_failed', { error: 'WhatsApp Connection Timeout: QR Code not generated within 30 seconds.' });
  }, 30000);
  qrTimeouts.set(guid, timeoutId);

  client.on('qr', async (qr) => {
    console.log(`📲 [QR] QR generated for [${guid}]`);
    try {
      const qrImg = await qrcode.toDataURL(qr);
      updateStatus(guid, 'qr', { qr: qrImg });
    } catch (err) { console.error(`QR error [${guid}]:`, err.message); }
  });

  client.on('authenticated', () => {
    console.log(`🔐 [Auth] Client authenticated for [${guid}]`);
    authFailures.delete(guid);
  });

  client.on('ready', async () => {
    authFailures.delete(guid);
    try {
      const info = client.info;
      const connectedNumber = info.wid.user;

      try {
        const { User, SuperAdmin } = require('./models');
        const account = isSuper ? await SuperAdmin.findById(userId) : await User.findById(userId);
        if (account) {
          account.whatsappNumber = connectedNumber;
          await account.save();
        }
      } catch (err) {
        console.error('Error updating whatsapp number:', err.message);
      }

      updateStatus(guid, 'connected', {
        phone: connectedNumber,
        name: info.pushname,
      });
      console.log(`✅ [Ready] Client ready for [${guid}]. Phone: ${connectedNumber}`);

      // 💾 Backup session files to database on ready
      await saveSessionToDB(guid);
    } catch (err) { console.error(`Ready event error [${guid}]:`, err.message); }
  });

  client.on('disconnected', async (reason) => {
    const status = waStatuses.get(guid);
    const sessionDir = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
    const shouldReconnect = status !== 'logging_out' && reason !== 'LOGOUT' && fs.existsSync(sessionDir);

    updateStatus(guid, 'disconnected', { reason });
    
    // If explicitly logging out or if disconnected due to phone logouts/expired credentials
    if (reason === 'LOGOUT' || status === 'logging_out') {
      try {
        const { User, SuperAdmin, WhatsAppSession } = require('./models');
        const account = isSuper ? await SuperAdmin.findById(userId) : await User.findById(userId);
        if (account) {
          account.whatsappNumber = null;
          await account.save();
          console.log(`✅ Database WhatsApp number cleared for [${guid}] on logout`);
        }
        // Delete backup from DB
        await WhatsAppSession.deleteOne({ guid });
        console.log(`🧹 Deleted session backup from MongoDB for [${guid}] on logout`);
      } catch (err) {
        console.error('Error clearing database whatsapp number / backup on logout:', err.message);
      }

      try {
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`🧹 Deleted local session folder for [${guid}] on logout`);
        }
      } catch (e) {
        console.error(`Failed to delete session folder for [${guid}]:`, e.message);
      }
    }
    
    // Explicitly destroy client to close active Puppeteer browser and release file locks
    try {
      console.log(`🧹 [disconnected] Terminating browser on disconnect for [${guid}]...`);
      await client.destroy();
      console.log(`✅ [disconnected] Browser terminated for [${guid}]`);
    } catch (e) {
      console.error(`⚠️ [disconnected] Error destroying client on disconnect [${guid}]:`, e.message);
    }
    
    waClients.delete(guid);
    console.log(`❌ WhatsApp disconnected [${guid}]:`, reason);

    if (shouldReconnect) {
      console.log(`🔄 Auto-restarting WhatsApp for [${guid}] in 10s...`);
      updateStatus(guid, 'reconnecting');
      setTimeout(() => initWhatsApp(userId, isSuper), 10000);
    }
  });

  client.on('auth_failure', async (msg) => {
    console.error(`❌ [Failure] Connection failed (auth_failure) for [${guid}]:`, msg);
    
    const attempts = (authFailures.get(guid) || 0) + 1;
    authFailures.set(guid, attempts);

    if (attempts < 5) {
      const delay = Math.pow(2, attempts) * 1000; // 2s, 4s, 8s, 16s, 32s
      console.warn(`🔐 [Auth] Temporary auth failure detected for [${guid}] (attempt ${attempts}/5). Retrying in ${delay / 1000}s without session wipe...`);
      updateStatus(guid, 'connecting', { error: `Connection failed: ${msg}. Retrying...` });
      
      try {
        await client.destroy();
      } catch (e) {}
      waClients.delete(guid);

      if (initTimeouts.has(guid)) {
        clearTimeout(initTimeouts.get(guid));
      }
      const retryTimeoutId = setTimeout(() => {
        initTimeouts.delete(guid);
        initWhatsApp(userId, isSuper, attempts + 1);
      }, delay);
      initTimeouts.set(guid, retryTimeoutId);
      return;
    }

    // Persistent failure after 5 attempts -> Wipe session
    console.error(`❌ [Failure] Persistent auth failure for [${guid}] after 5 attempts. Wiping session...`);
    authFailures.delete(guid);
    updateStatus(guid, 'disconnected', { reason: 'auth_failure' });

    try {
      const { User, SuperAdmin, WhatsAppSession } = require('./models');
      const account = isSuper ? await SuperAdmin.findById(userId) : await User.findById(userId);
      if (account) {
        account.whatsappNumber = null;
        await account.save();
        console.log(`✅ Database WhatsApp number cleared for [${guid}] due to auth failure`);
      }
      // Delete backup from DB
      await WhatsAppSession.deleteOne({ guid });
      console.log(`🧹 Deleted corrupt session backup from MongoDB for [${guid}] due to auth failure`);
    } catch (err) {
      console.error('Error clearing database whatsapp number / backup on auth failure:', err.message);
    }

    const sessionDir = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🧹 Deleted corrupt local session folder for [${guid}] due to auth failure`);
      }
    } catch (e) {
      console.error(`Failed to delete corrupt local session folder for [${guid}]:`, e.message);
    }

    try {
      await client.destroy();
    } catch (e) {}
    waClients.delete(guid);

    console.log(`ℹ️ [Auth Failure] Persistent authentication failure for [${guid}]. Client stopped.`);
  });

  client.on('message', async (msg) => {
    try {
      if (msg.from === 'status@broadcast') return;
      if (msg.from.includes('@g.us')) return; // Ignore Group Messages
      emitToUser(guid, 'whatsapp:message', { from: msg.from, body: msg.body, time: msg.timestamp });

      if (!isSuper) {
        const { AutoReply } = require('./models');
        const rules = await AutoReply.find({ active: true, userId: userId }).sort({ order: 1 });
        
        for (const rule of rules) {
          const body = (msg.body || '').toLowerCase();
          const matches = rule.triggerType === 'any' ? true : rule.triggerType === 'exact' ? body === rule.trigger.toLowerCase() : body.includes(rule.trigger.toLowerCase());
          if (matches) {
            // Check cooldown if delayHours > 0
            if (rule.delayHours && rule.delayHours > 0) {
              const cooldownKey = `ar_${userId}_${rule._id}_${msg.from}`;
              if (!global.autoReplyCooldowns) global.autoReplyCooldowns = new Map();
              const lastTime = global.autoReplyCooldowns.get(cooldownKey) || 0;
              const now = Date.now();
              const delayMs = rule.delayHours * 60 * 60 * 1000;
              if (now - lastTime < delayMs) {
                // User is in cooldown for this rule, do not reply and don't check other rules.
                break;
              }
              // Update cooldown
              global.autoReplyCooldowns.set(cooldownKey, now);
            }

            try {
              verifyClientReadyForSend(client);
              await enqueueMessage(guid, async () => {
                if (rule.mediaUrl) {
                  const media = await MessageMedia.fromUrl(rule.mediaUrl);
                  await client.sendMessage(msg.from, media, { caption: rule.response });
                } else {
                  await client.sendMessage(msg.from, rule.response);
                }
              });
            } catch (arErr) {
              console.error(`❌ [AutoReply] Send failed for [${guid}]:`, arErr.message);
            }
            break;
          }
        }
      }
    } catch (err) { console.error(`Message/AutoReply error [${guid}]:`, err.message); }
  });

  // ── Safe initialize with auto-retry and exponential backoff ──────────
  const tryInit = (attemptNum = 1) => {
    console.log(`🔄 WhatsApp init attempt ${attemptNum}/5 [${guid}]`);
    updateStatus(guid, 'generating_qr');
    client.initialize().catch(async (err) => {
      const msg = err.message || '';
      console.error(`❌ [Failure] Connection failed (initialize) for [${guid}] on attempt ${attemptNum}/5:`, msg);

      // Make sure we always destroy the failed browser instance to release file locks
      try {
        console.log(`🧹 [tryInit] Terminating failed browser for [${guid}]...`);
        await client.destroy();
        console.log(`✅ [tryInit] Failed browser destroyed for [${guid}]`);
      } catch (e) {
        console.error(`⚠️ [tryInit] Error destroying failed client [${guid}]:`, e.message);
      }
      waClients.delete(guid);

      if (attemptNum < 5) {
        const delay = Math.pow(2, attemptNum) * 1000; // 2s, 4s, 8s, 16s, 32s
        console.warn(`⚠️ WhatsApp init issue [${guid}] — retrying in ${delay / 1000}s (attempt ${attemptNum}/5)... Error: ${msg.substring(0, 80)}`);

        updateStatus(guid, 'connecting');
        
        if (initTimeouts.has(guid)) {
          clearTimeout(initTimeouts.get(guid));
        }
        const retryTimeoutId = setTimeout(() => {
          initTimeouts.delete(guid);
          _doInit(guid, userId, isSuper, attemptNum + 1);
        }, delay);
        initTimeouts.set(guid, retryTimeoutId);
      } else {
        console.error(`❌ WhatsApp init failed [${guid}] after ${attemptNum} attempts:`, msg);
        wipeCorruptSession(guid, userId, isSuper, `init_failed: ${msg}`);
        updateStatus(guid, 'disconnected', { reason: 'init_failed' });
      }
    });
  };
  tryInit(attempt);
}

// ── Socket.IO ────────────────────────────────────────────────
io.on('connection', (socket) => {

  // Client must identify itself first (sends logged-in userId and role)
  socket.on('whatsapp:identify', (data = {}) => {
    const { userId, role } = data;
    if (!userId) return; // Ignore if no userId is provided
    const isSuper = role === 'superadmin';
    const guid = isSuper ? `sa_${userId}` : `user_${userId}`;

    socket.join(`room_${guid}`);

    // Send this user's current status
    const status = waStatuses.get(guid) || 'disconnected';
    const client = waClients.get(guid);
    let phone = null;
    let name = null;
    if (status === 'connected' && client && client.info) {
      phone = client.info.wid?.user || null;
      name = client.info.pushname || null;
    }
    socket.emit('whatsapp:status', { status, phone, name });
  });

  socket.on('whatsapp:connect', (data = {}) => {
    const { userId, role } = data;
    if (!userId) return;
    const isSuper = role === 'superadmin';
    initWhatsApp(userId, isSuper);
  });

  socket.on('whatsapp:disconnect', async (data = {}) => {
    const { userId, role } = data;
    if (!userId) return;
    const isSuper = role === 'superadmin';
    const guid = isSuper ? `sa_${userId}` : `user_${userId}`;

    console.log(`🔌 [disconnect] Explicit disconnect requested for [${guid}]`);

    // Mark as explicitly logging out so disconnected handler knows not to restart it
    updateStatus(guid, 'logging_out');

    const client = waClients.get(guid);
    if (client) {
      let logoutSucceeded = false;
      try {
        if (isClientReady(client)) {
          console.log(`🔌 [disconnect] Client is ready. Attempting clean client.logout() for [${guid}]...`);
          await Promise.race([
            client.logout().then(() => {
              logoutSucceeded = true;
              console.log(`✅ [disconnect] client.logout() resolved for [${guid}]`);
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timed out')), 8000))
          ]);
        } else {
          console.log(`🔌 [disconnect] Client is not fully ready/connected. Skipping client.logout() and proceeding to destroy.`);
        }
      } catch (err) {
        console.warn(`⚠️ [disconnect] client.logout() failed or timed out for [${guid}]:`, err.message);
      }

      // If the client is still in the map, destroy it
      if (waClients.has(guid)) {
        console.log(`🧹 [disconnect] Destroying client for [${guid}]...`);
        try {
          await client.destroy();
        } catch (e) {
          console.error(`⚠️ [disconnect] Error destroying client [${guid}]:`, e.message);
        }
        waClients.delete(guid);
      }
    }

    // Clear whatsappNumber in DB and delete backup
    try {
      const { User, SuperAdmin, WhatsAppSession } = require('./models');
      const account = isSuper ? await SuperAdmin.findById(userId) : await User.findById(userId);
      if (account) {
        account.whatsappNumber = null;
        await account.save();
        console.log(`✅ Database WhatsApp number cleared for [${guid}] on explicit disconnect`);
      }
      await WhatsAppSession.deleteOne({ guid });
      console.log(`🧹 Deleted session backup from MongoDB for [${guid}] on explicit disconnect`);
    } catch (err) {
      console.error('Error clearing database whatsapp number:', err.message);
    }

    // Delete local session folder
    const sessionDir = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🧹 Deleted local session folder for [${guid}] on explicit disconnect`);
      }
    } catch (e) {
      console.error(`Failed to delete session folder for [${guid}]:`, e.message);
    }

    updateStatus(guid, 'disconnected');
  });
});

// ── Cron: load active schedules on startup ───────────────────
async function loadSchedules() {
  try {
    const { Schedule, Automation } = require('./models');

    // Load existing old schedules
    const schedules = await Schedule.find({ active: true });
    schedules.forEach(s => startScheduleCron(s));

    console.log(`📅 Loaded ${schedules.length} old schedules`);

    // Automation Engine Scheduler (runs every minute to check for due automations)
    cron.schedule('* * * * *', async () => {
      try {
        const getClientForUser = app.get('getClientForUser');
        const automations = await Automation.find({
            status: 'active',
            triggerType: 'schedule',
            scheduledAt: { $lte: new Date() } // Past or current time
        });

        for (const auto of automations) {
          console.log(`⏰ Scheduler triggered automation: ${auto.name} for ${auto.isSuper ? 'SA' : 'User'} ${auto.userId}`);
          const userClient = getClientForUser(auto.userId, auto.isSuper);

          if (!userClient) {
            console.log(`⚠️ User ${auto.userId} not connected. Skipping automation.`);
            continue;
          }

          const { runAutomation } = require('./utils/automationEngine');
          const getClient = () => getClientForUser(auto.userId, auto.isSuper);
          runAutomation(auto._id, getClient).catch(e => console.error(e));

          // mark as completed to avoid rerunning
          auto.status = 'completed';
          await auto.save();
        }
      } catch (err) {
        console.error('Automation Scheduler Error:', err.message);
      }
    });
  } catch { }
}

const activeCrons = {};

async function runScheduledJob(schedule) {
  const client = getClientForUser(schedule.userId, schedule.isSuper);
  if (!client) return console.log(`Sheduler: Client not ready for ${schedule.isSuper ? 'SA' : 'User'} ${schedule.userId}`);
  console.log(`🚀 Running schedule: ${schedule.name}`);

  // Prepare media if any
  let media = null;
  if (schedule.mediaUrl) {
    try { media = await MessageMedia.fromUrl(schedule.mediaUrl); }
    catch (e) { console.error('Error loading media:', e.message); }
  }

  const guid = schedule.isSuper ? `sa_${schedule.userId}` : `user_${schedule.userId}`;

  // 1. Send to contacts
  for (const phone of (schedule.contacts || [])) {
    try {
      verifyClientReadyForSend(client);
      await enqueueMessage(guid, async () => {
        if (media) {
          await client.sendMessage(`${phone}@c.us`, media, { caption: schedule.message });
        } else {
          await client.sendMessage(`${phone}@c.us`, schedule.message);
        }
      });
    } catch (err) {
      console.error(`Error sending scheduled msg to ${phone}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // 2. Send to groups
  for (const groupId of (schedule.targetGroups || [])) {
    try {
      verifyClientReadyForSend(client);
      await enqueueMessage(guid, async () => {
        if (media) {
          await client.sendMessage(groupId, media, { caption: schedule.message });
        } else {
          await client.sendMessage(groupId, schedule.message);
        }
      });
    } catch (err) {
      console.error(`Error sending scheduled msg to group ${groupId}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  schedule.lastRun = new Date();
  schedule.runCount += 1;
  await schedule.save();
}

function startScheduleCron(schedule) {
  const sId = schedule._id.toString();
  // Clear existing
  if (activeCrons[sId]) {
    if (typeof activeCrons[sId].stop === 'function') {
      activeCrons[sId].stop();
    } else {
      clearTimeout(activeCrons[sId]);
    }
    delete activeCrons[sId];
  }

  if (!schedule.active) return;

  if (schedule.isRecurring) {
    if (schedule.cronExpr && cron.validate(schedule.cronExpr)) {
      activeCrons[sId] = cron.schedule(schedule.cronExpr, () => runScheduledJob(schedule));
    }
  } else if (schedule.scheduledAt) {
    const delay = new Date(schedule.scheduledAt).getTime() - Date.now();
    if (delay > 0) {
      activeCrons[sId] = setTimeout(async () => {
        await runScheduledJob(schedule);
        schedule.active = false;
        await schedule.save();
        delete activeCrons[sId];
      }, delay);
    }
  }
}
app.set('activeCrons', activeCrons);
app.set('startScheduleCron', startScheduleCron);

// ── Daily Subscription Expiry Check (4 AM) ─────────────────────
const syncToSheets = require('./utils/syncSheets');
cron.schedule('0 4 * * *', async () => {
  console.log('🕒 Running daily subscription expiry check...');
  try {
    const { User } = require('./models');
    const expired = await User.find({
        subStatus: { $in: ['active', 'trial'] },
        subExpiry: { $lt: new Date() }
    });
    for (const user of expired) {
      user.subStatus = 'expired';
      await user.save();
      await syncToSheets(user);
      console.log(`📉 Sub expired and synced: ${user.email}`);
    }
  } catch (e) {
    console.error('Expiry Check Error:', e.message);
  }
});

// ── Pending Payments Auto-Update (Every 5 Mins) ────────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const { Subscription, User } = require('./models');
    const Razorpay = require('razorpay');

    // Only run if keys exist
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return;

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Fetch pending payments older than 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

    const pendingSubs = await Subscription.find({
        status: 'pending',
        createdAt: { $lt: fifteenMinsAgo }
    });

    if (pendingSubs.length > 0) console.log(`🔄 Checking ${pendingSubs.length} pending payments...`);

    for (const sub of pendingSubs) {
      try {
        if (!sub.razorpayOrderId) {
          sub.status = 'failed';
          await sub.save();
          continue;
        }

        const order = await razorpay.orders.fetch(sub.razorpayOrderId);

        if (order.status === 'paid') {
          // If the order was actually paid but the frontend crashed or network failed
          const payments = await razorpay.orders.fetchPayments(sub.razorpayOrderId);
          if (payments && payments.items && payments.items.length > 0) {
            const capturedPayment = payments.items.find(p => p.status === 'captured');
            if (capturedPayment) {
              sub.status = 'paid';
              sub.razorpayPaymentId = capturedPayment.id;

              const { PLANS } = require('./routes/payments');
              const planData = PLANS[sub.plan] || PLANS.user_monthly;

              sub.startDate = new Date();
              sub.endDate = new Date(Date.now() + planData.days * 24 * 60 * 60 * 1000);
              await sub.save();

              // Update User status automatically
              await User.updateOne(
                { _id: sub.userId },
                {
                  subStatus: 'active',
                  subExpiry: sub.endDate,
                  isAdmin: planData.type === 'admin'
                }
              );

              console.log(`✅ Auto-recovered payment for order ${sub.razorpayOrderId}`);
              continue; // jump to next subscription
            }
          }
        }

        // If it reaches here, the order is not paid (i.e. 'created' or 'attempted') and older than 15m
        sub.status = 'failed';
        await sub.save();
        console.log(`❌ Auto-failed abandoned payment for order ${sub.razorpayOrderId}`);

      } catch (err) {
        console.error(`Error checking subscription ${sub._id}:`, err.message);
      }
    }
  } catch (e) {
    console.error('Pending Payment Check Cron Error:', e.message);
  }
});

// ── React Fallback ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// ── Pre-populate WhatsApp Web Cache ───────────────────────────
const WEB_VERSION = '2.3000.1039860984-alpha';
async function ensureWebCacheExists() {
  const cacheDir = path.join(__dirname, '.wwebjs_cache');
  const cachePath = path.join(cacheDir, `${WEB_VERSION}.html`);
  if (fs.existsSync(cachePath)) {
    console.log(`✅ WhatsApp Web Version Cache matches target [${WEB_VERSION}].`);
    return;
  }
  
  console.log(`📥 Downloading WhatsApp Web HTML cache version ${WEB_VERSION} for ultra-fast startup...`);
  try {
    const fetch = require('node-fetch');
    const url = `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WEB_VERSION}.html`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, html, 'utf-8');
    console.log(`✨ Local WhatsApp Web cache successfully populated: ${WEB_VERSION}`);
  } catch (err) {
    console.error(`⚠️ Failed to pre-populate WhatsApp cache:`, err.message);
  }
}

// ── Auto-Start Existing WhatsApp Sessions on Boot ─────────────
async function bootstrap() {
  await ensureWebCacheExists();

  // Clear/reset any interrupted campaigns on startup
  try {
    const { Campaign } = require('./models');
    const resetCampaigns = await Campaign.updateMany(
      { status: 'running' },
      { status: 'draft' }
    );
    if (resetCampaigns.modifiedCount > 0) {
      console.log(`🧹 Reset ${resetCampaigns.modifiedCount} interrupted campaigns from 'running' to 'draft' status.`);
    }
  } catch (err) {
    console.error('Failed to reset interrupted campaigns:', err.message);
  }

  // Scan MongoDB for saved sessions and restore/initialize them
  try {
    const { WhatsAppSession, User, SuperAdmin } = require('./models');
    const mongoose = require('mongoose');
    const sessions = await WhatsAppSession.find();
    console.log(`🔄 Scanning database: found ${sessions.length} saved sessions...`);
    
    const startedUsers = new Set();
    let index = 0;

    for (const session of sessions) {
      const guid = session.guid;
      const isSuper = guid.startsWith('sa_');
      const userId = guid.replace('sa_', '').replace('user_', '');

      if (startedUsers.has(userId)) {
        continue;
      }

      try {
        let accountExists = false;
        let isSubscriptionActive = true;

        if (mongoose.Types.ObjectId.isValid(userId)) {
          if (isSuper) {
            const admin = await SuperAdmin.findById(userId);
            if (admin) {
              accountExists = true;
            } else {
              const user = await User.findById(userId);
              if (user && (user.role === 'superadmin' || user.isAdmin)) {
                accountExists = true;
              }
            }
          } else {
            const user = await User.findById(userId);
            if (user) {
              accountExists = true;
              isSubscriptionActive = user.hasActiveSubscription();
            }
          }
        }

        if (!accountExists) {
          console.log(`🧹 [bootstrap] Deleting corrupt/non-existent account session [${guid}] from DB`);
          await WhatsAppSession.deleteOne({ guid });
          continue;
        }

        if (!isSubscriptionActive) {
          console.log(`⚠️ [bootstrap] Skipping expired subscription user: ${userId} (guid: ${guid})`);
          continue;
        }

        startedUsers.add(userId);
        const currentIndex = index++;
        
        // Delay boot of each session to prevent CPU spike
        setTimeout(async () => {
          console.log(`🚀 [bootstrap] Restoring and resuming WhatsApp session: ${guid}`);
          initWhatsApp(userId, isSuper);
        }, currentIndex * 4000);

      } catch (err) {
        console.error(`Error validating user ${userId} on boot:`, err.message);
      }
    }
  } catch (err) {
    console.error('Failed to bootstrap sessions from DB:', err.message);
  }

  // 🛡️ 24/7 Keep-Alive Interval Daemon: Runs every 30 seconds
  setInterval(async () => {
    try {
      const { WhatsAppSession, User, SuperAdmin } = require('./models');
      const mongoose = require('mongoose');
      const sessions = await WhatsAppSession.find();

      for (const session of sessions) {
        const guid = session.guid;
        const isSuper = guid.startsWith('sa_');
        const userId = guid.replace('sa_', '').replace('user_', '');

        const client = waClients.get(guid);
        const status = waStatuses.get(guid);
        const timestamp = statusTimestamps.get(guid) || Date.now();
        const timeDiff = Date.now() - timestamp;

        // Stuck Connection Recovery: If state is 'connecting' or 'qr' for more than 3 minutes, wipe corrupt session
        if (client && (status === 'connecting' || status === 'qr') && timeDiff > 180000) {
          console.warn(`🚨 [Keep-Alive] Client for [${guid}] is stuck in [${status}] for ${(timeDiff / 1000).toFixed(0)}s. Wiping corrupt session...`);
          try {
            await client.destroy();
          } catch (e) {}
          waClients.delete(guid);
          wipeCorruptSession(guid, userId, isSuper, `stuck_in_${status}_for_${(timeDiff / 1000).toFixed(0)}s`);
          updateStatus(guid, 'disconnected', { reason: 'stuck_timeout' });
          continue;
        }

        // Stuck Connection / Frozen Browser Recovery
        if (client && client.pupPage && !client.pupPage.isClosed() && status === 'connected') {
          try {
            // Ping the browser with a 5-second timeout
            await Promise.race([
              client.pupPage.evaluate(() => 1),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timed out')), 5000))
            ]);
          } catch (err) {
            console.error(`🚨 [Keep-Alive] Browser for [${guid}] is frozen/unresponsive: ${err.message}. Triggering automatic recovery...`);
            try {
              await client.destroy();
            } catch (destroyErr) {
              console.warn(`⚠️ Error destroying unresponsive client [${guid}]:`, destroyErr.message);
            }
            waClients.delete(guid);
            cleanSessionLocks(guid);
            updateStatus(guid, 'connecting', { error: 'Reconnecting due to frozen browser...' });
            
            // Wait 2s and restart
            setTimeout(() => {
              initWhatsApp(userId, isSuper);
            }, 2000);
            continue;
          }
        }

        // Active client exists, but status is 'disconnected' (unexpected crash)
        const activeClient = waClients.get(guid);
        const currentStatus = waStatuses.get(guid);
        if (activeClient && currentStatus === 'disconnected') {
          console.log(`🛡️ [Keep-Alive] Client exists for [${guid}] but status is disconnected. Clean resetting...`);
          try { await activeClient.destroy(); } catch (e) {}
          waClients.delete(guid);
        }

        // Re-fetch client/status
        const finalClient = waClients.get(guid);
        const finalStatus = waStatuses.get(guid);

        // If no active client exists in waClients AND we are not currently connecting or logging out
        if (!finalClient && finalStatus !== 'connecting' && finalStatus !== 'qr' && finalStatus !== 'reconnecting' && finalStatus !== 'logging_out') {
          try {
            let accountExists = false;
            let isSubscriptionActive = true;

            if (mongoose.Types.ObjectId.isValid(userId)) {
              if (isSuper) {
                const admin = await SuperAdmin.findById(userId);
                if (admin) {
                  accountExists = true;
                } else {
                  const user = await User.findById(userId);
                  if (user && (user.role === 'superadmin' || user.isAdmin)) {
                    accountExists = true;
                  }
                }
              } else {
                const user = await User.findById(userId);
                if (user) {
                  accountExists = true;
                  isSubscriptionActive = user.hasActiveSubscription();
                }
              }
            }

            if (!accountExists) {
              console.log(`🧹 [Keep-Alive] Deleting session for non-existent account: ${guid}`);
              await WhatsAppSession.deleteOne({ guid });
              const sessionDir = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
              if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
              }
              continue;
            }

            if (!isSubscriptionActive) {
              continue; // Do not restore expired subscriptions
            }

            console.log(`🛡️ [Keep-Alive] Session active in DB for [${guid}] but client is missing or inactive. Status: ${finalStatus || 'none'}. Restoring...`);
            initWhatsApp(userId, isSuper);
          } catch (dbErr) {
            console.error(`Error validating user ${userId} in keep-alive:`, dbErr.message);
          }
        }
      }
    } catch (e) {
      console.error('[Keep-Alive Daemon Error]:', e.message);
    }
  }, 30000);

  // ⏰ Periodic Session Backup Daemon: Runs every 30 minutes to back up active Chrome sessions to MongoDB
  setInterval(async () => {
    console.log('⏰ Running periodic WhatsApp session backup to database...');
    for (const [guid, client] of waClients) {
      const status = waStatuses.get(guid);
      if (status === 'connected' && client && client.info) {
        try {
          console.log(`💾 Periodic backup of session [${guid}] to MongoDB...`);
          await saveSessionToDB(guid);
        } catch (err) {
          console.error(`Failed to periodically back up session [${guid}]:`, err.message);
        }
      }
    }
  }, 30 * 60 * 1000);
}

const { exec } = require('child_process');
exec('which chromium || which chromium-browser || echo "not found"', (err, stdout, stderr) => {
    console.log('🔍 System Chromium path:', stdout.trim());
});
exec('chromium --version || chromium-browser --version || echo "no version"', (err, stdout, stderr) => {
    console.log('🔍 System Chromium version:', stdout.trim());
});
console.log('🔍 PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 [Server] Server started on port ${PORT}`);
  console.log(`🚀 Server on http://localhost:${PORT}`);
});
