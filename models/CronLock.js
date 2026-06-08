'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cronLockSchema = new Schema({
  jobName:   { type: String, required: true, unique: true },
  locked:    { type: Boolean, default: false },
  lockedAt:  { type: Date },
  expiresAt: { type: Date },
}, {
  collection: 'cron_locks',
  timestamps: false,
});

module.exports = mongoose.model('CronLock', cronLockSchema);
