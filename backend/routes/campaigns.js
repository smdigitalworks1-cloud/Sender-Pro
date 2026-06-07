const express = require('express');
const protect = require('../middleware/auth');
const { Campaign, Contact, GlobalVar } = require('../models');
const { MessageMedia } = require('whatsapp-web.js');
const fetch = require('node-fetch');
const router = express.Router();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadMediaWithTimeout(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const base64Data = buffer.toString('base64');
    const filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || 'file';
    return new MessageMedia(contentType, base64Data, filename);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── In-memory set of actively running campaign IDs ──────────────
// Once a campaign is in here, it CANNOT be stopped by delete/stop
const runningCampaigns = new Set();

router.get('/', protect, async (req, res) => {
  try {
    const campaigns = await Campaign.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    const { name, message, contacts, delay, mediaUrl } = req.body;
    const campaign = await Campaign.create({
      userId: req.user._id,
      isSuper: req.user.role === 'superadmin',
      name, message, contacts,
      delay: delay || 3,
      mediaUrl: mediaUrl || '',
      total: contacts.length,
    });
    res.status(201).json(campaign);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/:id/start', protect, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });

    const client = req.app.get('getClientForUser')(req.user._id, campaign.isSuper);
    if (!client) return res.status(400).json({ message: 'WhatsApp not connected' });
    if (campaign.status === 'running') return res.status(400).json({ message: 'Already running' });

    campaign.status = 'running';
    campaign.startedAt = new Date();
    campaign.sent = 0;
    campaign.failed = 0;
    await campaign.save();

    // Mark as protected — cannot be stopped externally while sending
    runningCampaigns.add(campaign._id.toString());
    res.json({ message: 'Campaign started' });

    // Background execution — runs until ALL messages sent, regardless of delete/stop
    (async () => {
      try {
        const globalVars = await GlobalVar.find({ userId: campaign.userId });
        const phoneList = Array.isArray(campaign.contacts)
          ? campaign.contacts
          : (typeof campaign.contacts === 'string' ? JSON.parse(campaign.contacts || '[]') : []);

        const results = [];

        // Pre-download media once outside the loop with a strict timeout
        let media = null;
        if (campaign.mediaUrl) {
          try {
            console.log(`📥 Downloading campaign media once from: ${campaign.mediaUrl}`);
            media = await downloadMediaWithTimeout(campaign.mediaUrl);
          } catch (e) {
            console.error('⚠️ Error downloading campaign media:', e.message);
          }
        }

        for (const phone of phoneList) {
          // Abort loop immediately if client is completely disconnected
          let activeClient = req.app.get('getClientForUser')(campaign.userId, campaign.isSuper);
          if (!activeClient || !activeClient.info) {
            console.log(`[Campaign] Client not ready for user ${campaign.userId}. Retrying connection...`);
            let retries = 0;
            const maxRetries = 3;
            while (retries < maxRetries && (!activeClient || !activeClient.info)) {
              await sleep(2000);
              activeClient = req.app.get('getClientForUser')(campaign.userId, campaign.isSuper);
              retries++;
            }
            if (!activeClient || !activeClient.info) {
              throw new Error('WhatsApp client disconnected. Aborting campaign loop.');
            }
          }

          let contact = null;
          try {
            const chatId = `${phone}@c.us`;
            console.log(`📤 [Campaign] Sending to: ${phone}`);

            contact = await Contact.findOne({ userId: campaign.userId, phone });
            let personalizedMsg = campaign.message;

            // 1. Replace global variables first
            for (const gv of globalVars) {
              const regex = new RegExp(`\\{\\{${gv.key}\\}\\}`, 'gi');
              personalizedMsg = personalizedMsg.replace(regex, gv.value);
            }

            // 2. Replace contact-specific variables
            if (contact) {
              personalizedMsg = personalizedMsg.replace(/\{\{name\}\}/gi, contact.name || 'Friend');
              personalizedMsg = personalizedMsg.replace(/\{\{phone\}\}/gi, contact.phone || phone);
              if (contact.variables && typeof contact.variables === 'object') {
                for (const [key, value] of Object.entries(contact.variables)) {
                  const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
                  personalizedMsg = personalizedMsg.replace(regex, value || '');
                }
              }
            } else {
              // No contact record found — use phone as fallback
              personalizedMsg = personalizedMsg.replace(/\{\{name\}\}/gi, 'Friend');
              personalizedMsg = personalizedMsg.replace(/\{\{phone\}\}/gi, phone);
            }

            // 3. Strip any remaining unreplaced {{variable}} placeholders
            personalizedMsg = personalizedMsg.replace(/\{\{[^}]+\}\}/g, '');

            if (media) {
              await activeClient.sendMessage(chatId, media, { caption: personalizedMsg });
            } else {
              await activeClient.sendMessage(chatId, personalizedMsg);
            }
            campaign.sent += 1;
            console.log(`✅ [Campaign] Sent to ${phone}`);
            results.push({ phone, name: contact ? contact.name : 'Unknown', status: 'sent', time: new Date() });
          } catch (err) {
            console.error(`❌ [Campaign] Send failed to ${phone}:`, err.message);
            campaign.failed += 1;
            results.push({ phone, name: contact ? contact.name : 'Unknown', status: 'failed', error: err.message, time: new Date() });
          }
          campaign.results = results;
          await campaign.save();
          await sleep(campaign.delay * 1000);
        }
      } catch (e) {
        console.error('Campaign background error:', e.message);
      } finally {
        // Done — remove from protected set and finalize
        runningCampaigns.delete(campaign._id.toString());
        campaign.status = campaign.failed === campaign.total ? 'failed' : 'completed';
        campaign.finishedAt = new Date();
        await campaign.save();
      }
    })();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Stop — blocked if campaign is actively sending
router.post('/:id/stop', protect, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });

    if (runningCampaigns.has(campaign._id.toString())) {
      return res.status(400).json({ message: '⚠️ Campaign is actively sending. It will complete all messages before stopping.' });
    }

    campaign.status = 'failed';
    campaign.finishedAt = new Date();
    await campaign.save();
    
    res.json(campaign);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Delete — blocked if campaign is actively sending
router.delete('/:id', protect, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });

    if (runningCampaigns.has(campaign._id.toString())) {
      return res.status(400).json({ message: '⚠️ Campaign is actively sending. It cannot be deleted until all messages are delivered.' });
    }

    await Campaign.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Resend
router.post('/:id/resend', protect, async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });
    if (campaign.status === 'running') return res.status(400).json({ message: 'Campaign already running' });
    if (campaign.status === 'draft') return res.status(400).json({ message: 'Use Start for draft campaigns' });

    const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
    if (!client) return res.status(400).json({ message: 'WhatsApp not connected' });

    campaign.status = 'running';
    campaign.startedAt = new Date();
    campaign.finishedAt = null;
    campaign.sent = 0;
    campaign.failed = 0;
    await campaign.save();

    runningCampaigns.add(campaign._id.toString());
    res.json({ message: 'Campaign resending' });

    (async () => {
      try {
        const globalVars = await GlobalVar.find({ userId: campaign.userId });
        const phoneList = Array.isArray(campaign.contacts)
          ? campaign.contacts
          : (typeof campaign.contacts === 'string' ? JSON.parse(campaign.contacts || '[]') : []);

        const results = [];

        // Pre-download media once outside the loop with a strict timeout
        let media = null;
        if (campaign.mediaUrl) {
          try {
            console.log(`📥 Downloading campaign media once for resend from: ${campaign.mediaUrl}`);
            media = await downloadMediaWithTimeout(campaign.mediaUrl);
          } catch (e) {
            console.error('⚠️ Error downloading campaign resend media:', e.message);
          }
        }

        for (const phone of phoneList) {
          // Abort loop immediately if client is completely disconnected
          let activeClient = req.app.get('getClientForUser')(campaign.userId, req.user.role === 'superadmin');
          if (!activeClient || !activeClient.info) {
            console.log(`[Resend] Client not ready for user ${campaign.userId}. Retrying connection...`);
            let retries = 0;
            const maxRetries = 3;
            while (retries < maxRetries && (!activeClient || !activeClient.info)) {
              await sleep(2000);
              activeClient = req.app.get('getClientForUser')(campaign.userId, req.user.role === 'superadmin');
              retries++;
            }
            if (!activeClient || !activeClient.info) {
              throw new Error('WhatsApp client disconnected. Aborting campaign resend loop.');
            }
          }

          let contact = null;
          try {
            const chatId = `${phone}@c.us`;
            console.log(`📤 [Resend] Sending to: ${phone}`);
            contact = await Contact.findOne({ userId: campaign.userId, phone });
            let personalizedMsg = campaign.message;

            // 1. Replace global variables first
            for (const gv of globalVars) {
              const regex = new RegExp(`\\{\\{${gv.key}\\}\\}`, 'gi');
              personalizedMsg = personalizedMsg.replace(regex, gv.value);
            }

            // 2. Replace contact-specific variables
            if (contact) {
              personalizedMsg = personalizedMsg.replace(/\{\{name\}\}/gi, contact.name || 'Friend');
              personalizedMsg = personalizedMsg.replace(/\{\{phone\}\}/gi, contact.phone || phone);

              if (contact.variables && typeof contact.variables === 'object') {
                for (const [key, value] of Object.entries(contact.variables)) {
                  const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
                  personalizedMsg = personalizedMsg.replace(regex, value || '');
                }
              }
            } else {
              personalizedMsg = personalizedMsg.replace(/\{\{name\}\}/gi, 'Friend');
              personalizedMsg = personalizedMsg.replace(/\{\{phone\}\}/gi, phone);
            }

            // 3. Strip any remaining unreplaced {{variable}} placeholders
            personalizedMsg = personalizedMsg.replace(/\{\{[^}]+\}\}/g, '');

            if (media) {
              await activeClient.sendMessage(chatId, media, { caption: personalizedMsg });
            } else {
              await activeClient.sendMessage(chatId, personalizedMsg);
            }
            campaign.sent += 1;
            console.log(`✅ [Resend] Sent to ${phone}`);
            results.push({ phone, name: contact ? contact.name : 'Unknown', status: 'sent', time: new Date() });
          } catch (err) {
            console.error(`❌ [Resend] Send failed to ${phone}:`, err.message);
            campaign.failed += 1;
            results.push({ phone, name: contact ? contact.name : 'Unknown', status: 'failed', error: err.message, time: new Date() });
          }
          campaign.results = results;
          await campaign.save();
          await sleep(campaign.delay * 1000);
        }
      } catch (e) {
        console.error('Campaign background resend error:', e.message);
      } finally {
        runningCampaigns.delete(campaign._id.toString());
        campaign.status = campaign.failed === campaign.total ? 'failed' : 'completed';
        campaign.finishedAt = new Date();
        await campaign.save();
      }
    })();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
