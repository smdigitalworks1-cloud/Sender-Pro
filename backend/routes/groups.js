// routes/groups.js
const express = require('express');
const protect = require('../middleware/auth');
const { Contact } = require('../models');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  if (!client || !client.info) return res.status(400).json({ message: 'WhatsApp is not completely connected. Scan QR first.' });
  try {
    // Primary: Use whatsapp-web.js getChats() API — reliable, works without lazy loading
    let groups = [];
    try {
      const chats = await client.getChats();
      groups = chats
        .filter(c => c.isGroup || (c.id && c.id._serialized && c.id._serialized.includes('@g.us')))
        .map(g => ({
          id: g.id?._serialized || g.id,
          name: g.name || g.formattedTitle || g.title || 'Unknown Group',
          participantCount: g.groupMetadata?.participants?.length || g.participants?.length || 0,
          description: g.description || g.groupMetadata?.desc || '',
        }));
    } catch (err) {
      console.log('[GroupGrabber] getChats() failed, trying Store fallback:', err.message);
      // Fallback: direct browser Store access (may return 0 if chats aren't loaded yet)
      groups = await client.pupPage.evaluate(() => {
        if (!window.Store || !window.Store.Chat) return [];
        return window.Store.Chat.getModelsArray()
          .filter(chat => chat.isGroup)
          .map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.formattedTitle || "Unknown Group",
            participantCount: chat.groupMetadata ? chat.groupMetadata.participants.length : 0,
            description: chat.groupMetadata ? chat.groupMetadata.desc : "",
          }));
      });
    }

    console.log(`[GroupGrabber] Total groups found: ${groups.length}`);
    res.json(groups);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/:groupId/participants', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  if (!client) return res.status(400).json({ message: 'WhatsApp not connected' });
  try {
    const chat = await client.getChatById(req.params.groupId);
    if (!chat || !chat.isGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const participants = chat.participants || [];
    const formatted = participants.map(p => {
      let phone = '';
      if (p.id) {
        phone = p.id.user || (typeof p.id === 'string' ? p.id.split('@')[0] : p.id._serialized?.split('@')[0]);
      }
      return {
        phone: phone || 'Unknown',
        isAdmin: p.isAdmin || false,
        isSuperAdmin: p.isSuperAdmin || false,
      };
    });

    console.log(`[GroupGrabber] Fetched ${formatted.length} participants for ${req.params.groupId}`);
    res.json(formatted);
  } catch (e) {
    console.log('[GroupGrabber] Participant fetch failed:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// Save group participants as contacts
router.post('/:groupId/save', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  if (!client) return res.status(400).json({ message: 'WhatsApp not connected' });
  try {
    const chat = await client.getChatById(req.params.groupId);
    if (!chat || !chat.isGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const groupName = chat.name || 'Unknown Group';
    const participants = chat.participants || [];
    
    const docs = participants.map(p => {
      let phone = '';
      if (p.id) {
        phone = p.id.user || (typeof p.id === 'string' ? p.id.split('@')[0] : p.id._serialized?.split('@')[0]);
      }
      return {
        userId: req.user._id,
        phone: phone,
        group: groupName,
        source: 'group_grab',
      };
    }).filter(d => d.phone && d.phone !== 'Unknown');

    if (docs.length > 0) {
        await Contact.bulkWrite(docs.map(doc => ({
            updateOne: {
                filter: { userId: doc.userId, phone: doc.phone },
                update: { $set: doc },
                upsert: true
            }
        })));
    }

    res.json({ saved: docs.length });
  } catch (e) {
    console.error('[GroupGrabber] Save failed:', e.message);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
