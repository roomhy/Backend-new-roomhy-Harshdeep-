const mongoose = require('mongoose');

const ChatViolationSchema = new mongoose.Schema({
  participantLoginId: { type: String, required: true },
  participantName: { type: String },
  violationType: { type: String, enum: ['spam', 'abuse', 'contact_sharing', 'other'], required: true },
  messageSnippet: { type: String },
  actionTaken: { type: String, enum: ['none', 'warned', 'blocked'], default: 'none' },
  resolvedBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
});

module.exports = mongoose.model('ChatViolation', ChatViolationSchema);
