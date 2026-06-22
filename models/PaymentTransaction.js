const mongoose = require('mongoose');

/**
 * PaymentTransaction
 * Created immediately after a successful Razorpay payment webhook.
 * Stores the complete commission breakdown locked at time of payment.
 * Past records are NEVER mutated — commission % is stored at point of capture.
 */
const paymentTransactionSchema = new mongoose.Schema({
  // ─── RAZORPAY ─────────────────────────────────────────────────────────────
  razorpay_payment_id: { type: String, unique: true, sparse: true, index: true },
  razorpay_order_id:   { type: String, unique: true, sparse: true, index: true, default: null },
  razorpay_signature:  { type: String, default: null },

  // ─── STATE MACHINE ────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['Created', 'Verified', 'Settled'],
    default: 'Created',
    index: true
  },

  // ─── BOOKING REFERENCE ────────────────────────────────────────────────────
  booking_id:     { type: String, required: true, index: true },
  property_id:    { type: String, required: true, index: true },
  property_name:  { type: String, default: '' },
  tenant_id:      { type: String, required: true, index: true },
  tenant_name:    { type: String, default: '' },
  owner_id:       { type: String, required: true, index: true },
  owner_name:     { type: String, default: '' },

  // ─── COMMISSION BREAKDOWN (locked at time of payment) ─────────────────────
  booking_amount:        { type: Number, required: true },   // Full amount paid by tenant
  commission_percentage: { type: Number, required: true },   // e.g. 10 (from Settings at that moment)
  commission_amount:     { type: Number, required: true },   // booking_amount * commission_percentage / 100
  owner_amount:          { type: Number, required: true },   // booking_amount - commission_amount

  // ─── PAYOUT STATUS ────────────────────────────────────────────────────────
  payout_status: {
    type: String,
    enum: ['Pending', 'Processing', 'Paid', 'Failed'],
    default: 'Pending',
    index: true
  },
  payout_reference:    { type: String, default: null },  // Razorpay payout reference
  payout_date:         { type: Date, default: null },
  payout_initiated_by: { type: String, default: null },  // Admin loginId who clicked Transfer

  // ─── OWNER BANK DETAILS (captured at time of payout) ─────────────────────
  payout_account_holder: { type: String, default: null },
  payout_account_number: { type: String, default: null },
  payout_ifsc_code:      { type: String, default: null },
  payout_bank_name:      { type: String, default: null },

  // ─── METADATA ─────────────────────────────────────────────────────────────
  payment_method: { type: String, default: 'razorpay' },
  payment_date:   { type: Date, default: Date.now, index: true },
  notes:          { type: String, default: '' },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'payment_transactions' });

paymentTransactionSchema.index({ payment_date: -1 });
paymentTransactionSchema.index({ owner_id: 1, payout_status: 1 });
paymentTransactionSchema.index({ payout_status: 1, payment_date: -1 });

paymentTransactionSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
