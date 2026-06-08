'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cronHealthSchema = new Schema({
  jobName:             { type: String, required: true },
  startedAt:           { type: Date,   required: true },
  completedAt:         { type: Date },
  durationMs:          { type: Number },

  invoicesProcessed:   { type: Number, default: 0 },
  notificationsQueued: { type: Number, default: 0 },
  notificationsSent:   { type: Number, default: 0 },
  notificationsFailed: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['RUNNING', 'SUCCESS', 'FAILED'],
    required: true,
    default: 'RUNNING',
  },

  errorMessage: { type: String },
}, {
  collection: 'cron_health',
  timestamps: false,
});

// Keep 30 days of run history — old entries auto-deleted by MongoDB TTL thread.
cronHealthSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
// Fast "latest run for this job" query.
cronHealthSchema.index({ jobName: 1, startedAt: -1 });

module.exports = mongoose.model('CronHealth', cronHealthSchema);
