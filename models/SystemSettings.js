const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  commission_percentage: { type: Number, default: 10 },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: String, default: 'system' }
}, { collection: 'system_settings' });

systemSettingsSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
