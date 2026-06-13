const mongoose = require('mongoose');

// ChatEvent acts as an audit trail and analytics source of truth
// Analytics should be computed from ChatEvents, not by parsing messages
const ChatEventSchema = new mongoose.Schema({
  event_type: {
    type: String,
    enum: [
      'REQUEST_APPROVED',
      'CHAT_ENABLED',
      'PROPERTY_VISIT_SCHEDULED',
      'PAYMENT_LINK_SENT',
      'PAYMENT_REMINDER_SENT',
      'PAYMENT_COMPLETED',
      'BOOKING_CONFIRMED',
      'BOOKING_CANCELLED',
      'MOVE_IN_REMINDER_SENT',
      'MOVE_IN_COMPLETED',
      'CHAT_CLOSED',
      'DISPUTE_RAISED',
      'MODERATION_FLAG',
      'OWNER_REMINDER_SENT',
      'USER_REMINDER_SENT'
    ],
    required: true,
    index: true
  },
  room_id: { type: String, index: true },
  booking_id: { type: String, default: null, index: true },
  enquiry_id: { type: String, default: null },
  user_login_id: { type: String, default: null },
  owner_login_id: { type: String, default: null },
  property_name: { type: String, default: null },

  // For payment events
  amount: { type: Number, default: null },

  // Flexible extra data (stage, dispute_type, template_id, etc.)
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

  created_at: { type: Date, default: Date.now, index: true }
});

ChatEventSchema.index({ event_type: 1, created_at: -1 });
ChatEventSchema.index({ created_at: -1 });

module.exports = mongoose.model('ChatEvent', ChatEventSchema);
