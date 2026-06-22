const mongoose = require('mongoose');

const ChatSettingsSchema = new mongoose.Schema({
  ownerLoginId: { type: String, unique: true }, // null for global superadmin settings
  enableAutoWelcome: { type: Boolean, default: true },
  autoWelcomeMessage: { type: String, default: 'Welcome! How can we help you today?' },
  enableAutoAway: { type: Boolean, default: false },
  autoAwayMessage: { type: String, default: 'We are currently away. Please leave a message.' },
  businessHoursStart: { type: String, default: '09:00' },
  businessHoursEnd: { type: String, default: '18:00' },
  strictModeration: { type: Boolean, default: true },
  blockContactSharing: { type: Boolean, default: true },
  blockedKeywords: { type: [String], default: ["spam", "scam", "idiot", "stupid", "paytm", "gpay", "phonepe", "bank transfer", "transfer directly", "cash payment", "discount directly", "bypass commission", "save commission", "commission bypass", "without roomhy", "off-platform", "offline payment", "pay offline", "send number", "call me", "meet offline", "pay me directly"] },
  blockLinks: { type: Boolean, default: true },
  blockPhoneNumbers: { type: Boolean, default: true },
  blockEmails: { type: Boolean, default: true },
  autoBanRepeatedOffenders: { type: Boolean, default: true },
  strikeLimit: { type: Number, default: 3 },
  banDurationHours: { type: Number, default: 24 },
  allowedFileTypes: { type: [String], default: ['image/jpeg', 'image/png', 'application/pdf'] },
  maxFileSizeMB: { type: Number, default: 5 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatSettings', ChatSettingsSchema);
