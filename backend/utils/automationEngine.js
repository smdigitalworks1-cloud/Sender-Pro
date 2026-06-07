const Automation = require('../models/Automation');
const AutomationStep = require('../models/AutomationStep');
const AutomationLog = require('../models/AutomationLog');
const { MessageMedia } = require('whatsapp-web.js');
const { verifyClientReadyForSend, enqueueMessage } = require('./messageQueue');

const runAutomation = async (automationId, getClient) => {
    try {
        const automation = await Automation.findById(automationId);
        if (!automation || automation.status === 'paused') {
            console.log('Automation is paused or missing. Cannot start.');
            return;
        }

        const guid = automation.isSuper ? `sa_${automation.userId}` : `user_${automation.userId}`;

        const steps = await AutomationStep.find({ automationId }).sort({ stepOrder: 1 });
        if (!steps.length) return;

        console.log(`🚀 Starting Automation: ${automation.name}`);

        let targetGroups = automation.targetGroups;
        if (typeof targetGroups === 'string') {
            try {
                targetGroups = JSON.parse(targetGroups);
            } catch (e) {
                console.error("Error parsing targetGroups:", targetGroups);
                targetGroups = [];
            }
        }

        if (!Array.isArray(targetGroups)) targetGroups = [];
        targetGroups = targetGroups
            .map(g => typeof g === 'string' ? g.trim() : g)
            .filter(g => typeof g === 'string' && g.endsWith('@g.us'));

        // Execute for each group in parallel or sequentially. We choose sequentially grouping for stability over WP.
        for (const groupId of targetGroups) {
            console.log(`Executing automation for group: ${groupId}`);
            let skipNextStep = false;

            for (const step of steps) {
                // Check if automation was paused midway
                const checkStatus = await Automation.findById(automationId);
                if (checkStatus.status === 'paused') {
                    console.log('Automation paused midway.');
                    return;
                }

                if (step.actionType === 'delay') {
                    let delayMs = 0;

                    if (step.delayOption === 'event_time') {
                        const baseEventTime = automation.eventTime || automation.scheduledAt || new Date();
                        let offsetMs = 0;
                        const offsetDays = Number(step.eventOffsetDays) || 0;
                        const offsetHours = Number(step.eventOffsetHours) || 0;
                        const offsetMinutes = Number(step.eventOffsetMinutes) || 0;

                        offsetMs += offsetDays * 24 * 60 * 60 * 1000;
                        offsetMs += offsetHours * 60 * 60 * 1000;
                        offsetMs += offsetMinutes * 60 * 1000;

                        let targetTime = new Date(baseEventTime);
                        if (step.eventWhen === 'before') {
                            targetTime = new Date(targetTime.getTime() - offsetMs);
                        } else if (step.eventWhen === 'after') {
                            targetTime = new Date(targetTime.getTime() + offsetMs);
                        }

                        delayMs = targetTime.getTime() - Date.now();
                        console.log(`Calculated event_time wait step: base event=${new Date(baseEventTime).toLocaleString()}, when=${step.eventWhen}, offsets=${offsetDays}d ${offsetHours}h ${offsetMinutes}m. Target targetTime=${targetTime.toLocaleString()}. remaining delayMs=${delayMs}`);

                        if (delayMs < 0) {
                            if (step.pastAction === 'skip') {
                                skipNextStep = true;
                                console.log(`Wait step was in the past and pastAction='skip'. Flagging skipNextStep for group ${groupId}`);
                            }
                            delayMs = 0;
                        }
                    } else if (step.delayOption === 'exact_time' && step.delayUntilDate) {
                        delayMs = new Date(step.delayUntilDate).getTime() - Date.now();
                        if (delayMs < 0) delayMs = 0; // if time passed, don't wait
                        console.log(`Waiting until exact specific time: ${new Date(step.delayUntilDate).toLocaleString()}...`);
                    } else {
                        const value = step.delayValue || step.delayMinutes || 0;
                        if (step.delayUnit === 'days') delayMs = value * 24 * 60 * 60 * 1000;
                        else if (step.delayUnit === 'hours') delayMs = value * 60 * 60 * 1000;
                        else delayMs = value * 60 * 1000;
                        console.log(`Waiting for ${value} ${step.delayUnit || 'minutes'}...`);
                    }

                    // Create pending log first so frontend shows "Waiting" status
                    const scheduledNextAt = delayMs > 0 ? new Date(Date.now() + delayMs) : new Date();
                    const delayLog = await AutomationLog.create({ 
                        automationId, 
                        groupId, 
                        stepId: step._id, 
                        status: 'pending',
                        scheduledNextAt
                    });
                    
                    if (global.emitToUser) {
                        global.emitToUser(guid, 'automation:log_update', { automationId });
                    }

                    if (delayMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }

                    // Once finished, update status to success (Wait Finished)
                    delayLog.status = 'success';
                    delayLog.executedAt = new Date();
                    try {
                        await delayLog.save();
                    } catch (saveErr) {
                        console.warn(`[Automation] Could not update delayLog status: ${saveErr.message}`);
                    }

                    if (global.emitToUser) {
                        global.emitToUser(guid, 'automation:log_update', { automationId });
                    }
                }
                else if (step.actionType === 'send_message') {
                    if (skipNextStep) {
                        console.log(`Skipping message step ${step._id} because skipNextStep was set to true.`);
                        skipNextStep = false;
                        await AutomationLog.create({ 
                            automationId, 
                            groupId, 
                            stepId: step._id, 
                            status: 'success', 
                            error: 'Skipped because wait step was in past' 
                        });
                        
                        if (global.emitToUser) {
                            global.emitToUser(guid, 'automation:log_update', { automationId });
                        }
                        continue;
                    }

                    // Create pending log for message step
                    const msgLog = await AutomationLog.create({ 
                        automationId, 
                        groupId, 
                        stepId: step._id, 
                        status: 'pending' 
                    });
                    
                    if (global.emitToUser) {
                        global.emitToUser(guid, 'automation:log_update', { automationId });
                    }

                    let client = typeof getClient === 'function' ? getClient() : getClient;

                    if (!client || !client.info) {
                        console.log(`[Automation] WhatsApp client not ready for user ${automation.userId}. Retrying connection...`);
                        let retries = 0;
                        const maxRetries = 5;
                        while (retries < maxRetries && (!client || !client.info)) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            client = typeof getClient === 'function' ? getClient() : getClient;
                            retries++;
                        }
                    }

                    if (!client || !client.info) {
                        console.error('WhatsApp client not ready for automation after retries.');
                        msgLog.status = 'failed';
                        msgLog.error = 'WhatsApp disconnected';
                        msgLog.executedAt = new Date();
                        await msgLog.save();
                        
                        if (global.emitToUser) {
                            global.emitToUser(guid, 'automation:log_update', { automationId });
                        }
                        continue;
                    }

                    try {
                        let media = null;
                        if (step.mediaUrl) {
                            try { media = await MessageMedia.fromUrl(step.mediaUrl); }
                            catch (e) { console.error('Media load error:', e.message); }
                        }

                        verifyClientReadyForSend(client);
                        await enqueueMessage(guid, async () => {
                            if (media) {
                                await client.sendMessage(groupId, media, { caption: step.message });
                            } else {
                                await client.sendMessage(groupId, step.message);
                            }
                        });

                        // Success log
                        msgLog.status = 'success';
                        msgLog.executedAt = new Date();
                        try {
                            await msgLog.save();
                        } catch (saveErr) {
                            console.warn(`[Automation] Could not update msgLog success status: ${saveErr.message}`);
                        }
                        console.log(`Message sent to ${groupId}`);

                        if (global.emitToUser) {
                            global.emitToUser(guid, 'automation:log_update', { automationId });
                        }

                        // small delay between WP messages to avoid spam blocks
                        await new Promise(resolve => setTimeout(resolve, 3000));

                    } catch (err) {
                        console.error(`Failed to send message: ${err.message}`);
                        msgLog.status = 'failed';
                        msgLog.error = err.message;
                        msgLog.executedAt = new Date();
                        try {
                            await msgLog.save();
                        } catch (saveErr) {
                            console.warn(`[Automation] Could not update msgLog failed status: ${saveErr.message}`);
                        }
                        
                        if (global.emitToUser) {
                            global.emitToUser(guid, 'automation:log_update', { automationId });
                        }
                    }
                }
            } // end step loop
        } // end group loop

        // Complete Automation for One-Time Manual
        if (automation.triggerType === 'manual') {
            automation.status = 'completed';
        }
        automation.lastRunAt = new Date();
        await automation.save();
        console.log(`✅ Automation completed: ${automation.name}`);

        if (global.emitToUser) {
            global.emitToUser(guid, 'automation:log_update', { automationId });
        }

    } catch (error) {
        console.error(`Automation Engine Error: ${error.message}`);
    }
};

module.exports = { runAutomation };
