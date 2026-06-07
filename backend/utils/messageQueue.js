const queueMap = new Map(); // guid -> Array of tasks
const chatCache = new Map();

function verifyClientReadyForSend(client) {
  if (!client) throw new Error('WhatsApp client is not initialized');
  if (!client.info) throw new Error('WhatsApp client is not logged in');
  if (!client.pupPage) throw new Error('WhatsApp page is not initialized');
  if (client.pupPage.isClosed()) throw new Error('WhatsApp page is closed');
  const browser = client.pupPage.browser();
  if (!browser || !browser.isConnected()) throw new Error('WhatsApp browser is disconnected');
}

async function enqueueMessage(guid, sendFn) {
  if (!queueMap.has(guid)) {
    queueMap.set(guid, []);
  }
  const queue = queueMap.get(guid);

  console.log(`📥 [Queue] Message queued for [${guid}]. Queue size: ${queue.length + 1}`);

  return new Promise((resolve, reject) => {
    const task = async () => {
      const startTime = Date.now();
      console.log(`📤 [Queue] Message sending started for [${guid}]`);
      try {
        const result = await sendFn();
        const duration = Date.now() - startTime;
        console.log(`✅ [Queue] Message delivered for [${guid}] in ${duration}ms`);
        resolve(result);
      } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`❌ [Queue] Message send failed for [${guid}] in ${duration}ms. Error: ${err.message}`);
        reject(err);
      }
    };
    
    queue.push(task);
    if (queue.length === 1) {
      processQueue(guid);
    }
  });
}

async function processQueue(guid) {
  const queue = queueMap.get(guid);
  if (!queue || queue.length === 0) return;

  const task = queue[0];
  try {
    await task();
  } catch (e) {
    // Rejections are handled inside the task promise
  } finally {
    queue.shift();
    if (queue.length > 0) {
      processQueue(guid);
    }
  }
}

async function getChatWithRetry(client, groupId, retries = 3, delay = 2000) {
  if (chatCache.has(groupId)) {
    const cached = chatCache.get(groupId);
    if (cached) return cached;
  }

  let lastError;
  const startTime = Date.now();
  console.log(`👥 [GroupFetch] Group fetch started for ${groupId}`);

  for (let i = 0; i < retries; i++) {
    try {
      const chat = await Promise.race([
        client.getChatById(groupId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getChatById timed out')), 15000))
      ]);
      if (chat) {
        chatCache.set(groupId, chat);
        const duration = Date.now() - startTime;
        console.log(`👥 [GroupFetch] Group fetch completed for ${groupId} in ${duration}ms`);
        return chat;
      }
    } catch (err) {
      lastError = err;
      const duration = Date.now() - startTime;
      console.warn(`⚠️ [GroupFetch] Attempt ${i + 1} failed for ${groupId} in ${duration}ms. Reason: ${err.message}`);
      if (i < retries - 1) {
        const backoffDelay = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  const duration = Date.now() - startTime;
  throw lastError || new Error(`Failed to get chat by ID ${groupId} after ${retries} attempts (Total time: ${duration}ms)`);
}

module.exports = {
  verifyClientReadyForSend,
  enqueueMessage,
  getChatWithRetry
};
