'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const penaltyRuleSchema = new Schema({
  enabled:        { type: Boolean, default: true },
  type:           { type: String, enum: ['fixed', 'percentage', 'daily_fixed', 'weekly_fixed', 'per_day'], default: 'fixed' },
  value:          { type: Number, default: 0 },
  incrementValue: { type: Number, default: 0 },
  maxCap:         { type: Number, default: 0 },
}, { _id: false });

const notifChannelsSchema = new Schema({
  email:      { type: Boolean, default: true },
  whatsapp:   { type: Boolean, default: false },
  dashboard:  { type: Boolean, default: true },
}, { _id: false });

const penaltyConfigSchema = new Schema({
  ownerId:    { type: Schema.Types.ObjectId, ref: 'Owner',    required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
  unitId:     { type: Schema.Types.ObjectId, default: null },

  gracePeriodDays:             { type: Number, default: 0 },
  minorPenaltyDay:             { type: Number, default: 1 },
  majorPenaltyDay:             { type: Number, default: 2 },
  rentDueDay:                  { type: Number, default: 1 }, // day of month rent is due
  phase1ReminderFrequencyDays: { type: Number, default: 1 },

  minorPenalty: { type: penaltyRuleSchema, default: () => ({}) },
  majorPenalty: { type: penaltyRuleSchema, default: () => ({}) },

  notifications: { type: notifChannelsSchema, default: () => ({}) },

  isDefault: { type: Boolean, default: false },
  isActive:  { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'penalty_configs',
});

// Unique per scope: owner-default, property-level, unit-level
penaltyConfigSchema.index({ ownerId: 1, propertyId: 1, unitId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PenaltyConfig', penaltyConfigSchema);
