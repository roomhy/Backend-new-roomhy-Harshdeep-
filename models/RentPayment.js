'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const rentPaymentSchema = new Schema({
  invoiceId:  { type: Schema.Types.ObjectId, ref: 'RentInvoice', required: true, index: true },
  tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant',      required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property',    required: true },
  ownerId:    { type: Schema.Types.ObjectId, ref: 'Owner',       required: true },

  amount:        { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'online', 'upi', 'bank_transfer', 'other'], default: 'cash' },
  transactionId: { type: String, sparse: true, unique: true },

  isPartial:       { type: Boolean, default: false },
  remainingAfter:  { type: Number, default: 0 },

  rentPaidAmount:    { type: Number, default: 0 },
  penaltyPaidAmount: { type: Number, default: 0 },

  paymentDate: { type: Date, default: Date.now },
  isLateEntry: { type: Boolean, default: false },

  recordedBy: { type: String },  // loginId of owner or manager
  notes:      String,
}, {
  timestamps: true,
  collection: 'rent_payments',
});

rentPaymentSchema.index({ ownerId: 1, paymentDate: -1 });
rentPaymentSchema.index({ tenantId: 1, paymentDate: -1 });

module.exports = mongoose.model('RentPayment', rentPaymentSchema);
