'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationLogSchema = new Schema({
  invoiceId:  { type: Schema.Types.ObjectId, ref: 'RentInvoice', required: true },
  tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant',      required: true },
  ownerId:    { type: Schema.Types.ObjectId, ref: 'Owner',       required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },

  channel:    { type: String, enum: ['email', 'whatsapp', 'dashboard'], required: true },
  phase:      { type: Number, required: true },

  // Dedup bucket key. Examples:
  //   Phase 1 → "phase1-{daysSinceDue}"   (one per day, frequency gated by shouldSendPhase1Reminder)
  //   Phase 2 → "phase2"                  (sent once)
  //   Phase 3 → "phase3-{floor(days/3)}"  (one per 3-day window — escalating reminders)
  //   Manual  → "manual-{timestamp}"      (always new, never deduped)
  phaseKey:   { type: String },

  templateId: { type: String },

  // 'processing' prevents duplicate dispatch by concurrent retry workers
  status:     { type: String, enum: ['queued', 'sent', 'failed', 'skipped', 'processing'], default: 'queued' },
  attempts:   { type: Number, default: 0 },

  lastAttemptAt: Date,
  deliveredAt:   Date,
  failureReason: String,

  payload:    Schema.Types.Mixed,
}, {
  timestamps: true,
  collection: 'notification_logs',
});

// Primary dedup key: one per (invoice, channel, phaseKey bucket).
// sparse: true so documents without phaseKey (e.g. migrated old docs) are excluded from the index.
notificationLogSchema.index({ invoiceId: 1, channel: 1, phaseKey: 1 }, { unique: true, sparse: true });
notificationLogSchema.index({ status: 1, attempts: 1 });   // retry queue
notificationLogSchema.index({ ownerId: 1, createdAt: -1 });
// TTL: auto-delete notification logs older than 180 days.
// MongoDB's TTL background thread enforces this; no custom cleanup cron needed.
notificationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
