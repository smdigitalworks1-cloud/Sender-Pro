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
require('dotenv').config({ override: true });
if (originalPort) process.env.PORT = originalPort; // Restore environment PORT to prevent override

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
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

}).catch(e => {
    console.error(`❌ MongoDB connection error:`, e.message);
});

// ── Per-User WhatsApp State ───────────────────────────────────
const waClients = new Map(); // globalUid → Client (globalUid is "user_#ID" or "sa_#ID")
const waStatuses = new Map(); // globalUid → status string
const pendingInits = new Set(); // Tracks active initialization sequences to prevent concurrent double-initializations

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

async function initWhatsApp(userId, isSuper = false) {
  const guid = isSuper ? `sa_${userId}` : `user_${userId}`;
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
      // Wait to ensure all file handles are closed
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    _doInit(guid, userId, isSuper);
  } finally {
    pendingInits.delete(guid);
  }
}

function _doInit(guid, userId, isSuper) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: guid }),
    webVersion: '2.3000.1039860984-alpha',
    webVersionCache: {
      type: 'local',
      path: path.join(__dirname, '.wwebjs_cache'),
      strict: false
    },
    puppeteer: {
      headless: "new",
      protocolTimeout: 180000, // ⏱️ 3 min timeout to avoid ProtocolError crashes
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--no-zygote',
        '--disable-accelerated-2d-canvas',
      ],
    },
  });

  waClients.set(guid, client);
  waStatuses.set(guid, 'connecting');
  emitToUser(guid, 'whatsapp:status', { status: 'connecting' });

  client.on('qr', async (qr) => {
    console.log(`📲 QR event received for [${guid}]`);
    try {
      const qrImg = await qrcode.toDataURL(qr);
      waStatuses.set(guid, 'qr');
      emitToUser(guid, 'whatsapp:qr', { qr: qrImg });
      emitToUser(guid, 'whatsapp:status', { status: 'qr' });
    } catch (err) { console.error(`QR error [${guid}]:`, err.message); }
  });

  client.on('ready', async () => {
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

      waStatuses.set(guid, 'connected');
      emitToUser(guid, 'whatsapp:status', {
        status: 'connected',
        phone: connectedNumber,
        name: info.pushname,
      });
      console.log(`✅ WhatsApp ready [${guid}]:`, connectedNumber);
    } catch (err) { console.error(`Ready event error [${guid}]:`, err.message); }
  });

  client.on('disconnected', async (reason) => {
    const status = waStatuses.get(guid);
    const sessionDir = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
    const shouldReconnect = status !== 'logging_out' && reason !== 'LOGOUT' && fs.existsSync(sessionDir);

    waStatuses.set(guid, 'disconnected');
    
    // Explicitly destroy client to close active Puppeteer browser and release file locks
    try {
      console.log(`🧹 [disconnected] Terminating browser on disconnect for [${guid}]...`);
      await client.destroy();
      console.log(`✅ [disconnected] Browser terminated for [${guid}]`);
    } catch (e) {
      console.error(`⚠️ [disconnected] Error destroying client on disconnect [${guid}]:`, e.message);
    }
    
    waClients.delete(guid);
    emitToUser(guid, 'whatsapp:status', { status: 'disconnected', reason });
    console.log(`❌ WhatsApp disconnected [${guid}]:`, reason);

    if (shouldReconnect) {
      console.log(`🔄 Auto-restarting WhatsApp for [${guid}] in 10s...`);
      setTimeout(() => initWhatsApp(userId, isSuper), 10000);
    }
  });

  client.on('auth_failure', async (msg) => {
    console.error(`🔐 Auth failure [${guid}]:`, msg);
    waStatuses.set(guid, 'auth_failure');
    try {
      await client.destroy();
    } catch (e) {}
    waClients.delete(guid);
    emitToUser(guid, 'whatsapp:status', { status: 'auth_failure' });
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

            if (rule.mediaUrl) {
              const media = await MessageMedia.fromUrl(rule.mediaUrl);
              await client.sendMessage(msg.from, media, { caption: rule.response });
            } else {
              await msg.reply(rule.response);
            }
            break;
          }
        }
      }
    } catch (err) { console.error(`Message/AutoReply error [${guid}]:`, err.message); }
  });

  // ── Safe initialize with auto-retry on ProtocolError ──────────
  const tryInit = (attempt = 1) => {
    console.log(`🔄 WhatsApp init attempt ${attempt} [${guid}]`);
    client.initialize().catch(async (err) => {
      const msg = err.message || '';
      const isTimeout = msg.includes('ProtocolError') || msg.includes('protocolTimeout') || msg.includes('timed out');
      const isStuck = msg.includes('already running') || msg.includes('context was destroyed') || msg.includes('detached');

      // Make sure we always destroy the failed browser instance to release file locks
      try {
        console.log(`🧹 [tryInit] Terminating failed browser for [${guid}]...`);
        await client.destroy();
        console.log(`✅ [tryInit] Failed browser destroyed for [${guid}]`);
      } catch (e) {
        console.error(`⚠️ [tryInit] Error destroying failed client [${guid}]:`, e.message);
      }
      waClients.delete(guid);

      if ((isTimeout || isStuck) && attempt < 3) {
        console.warn(`⚠️ WhatsApp init issue [${guid}] — retrying in 10s (attempt ${attempt}/3)... Error: ${msg.substring(0, 50)}`);

        if (isStuck) {
          // Now that the old browser is destroyed, delete the corrupt session folder cleanly without EPERM errors
          const fs = require('fs');
          const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${guid}`);
          try {
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true, force: true });
              console.log(`🧹 Cleaned corrupt session folder for [${guid}]`);
            }
          } catch (e) { console.error('Cleanup error:', e.message); }
        }

        waStatuses.set(guid, 'connecting');
        emitToUser(guid, 'whatsapp:status', { status: 'connecting' });
        
        // Spawn a completely fresh client instance for the retry
        setTimeout(() => {
          _doInit(guid, userId, isSuper);
        }, 10000);
      } else {
        console.error(`❌ WhatsApp init failed [${guid}] after ${attempt} attempts:`, msg);
        waStatuses.set(guid, 'disconnected');
        emitToUser(guid, 'whatsapp:status', { status: 'disconnected', reason: 'init_failed' });
      }
    });
  };
  tryInit();
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

    // Mark as explicitly logging out so disconnected handler knows not to restart it
    waStatuses.set(guid, 'logging_out');

    const client = waClients.get(guid);
    if (client) {
      try { await client.logout(); } catch { }
      try { await client.destroy(); } catch { }
      waClients.delete(guid);
    }
    waStatuses.set(guid, 'disconnected');
    emitToUser(guid, 'whatsapp:status', { status: 'disconnected' });
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
          runAutomation(auto._id, userClient).catch(e => console.error(e));

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

  // 1. Send to contacts
  for (const phone of (schedule.contacts || [])) {
    try {
      if (media) {
        await client.sendMessage(`${phone}@c.us`, media, { caption: schedule.message });
      } else {
        await client.sendMessage(`${phone}@c.us`, schedule.message);
      }
    } catch (err) {
      console.error(`Error sending scheduled msg to ${phone}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // 2. Send to groups
  for (const groupId of (schedule.targetGroups || [])) {
    try {
      if (media) {
        await client.sendMessage(groupId, media, { caption: schedule.message });
      } else {
        await client.sendMessage(groupId, schedule.message);
      }
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
const fs = require('fs');
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
const authDir = path.join(__dirname, '.wwebjs_auth');
async function bootstrap() {
  await ensureWebCacheExists();
  if (fs.existsSync(authDir)) {
    console.log('🔄 Scanning for existing WhatsApp sessions...');
    const startedUsers = new Set();
    let index = 0;
    fs.readdirSync(authDir).forEach((dir) => {
      if (dir.startsWith('session-')) {
        const guid = dir.replace('session-', '');
        const isSuper = guid.startsWith('sa_');
        const userId = guid.replace('sa_', '').replace('user_', '');

        if (startedUsers.has(userId)) {
          console.log(`⚠️ Skipping duplicate WhatsApp session boot for user: ${userId} (guid: ${guid})`);
          return;
        }
        startedUsers.add(userId);

        const currentIndex = index++;
        // Delay each boot by 4 seconds to prevent CPU overload
        setTimeout(() => {
          console.log(`🚀 Auto-resuming WhatsApp session: ${guid}`);
          initWhatsApp(userId, isSuper);
        }, currentIndex * 4000);
      }
    });
  }

  // 🛡️ 24/7 Keep-Alive Interval Daemon: Runs every 30 seconds
  setInterval(() => {
    if (fs.existsSync(authDir)) {
      fs.readdirSync(authDir).forEach((dir) => {
        if (dir.startsWith('session-')) {
          const guid = dir.replace('session-', '');
          const isSuper = guid.startsWith('sa_');
          const userId = guid.replace('sa_', '').replace('user_', '');

          const client = waClients.get(guid);
          const status = waStatuses.get(guid);

          // If no active client exists in waClients AND we are not currently trying to connect, scan QR, or logging out.
          if (!client && status !== 'connecting' && status !== 'qr' && status !== 'logging_out') {
            console.log(`🛡️ [Keep-Alive] Session folder exists for [${guid}] but client is missing or inactive. Status: ${status || 'none'}. Restoring...`);
            initWhatsApp(userId, isSuper);
          }
        }
      });
    }
  }, 30000);
}
bootstrap();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
