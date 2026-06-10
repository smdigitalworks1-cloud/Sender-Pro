// routes/groups.js
const express = require('express');
const protect = require('../middleware/auth');
const { Contact, GroupsCache, GroupParticipantsCache } = require('../models');
const { getChatWithRetry } = require('../utils/messageQueue');
const router = express.Router();

// Helper to check if the WhatsApp client browser and page are fully ready and stable
function isClientReady(client) {
  try {
    return client && client.info && client.pupPage && !client.pupPage.isClosed() && client.pupPage.browser() && client.pupPage.browser().isConnected();
  } catch (e) {
    return false;
  }
}

async function fetchParticipantsFromClient(client, groupId) {
  let formatted = null;

  // 1. Fast Browser Evaluation (strictly synchronous in browser to prevent event loop block/hang)
  try {
    formatted = await Promise.race([
      client.pupPage.evaluate((gId) => {
        if (!window.Store || !window.Store.Chat) return null;
        const chat = window.Store.Chat.get(gId);
        if (!chat) return null;
        
        let metadata = chat.groupMetadata;
        if (!metadata && window.Store.GroupMetadata) {
          metadata = window.Store.GroupMetadata.get(gId); // Sync retrieve only
        }

        const getPhone = (id) => {
          if (!id) return '';
          if (id.server === 'lid' && window.Store.LidUtils?.getPhoneNumber) {
            const pnWid = window.Store.LidUtils.getPhoneNumber(id);
            return pnWid ? pnWid.user : id.user;
          }
          return id.user || id._serialized?.split('@')[0] || '';
        };

        const participants = (metadata && (metadata.participants?.models || metadata.participants)) || chat.participants || [];
        if (participants.length === 0) return null;

        return participants.map(p => {
          const phone = getPhone(p.id || p);
          return {
            phone: phone || 'Unknown',
            isAdmin: p.isAdmin || false,
            isSuperAdmin: p.isSuperAdmin || false,
          };
        });
      }, groupId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Browser evaluation timed out')), 12000))
    ]);
  } catch (err) {
    console.log('[GroupGrabber] Fast participant fetch failed or timed out:', err.message);
  }

  // 2. Fallback: Controlled getChatById with retries, exponential backoff, and caching
  if (!formatted) {
    console.log('[GroupGrabber] Falling back to getChatWithRetry() for participants...');
    try {
      const chat = await getChatWithRetry(client, groupId);

      if (chat && chat.isGroup) {
        let participants = chat.participants || [];
        if (participants.length === 0 && chat.id) {
          try {
            const meta = await chat.groupMetadata;
            if (meta && meta.participants) {
              participants = meta.participants;
            }
          } catch (err) {
            console.error('[GroupGrabber] Fallback metadata load failed:', err.message);
          }
        }

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
    } catch (err) {
      console.error('[GroupGrabber] Fallback chat fetch failed or timed out:', err.message);
    }
  }

  return formatted;
}

// Helper to asynchronously fetch and cache groups from Puppeteer
async function fetchAndCacheGroups(client, userId) {
  if (!isClientReady(client)) {
    console.warn(`⚠️ [GroupGrabber] Skipping background group fetch: WhatsApp client is not ready or browser page is closed for user ${userId}`);
    return null;
  }

  try {
    const storeGroups = await Promise.race([
      client.pupPage.evaluate(() => {
        if (!window.Store || !window.Store.Chat) return null;
        
        const chats = window.Store.Chat.getModelsArray().filter(chat => 
          chat.isGroup || (chat.id && chat.id._serialized && chat.id._serialized.includes('@g.us'))
        );
        
        return chats.map(chat => {
          let metadata = chat.groupMetadata;
          if (!metadata && window.Store.GroupMetadata) {
            metadata = window.Store.GroupMetadata.get(chat.id._serialized || chat.id);
          }
          let nameVal = chat.name || chat.formattedTitle || chat.title || "Unknown Group";
          if (typeof nameVal !== 'string') {
            nameVal = (nameVal && typeof nameVal === 'object') ? (nameVal.name || nameVal.formattedTitle || "Unknown Group") : "Unknown Group";
          }
          if (typeof nameVal !== 'string') nameVal = String(nameVal);

          let descVal = metadata?.desc || chat.description || "";
          if (typeof descVal !== 'string') descVal = "";

          return {
            id: chat.id._serialized || chat.id,
            name: nameVal,
            participantCount: metadata?.participants?.length || chat.participants?.length || 0,
            description: descVal,
          };
        });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Browser evaluation timed out')), 90000))
    ]);

    if (storeGroups && storeGroups.length > 0) {
      await GroupsCache.findOneAndUpdate(
        { userId },
        { groups: storeGroups, lastUpdated: new Date() },
        { upsert: true, new: true }
      );
      console.log(`[GroupGrabber] Successfully cached ${storeGroups.length} groups for user ${userId}`);
      
      // Emit real-time update to the user
      const isSuper = client.info && client.info.wid && client.info.wid.user === 'superadmin';
      const guid = isSuper ? `sa_${userId}` : `user_${userId}`;
      if (global.emitToUser) {
        global.emitToUser(guid, 'whatsapp:groups_updated', storeGroups);
      }
      return storeGroups;
    }
    return null;
  } catch (err) {
    console.error(`[GroupGrabber] Async group fetch failed for user ${userId}:`, err.message);
    return null;
  }
}

// Get list of group chats
router.get('/', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  const userId = req.user._id;
  const forceRefresh = req.query.refresh === 'true';

  try {
    // Check if we have cached groups
    const cachedData = await GroupsCache.findOne({ userId });

    // If WhatsApp client is NOT completely connected or ready, do not return cached groups.
    if (!client || !client.info) {
      return res.status(400).json({ message: 'WhatsApp is not connected. Please connect WhatsApp first.' });
    }

    // Stale-While-Revalidate: Return cache immediately if not a force refresh
    if (cachedData && !forceRefresh) {
      const isStale = (Date.now() - new Date(cachedData.lastUpdated).getTime()) > 120000; // 2 minutes
      if (isStale && isClientReady(client)) {
        console.log(`[GroupGrabber] Cache stale for user ${userId}. Triggering background fetch...`);
        fetchAndCacheGroups(client, userId).catch(err => {
          console.error('[GroupGrabber] Background update error:', err.message);
        });
      }
      return res.json(cachedData.groups);
    }

    // Force refresh or no cache available: Fetch synchronously with timeout
    if (!isClientReady(client)) {
      if (cachedData) {
        console.warn(`⚠️ [GroupGrabber] Force refresh requested but client browser is not ready. Returning cached data.`);
        return res.json(cachedData.groups);
      }
      return res.status(400).json({ message: 'WhatsApp client is busy initializing. Please try again in a few seconds.' });
    }

    console.log(`[GroupGrabber] Fetching groups from browser for user ${userId} (forceRefresh=${forceRefresh})...`);
    const groups = await fetchAndCacheGroups(client, userId);
    
    if (groups) {
      return res.json(groups);
    }

    // If fetch failed but we have old cached data, fall back to cache
    if (cachedData) {
      console.warn(`[GroupGrabber] Browser fetch failed/timed out. Falling back to old cache for user ${userId}`);
      return res.json(cachedData.groups);
    }

    return res.status(504).json({ message: 'WhatsApp is busy syncing. Please try again in a few seconds.' });
  } catch (e) {
    console.error('[GroupGrabber] Route / groups error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// Get participants of a group
router.get('/:groupId/participants', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  const userId = req.user._id;
  const groupId = req.params.groupId;

  try {
    // Check participants cache
    const cachedParticipants = await GroupParticipantsCache.findOne({ userId, groupId });

    if (cachedParticipants) {
      // Return cached participants immediately to prevent blocking the request
      res.json(cachedParticipants.participants);

      // Trigger update asynchronously in the background if stale (older than 5 minutes)
      const isStale = (Date.now() - new Date(cachedParticipants.lastUpdated).getTime()) > 300000;
      if (isStale && isClientReady(client)) {
        (async () => {
          try {
            console.log(`[GroupGrabber] Background updating stale cache for group ${groupId}...`);
            const fresh = await fetchParticipantsFromClient(client, groupId);
            if (fresh && fresh.length > 0) {
              await GroupParticipantsCache.findOneAndUpdate(
                { userId, groupId },
                { participants: fresh, lastUpdated: new Date() },
                { upsert: true, new: true }
              );
              await GroupsCache.updateOne(
                { userId, "groups.id": groupId },
                { $set: { "groups.$.participantCount": fresh.length } }
              );
              console.log(`[GroupGrabber] Background cache update success: ${fresh.length} participants for ${groupId}`);
            }
          } catch (err) {
            console.error(`[GroupGrabber] Background cache update failed for ${groupId}:`, err.message);
          }
        })();
      }
      return;
    }

    // No cache exists - fetch synchronously
    if (!isClientReady(client)) {
      return res.status(400).json({ message: 'WhatsApp client is not connected' });
    }

    console.log(`[GroupGrabber] Fetching fresh participants synchronously for group ${groupId}...`);
    const formatted = await fetchParticipantsFromClient(client, groupId);

    if (!formatted) {
      return res.status(408).json({ message: 'Failed to fetch group participants (request timed out)' });
    }

    // Cache the resolved participants list
    await GroupParticipantsCache.findOneAndUpdate(
      { userId, groupId },
      { participants: formatted, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    await GroupsCache.updateOne(
      { userId, "groups.id": groupId },
      { $set: { "groups.$.participantCount": formatted.length } }
    );
    console.log(`[GroupGrabber] Cached ${formatted.length} participants for group ${groupId}`);

    res.json(formatted);
  } catch (e) {
    console.error('[GroupGrabber] Participant fetch failed:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// Save group participants as contacts
router.post('/:groupId/save', protect, async (req, res) => {
  const client = req.app.get('getClientForUser')(req.user._id, req.user.role === 'superadmin');
  const userId = req.user._id;
  const groupId = req.params.groupId;

  try {
    let participants = [];
    let groupName = 'Unknown Group';

    // Try to get group name from cache
    const groupsCache = await GroupsCache.findOne({ userId });
    if (groupsCache) {
      const g = groupsCache.groups.find(item => item.id === groupId);
      if (g) groupName = g.name;
    }

    // Check participants cache first
    const cachedParticipants = await GroupParticipantsCache.findOne({ userId, groupId });
    if (cachedParticipants && cachedParticipants.participants.length > 0) {
      console.log(`[GroupGrabber] Using cached participants to save ${cachedParticipants.participants.length} contacts...`);
      participants = cachedParticipants.participants.map(p => ({ id: { user: p.phone } }));
    } else {
      // Fetch fresh if not cached
      if (!isClientReady(client)) {
        return res.status(400).json({ message: 'WhatsApp client is not connected or ready. Please wait a few seconds and try again.' });
      }
      console.log('[GroupGrabber] Participants not cached. Fetching from browser for saving...');
      
      const freshParts = await fetchParticipantsFromClient(client, groupId);
      if (freshParts && freshParts.length > 0) {
        participants = freshParts.map(p => ({ id: { user: p.phone } }));
      }
    }

    const docs = participants.map(p => {
      let phone = '';
      if (p.id) {
        phone = p.id.user || (typeof p.id === 'string' ? p.id.split('@')[0] : p.id._serialized?.split('@')[0]);
      }
      return {
        userId: userId,
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
        console.log(`[GroupGrabber] Bulk saved ${docs.length} contacts for user ${userId}`);
    }

    res.json({ saved: docs.length });
  } catch (e) {
    console.error('[GroupGrabber] Save failed:', e.message);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
