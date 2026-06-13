const mongoose = require('mongoose');

const ChatTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['welcome', 'away', 'quick_reply'], default: 'quick_reply' },
  ownerLoginId: { type: String }, // null for global superadmin templates
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatTemplate', ChatTemplateSchema);
