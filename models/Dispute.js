const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
  dispute_id: {
    type: String,
    unique: true,
    default: () => 'DSP-' + Date.now().toString(36).toUpperCase()
  },
  room_id: { type: String, required: true, index: true },
  booking_id: { type: String, default: null },
  enquiry_id: { type: String, default: null },

  raised_by_login_id: { type: String, required: true },
  raised_by_name: { type: String },
  raised_by_role: { type: String, enum: ['tenant', 'website_user', 'property_owner'] },

  against_login_id: { type: String },
  against_name: { type: String },

  property_name: { type: String },

  dispute_type: {
    type: String,
    enum: ['Property Mismatch', 'Refund Request', 'Owner Not Responding', 'Extra Charges', 'Move-in Issue', 'Payment Issue', 'Other'],
    required: true
  },
  description: { type: String, required: true },

  status: {
    type: String,
    enum: ['Open', 'Under Review', 'Resolved', 'Closed'],
    default: 'Open'
  },
  assigned_admin: { type: String, default: null },

  resolution_notes: { type: String, default: '' },
  resolved_at: { type: Date, default: null },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

DisputeSchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('Dispute', DisputeSchema);
