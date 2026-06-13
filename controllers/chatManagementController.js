const ChatTemplate = require('../models/ChatTemplate');
const ChatSettings = require('../models/ChatSettings');
const ChatMessage = require('../models/ChatMessage');
const ChatRoom = require('../models/ChatRoom');
const ChatEvent = require('../models/ChatEvent');
const Dispute = require('../models/Dispute');
const BookingRequest = require('../models/BookingRequest');
const Enquiry = require('../models/Enquiry');
const ChatViolation = require('../models/ChatViolation');
const AuditLog = require('../models/AuditLog');

// ─── MODERATION ─────────────────────────────────────────────────────────────
exports.getFlaggedMessages = async (req, res) => {
  try {
    const { type, status, from, to, page = 1, limit = 30 } = req.query;
    const filter = { violation_type: { $ne: null } };
    if (type) filter.violation_type = type;
    if (status) filter.moderation_status = status;
    if (from || to) {
      filter.created_at = {};
      if (from) filter.created_at.$gte = new Date(from);
      if (to) filter.created_at.$lte = new Date(to);
    }

    const messages = await ChatMessage.find(filter)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await ChatMessage.countDocuments(filter);
    res.json({ success: true, messages, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.resolveFlaggedMessage = async (req, res) => {
  try {
    const { action } = req.body; // 'false_positive' | 'action_taken'
    const adminId = req.user?.loginId || 'SUPER_ADMIN';
    const msg = await ChatMessage.findByIdAndUpdate(
      req.params.id,
      { moderation_status: action, moderation_resolved_by: adminId },
      { new: true }
    );
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Decrypt original message for authorized admin only
exports.decryptMessage = async (req, res) => {
  try {
    const msg = await ChatMessage.findById(req.params.id).lean();
    if (!msg || !msg.original_message_encrypted) {
      return res.status(404).json({ success: false, message: 'No encrypted message found' });
    }
    const decrypted = ChatMessage.decryptText(msg.original_message_encrypted);
    res.json({ success: true, original: decrypted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── TEMPLATES ───────────────────────────────────────────────────────────────
exports.getTemplates = async (req, res) => {
  try {
    const templates = await ChatTemplate.find().sort({ createdAt: -1 });
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { title, message, type, isActive } = req.body;
    const tmpl = await ChatTemplate.create({ title, message, type, isActive, ownerLoginId: 'SUPER_ADMIN' });
    res.json({ success: true, template: tmpl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const tmpl = await ChatTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, template: tmpl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    await ChatTemplate.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    let settings = await ChatSettings.findOne({ ownerLoginId: 'SUPER_ADMIN' });
    if (!settings) settings = await ChatSettings.create({ ownerLoginId: 'SUPER_ADMIN' });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await ChatSettings.findOneAndUpdate(
      { ownerLoginId: 'SUPER_ADMIN' },
      { ...req.body, updatedAt: Date.now() },
      { new: true, upsert: true }
    );
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── FUNNEL / LEAD → CHAT MAPPING ───────────────────────────────────────────
exports.getFunnel = async (req, res) => {
  try {
    const [
      totalLeads,
      ownerApproved,
      chatStarted,
      paymentPending,
      paymentCompleted,
      bookingConfirmed
    ] = await Promise.all([
      Enquiry.countDocuments(),
      Enquiry.countDocuments({ status: { $in: ['approved', 'confirmed'] } }),
      ChatRoom.countDocuments({ status: 'Active' }),
      ChatRoom.countDocuments({ stage: 'Payment Pending' }),
      ChatRoom.countDocuments({ stage: 'Payment Completed' }),
      ChatRoom.countDocuments({ stage: 'Booking Confirmed' }),
    ]);

    res.json({
      success: true,
      funnel: [
        { stage: 'Lead Created', count: totalLeads },
        { stage: 'Owner Approved', count: ownerApproved },
        { stage: 'Chat Started', count: chatStarted },
        { stage: 'Payment Pending', count: paymentPending },
        { stage: 'Payment Completed', count: paymentCompleted },
        { stage: 'Booking Confirmed', count: bookingConfirmed },
      ]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getLeadMappings = async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ ts: -1 }).lean();
    const chatRooms = await ChatRoom.find({ enquiry_id: { $ne: null } }).lean();
    
    const mappingMap = {};
    chatRooms.forEach(room => {
      if (room.enquiry_id) {
        mappingMap[room.enquiry_id.toString()] = room.room_id;
      }
    });

    const leads = enquiries.map(e => ({
      _id: e._id,
      name: e.studentName || 'Unknown',
      email: e.studentEmail || '',
      phone: e.studentPhone || '',
      property: e.propertyName || '',
      chatLoginId: mappingMap[e._id.toString()] || null,
      status: e.status
    }));

    res.json({ success: true, leads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.mapLead = async (req, res) => {
  try {
    const { enquiryId, chatLoginId } = req.body;
    if (!enquiryId || !chatLoginId) {
      return res.status(400).json({ success: false, message: 'Missing enquiryId or chatLoginId' });
    }

    const chatRoom = await ChatRoom.findOne({ room_id: chatLoginId });
    if (!chatRoom) {
      return res.status(404).json({ success: false, message: 'Chat room not found' });
    }

    chatRoom.enquiry_id = enquiryId;
    await chatRoom.save();

    await Enquiry.findByIdAndUpdate(enquiryId, { chatOpen: true });

    // Audit log mapping
    await AuditLog.create({
      actorId: 'SUPER_ADMIN',
      actorRole: 'superadmin',
      module: 'Chat',
      action: 'Map Lead',
      method: 'POST',
      path: req.originalUrl || '/api/chat/admin/leads/map',
      statusCode: 200,
      payload: {
        enquiryId,
        chatLoginId,
        oldValue: null,
        newValue: chatLoginId
      }
    });

    res.json({ success: true, message: 'Lead mapped to chat successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── BOOKING CONVERSION TRACKER ──────────────────────────────────────────────
exports.getBookingTracker = async (req, res) => {
  try {
    const { status, page = 1, limit = 25 } = req.query;
    const filter = { chat_room_id: { $ne: null } };
    if (status) filter.booking_status = status;

    const bookings = await BookingRequest.find(filter)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await BookingRequest.countDocuments(filter);
    res.json({ success: true, bookings, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
exports.getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalActiveChats,
      totalClosedChats,
      stagnantChats,
      convertedToBooking,
      paymentEvents,
      revenueResult
    ] = await Promise.all([
      ChatRoom.countDocuments({ status: 'Active' }),
      ChatRoom.countDocuments({ status: 'Closed' }),
      ChatRoom.countDocuments({
        status: 'Active',
        last_activity: { $lt: new Date(now - 48 * 60 * 60 * 1000) }
      }),
      ChatRoom.countDocuments({ stage: 'Booking Confirmed' }),
      ChatEvent.countDocuments({ event_type: 'PAYMENT_COMPLETED', created_at: { $gte: thirtyDaysAgo } }),
      ChatEvent.aggregate([
        { $match: { event_type: 'PAYMENT_COMPLETED', created_at: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const revenue = revenueResult[0]?.total || 0;
    const bookingConversionRate = totalActiveChats > 0
      ? ((convertedToBooking / (totalActiveChats + totalClosedChats)) * 100).toFixed(1)
      : 0;

    // 7-day daily trend
    const dailyTrend = await ChatEvent.aggregate([
      { $match: { event_type: 'CHAT_ENABLED', created_at: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      cards: {
        totalActiveChats,
        totalClosedChats,
        stagnantChats,
        convertedToBooking,
        paymentEvents,
        revenue,
        bookingConversionRate: `${bookingConversionRate}%`
      },
      dailyTrend
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStagnantChats = async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const chats = await ChatRoom.find({
      status: 'Active',
      last_activity: { $lt: cutoff }
    }).sort({ last_activity: 1 }).limit(50).lean();
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DISPUTES ────────────────────────────────────────────────────────────────
exports.getDisputes = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.dispute_type = type;

    const disputes = await Dispute.find(filter)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Dispute.countDocuments(filter);
    res.json({ success: true, disputes, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createDispute = async (req, res) => {
  try {
    const { room_id, booking_id, dispute_type, description, raised_by_login_id, raised_by_name, raised_by_role, against_login_id, against_name, property_name } = req.body;
    const dispute = await Dispute.create({
      room_id, booking_id, dispute_type, description,
      raised_by_login_id, raised_by_name, raised_by_role,
      against_login_id, against_name, property_name
    });

    // Log chat event
    await ChatEvent.create({ event_type: 'DISPUTE_RAISED', room_id, booking_id, user_login_id: raised_by_login_id, metadata: { dispute_type } });

    // Update booking dispute count
    if (booking_id) {
      await BookingRequest.findOneAndUpdate(
        { $or: [{ _id: booking_id }, { chat_room_id: room_id }] },
        { $inc: { dispute_count: 1 }, has_active_dispute: true }
      );
    }

    res.json({ success: true, dispute });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateDispute = async (req, res) => {
  try {
    const { status, resolution_notes, assigned_admin } = req.body;
    const update = { status, resolution_notes, assigned_admin, updated_at: Date.now() };
    if (status === 'Resolved' || status === 'Closed') update.resolved_at = Date.now();

    const dispute = await Dispute.findByIdAndUpdate(req.params.id, update, { new: true });

    // If resolved, clear booking flag
    if ((status === 'Resolved' || status === 'Closed') && dispute.booking_id) {
      const openDisputes = await Dispute.countDocuments({ booking_id: dispute.booking_id, status: 'Open' });
      if (openDisputes === 0) {
        await BookingRequest.findOneAndUpdate(
          { $or: [{ _id: dispute.booking_id }, { chat_room_id: dispute.room_id }] },
          { has_active_dispute: false }
        );
      }
    }

    res.json({ success: true, dispute });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── VIOLATIONS ──────────────────────────────────────────────────────────────
exports.getViolations = async (req, res) => {
  try {
    // Dynamically sync violations from flagged messages
    const flaggedMessages = await ChatMessage.find({ violation_type: { $ne: null } }).lean();
    for (const msg of flaggedMessages) {
      const exists = await ChatViolation.findOne({ messageSnippet: msg.message });
      if (!exists) {
        let type = 'other';
        if (msg.violation_type === 'spam') type = 'spam';
        else if (msg.violation_type === 'abuse') type = 'abuse';
        else if (['phone', 'email', 'whatsapp', 'telegram', 'upi_payment', 'external_link'].includes(msg.violation_type)) {
          type = 'contact_sharing';
        }
        await ChatViolation.create({
          participantLoginId: msg.sender_login_id,
          participantName: msg.sender_name || msg.sender_login_id,
          violationType: type,
          messageSnippet: msg.message,
          actionTaken: msg.moderation_status === 'action_taken' ? 'warned' : 'none',
          createdAt: msg.created_at
        });
      }
    }

    const violations = await ChatViolation.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, violations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.resolveViolation = async (req, res) => {
  try {
    const { actionTaken } = req.body;
    const adminId = 'SUPER_ADMIN';
    
    const violation = await ChatViolation.findByIdAndUpdate(
      req.params.id,
      { actionTaken, resolvedBy: adminId, resolvedAt: new Date() },
      { new: true }
    );

    if (violation) {
      await ChatMessage.findOneAndUpdate(
        { message: violation.messageSnippet },
        { moderation_status: actionTaken !== 'none' ? 'action_taken' : 'false_positive', moderation_resolved_by: adminId }
      );
    }

    // Audit log resolving
    await AuditLog.create({
      actorId: adminId,
      actorRole: 'superadmin',
      module: 'Chat',
      action: 'Resolve Violation',
      method: 'POST',
      path: req.originalUrl || `/api/chat/admin/violations/${req.params.id}/resolve`,
      statusCode: 200,
      payload: { violationId: req.params.id, actionTaken }
    });

    res.json({ success: true, violation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

