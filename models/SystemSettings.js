const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  commission_percentage: { type: Number, default: 10 },
  gst_percentage: { type: Number, default: 18 },
  revenueBalance: { type: Number, default: 0 },
  fixedFee: { type: Number, default: 500 },
  perBedFee: { type: Number, default: 50 },
  invoicePrefix: { type: String, default: 'RHY-' },
  invoiceCounter: { type: Number, default: 1000 },
  dueReminderDays: { type: Number, default: 3 },
  paymentSuccessTemplate: { type: String, default: 'Dear {tenantName}, your payment of ₹{amount} was successful!' },
  paymentFailureTemplate: { type: String, default: 'Dear {tenantName}, payment of ₹{amount} failed. Please try again.' },
  rentDueTemplate: { type: String, default: 'Dear {tenantName}, rent of ₹{amount} is due on {dueDate}.' },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: String, default: 'system' }
}, { collection: 'system_settings' });

systemSettingsSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
