// routes/groups.js
const express = require('express');
const protect = require('../middleware/auth');
const { Contact } = require('../models');
const router = express.Router();

// Get list of group chats
router.get('/', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  if (!client || !client.info) return res.status(400).json({ message: 'WhatsApp is not completely connected. Scan QR first.' });
  try {
    let groups = [];
    let success = false;

    // 1. Primary Fast: Direct browser Store evaluation
    try {
      const storeGroups = await client.pupPage.evaluate(() => {
        if (!window.Store || !window.Store.Chat) return null;
        return window.Store.Chat.getModelsArray()
          .filter(chat => chat.isGroup || (chat.id && chat.id._serialized && chat.id._serialized.includes('@g.us')))
          .map(chat => ({
            id: chat.id._serialized || chat.id,
            name: chat.name || chat.formattedTitle || chat.title || "Unknown Group",
            participantCount: chat.groupMetadata?.participants?.length || chat.participants?.length || 0,
            description: chat.groupMetadata?.desc || chat.description || "",
          }));
      });

      if (storeGroups && storeGroups.length > 0) {
        groups = storeGroups;
        success = true;
        console.log(`[GroupGrabber] Direct Store method found ${groups.length} groups.`);
      }
    } catch (err) {
      console.log('[GroupGrabber] Direct Store method failed or timed out:', err.message);
    }

    // 2. Fallback: Standard getChats() API (avoiding slow groupMetadata getter)
    if (!success) {
      console.log('[GroupGrabber] Falling back to getChats() API...');
      const chats = await client.getChats();
      groups = chats
        .filter(c => c.isGroup || (c.id && c.id._serialized && c.id._serialized.includes('@g.us')))
        .map(g => ({
          id: g.id?._serialized || g.id,
          name: g.name || g.formattedTitle || g.title || 'Unknown Group',
          participantCount: g.participants?.length || 0,
          description: g.description || '',
        }));
      console.log(`[GroupGrabber] getChats() fallback found ${groups.length} groups.`);
    }

    console.log(`[GroupGrabber] Total groups found: ${groups.length}`);
    res.json(groups);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Get participants of a group
router.get('/:groupId/participants', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  if (!client) return res.status(400).json({ message: 'WhatsApp not connected' });
  try {
    let formatted = null;

    // 1. Primary Fast: Direct browser Store evaluation
    try {
      formatted = await client.pupPage.evaluate((groupId) => {
        if (!window.Store || !window.Store.Chat) return null;
        const chat = window.Store.Chat.get(groupId);
        if (!chat || !chat.groupMetadata) return null;
        
        const participants = chat.groupMetadata.participants.models || chat.groupMetadata.participants || [];
        return participants.map(p => {
          const id = p.id?._serialized || p.id || '';
          const phone = id.split('@')[0] || '';
          return {
            phone: phone || 'Unknown',
            isAdmin: p.isAdmin || false,
            isSuperAdmin: p.isSuperAdmin || false,
          };
        });
      }, req.params.groupId);
    } catch (err) {
      console.log('[GroupGrabber] Fast participant fetch failed:', err.message);
    }

    // 2. Fallback: Standard chat fetch
    if (!formatted) {
      console.log('[GroupGrabber] Falling back to getChatById() for participants...');
      const chat = await client.getChatById(req.params.groupId);
      if (!chat || !chat.isGroup) {
        return res.status(404).json({ message: 'Group not found' });
      }

      const participants = chat.participants || [];
      formatted = participants.map(p => {
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
    }

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
    let participants = [];
    let groupName = 'Unknown Group';

    // 1. Primary Fast: Direct browser Store evaluation
    try {
      const data = await client.pupPage.evaluate((groupId) => {
        if (!window.Store || !window.Store.Chat) return null;
        const chat = window.Store.Chat.get(groupId);
        if (!chat) return null;
        const name = chat.name || chat.formattedTitle || 'Unknown Group';
        const parts = (chat.groupMetadata?.participants?.models || chat.groupMetadata?.participants || []).map(p => {
          const id = p.id?._serialized || p.id || '';
          return id.split('@')[0] || '';
        });
        return { name, parts };
      }, req.params.groupId);

      if (data) {
        groupName = data.name;
        participants = data.parts.map(phone => ({ id: { user: phone } }));
      }
    } catch (err) {
      console.log('[GroupGrabber] Fast save participant fetch failed:', err.message);
    }

    // 2. Fallback: Standard chat fetch
    if (participants.length === 0) {
      console.log('[GroupGrabber] Falling back to getChatById() for save...');
      const chat = await client.getChatById(req.params.groupId);
      if (!chat || !chat.isGroup) {
        return res.status(404).json({ message: 'Group not found' });
      }
      groupName = chat.name || 'Unknown Group';
      participants = chat.participants || [];
    }

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
