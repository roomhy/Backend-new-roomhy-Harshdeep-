/**
 * cron_chat_jobs.js
 * Chat lifecycle automation:
 *   - 48hr: Send reminder to owner
 *   - 72hr: Send reminder to user
 *   - 7 days: Auto-close chat
 */
const cron = require('node-cron');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const ChatEvent = require('../models/ChatEvent');

const HOUR = 60 * 60 * 1000;

async function sendSystemMessage(room_id, message) {
  try {
    await ChatMessage.create({
      room_id,
      sender_login_id: 'system',
      sender_name: 'Roomhy',
      sender_role: 'superadmin',
      message,
      message_type: 'system',
      created_at: new Date(),
      updated_at: new Date()
    });
    await ChatRoom.updateOne({ room_id }, { last_activity: new Date(), updated_at: new Date() });
  } catch (err) {
    console.error(`[CRON] Failed to send system message to ${room_id}:`, err.message);
  }
}

async function runStagnantChatJobs() {
  const now = Date.now();

  try {
    // ── Step 1: 48-hour inactive → Send reminder to OWNER ──────────────────
    const cutoff48h = new Date(now - 48 * HOUR);
    const chatsPending48h = await ChatRoom.find({
      status: 'Active',
      stage: { $in: ['Negotiation', 'Payment Pending'] },
      last_activity: { $lt: cutoff48h },
      reminder_48hr_sent: false
    }).lean();

    for (const room of chatsPending48h) {
      const ownerParticipant = (room.participants || []).find(p => p.role === 'property_owner');
      const msg = `📢 Reminder: This conversation has been inactive for 48 hours. ${ownerParticipant ? `Dear Owner, your chat with the interested user is waiting for your response!` : 'Please continue your discussion to proceed with the booking.'}`;
      await sendSystemMessage(room.room_id, msg);
      await ChatRoom.updateOne({ _id: room._id }, { reminder_48hr_sent: true });
      await ChatEvent.create({ event_type: 'OWNER_REMINDER_SENT', room_id: room.room_id, metadata: { hours: 48 } });
    }

    // ── Step 2: 72-hour inactive → Send reminder to USER ────────────────────
    const cutoff72h = new Date(now - 72 * HOUR);
    const chatsPending72h = await ChatRoom.find({
      status: 'Active',
      stage: { $in: ['Negotiation', 'Payment Pending'] },
      last_activity: { $lt: cutoff72h },
      reminder_48hr_sent: true,
      reminder_72hr_sent: false
    }).lean();

    for (const room of chatsPending72h) {
      const msg = `⏰ Reminder: Your discussion about ${room.property_name || 'this property'} hasn't moved in 72 hours. Don't lose your spot — respond now to continue with the booking!`;
      await sendSystemMessage(room.room_id, msg);
      await ChatRoom.updateOne({ _id: room._id }, { reminder_72hr_sent: true });
      await ChatEvent.create({ event_type: 'USER_REMINDER_SENT', room_id: room.room_id, metadata: { hours: 72 } });
    }

    // ── Step 3: 7 days inactive → AUTO CLOSE ────────────────────────────────
    const cutoff7d = new Date(now - 7 * 24 * HOUR);
    const staleChats = await ChatRoom.find({
      status: 'Active',
      stage: { $in: ['Negotiation', 'Payment Pending'] },
      last_activity: { $lt: cutoff7d },
      reminder_72hr_sent: true
    }).lean();

    for (const room of staleChats) {
      await sendSystemMessage(room.room_id, `🔒 This chat has been closed automatically after 7 days of inactivity. If you wish to restart, please submit a new request.`);
      await ChatRoom.updateOne({ _id: room._id }, { status: 'Closed', updated_at: new Date() });
      await ChatEvent.create({ event_type: 'CHAT_CLOSED', room_id: room.room_id, metadata: { reason: 'auto_close_7days' } });
    }

    if (chatsPending48h.length + chatsPending72h.length + staleChats.length > 0) {
      console.log(`[CRON] Chat lifecycle job: 48hr reminders=${chatsPending48h.length}, 72hr reminders=${chatsPending72h.length}, auto-closed=${staleChats.length}`);
    }
  } catch (err) {
    console.error('[CRON] Stagnant chat job error:', err.message);
  }
}

// Run every hour
cron.schedule('0 * * * *', runStagnantChatJobs, { name: 'stagnant-chat-jobs' });

console.log('[CRON] Chat lifecycle cron jobs registered (runs every hour).');

module.exports = { runStagnantChatJobs };
