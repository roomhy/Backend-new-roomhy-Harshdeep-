const mongoose = require('mongoose');

const stageHistorySchema = new mongoose.Schema({
  stage: { type: String, required: true },
  entered_at: { type: Date, default: Date.now }
}, { _id: false });

const chatRoomSchema = new mongoose.Schema({
  room_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: "receiver's loginId"
  },
  participants: [{
    loginId: { type: String, required: true },
    role: {
      type: String,
      enum: ['property_owner', 'tenant', 'areamanager', 'website_user', 'superadmin'],
      required: true
    }
  }],
  // Funnel linking
  enquiry_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
  booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  property_name: { type: String, default: '' },

  // Booking pipeline stage
  stage: {
    type: String,
    enum: ['Negotiation', 'Payment Pending', 'Payment Completed', 'Booking Confirmed', 'Move-in Completed'],
    default: 'Negotiation'
  },
  stage_history: [stageHistorySchema],

  // Status — NO Suspended (prevents blocking conversions)
  status: {
    type: String,
    enum: ['Active', 'Closed'],
    default: 'Active'
  },

  last_activity: { type: Date, default: Date.now },

  // Reminder tracking for cron jobs
  reminder_48hr_sent: { type: Boolean, default: false },
  reminder_72hr_sent: { type: Boolean, default: false },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

chatRoomSchema.index({ status: 1, last_activity: 1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);