const mongoose = require('mongoose');

/**
 * PayoutLog
 * ─────────
 * Immutable audit trail for every Razorpay Payout API attempt.
 * This model is ADDITIVE ONLY — it never modifies PaymentTransaction,
 * Owner, BookingRequest, or any other existing collection.
 *
 * A failed payout creates a log entry with status='failed' and an
 * error_message. It does NOT roll back any existing transaction,
 * balance, or booking record.
 */
const payoutLogSchema = new mongoose.Schema({
  // ─── REFERENCE ──────────────────────────────────────────────────────────────
  transaction_id:  { type: String, required: true, index: true }, // PaymentTransaction _id
  owner_id:        { type: String, required: true, index: true }, // Owner loginId
  owner_name:      { type: String, default: '' },
  amount:          { type: Number, required: true },              // owner_amount from PaymentTransaction

  // ─── PAYOUT MODE ────────────────────────────────────────────────────────────
  mode: {
    type: String,
    enum: ['bank', 'upi'],
    default: 'bank'
  },

  // ─── RAZORPAY IDs (filled on success) ───────────────────────────────────────
  contact_id:      { type: String, default: null },  // Razorpay Contact ID
  fund_account_id: { type: String, default: null },  // Razorpay Fund Account ID
  payout_id:       { type: String, default: null },  // Razorpay Payout ID

  // ─── STATUS ─────────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: [
      'initiated',         // payout flow started
      'contact_created',   // Razorpay contact created
      'fund_account_created', // Razorpay fund account created
      'queued',            // payout request accepted by Razorpay
      'processing',        // Razorpay is processing
      'processed',         // payout completed successfully
      'failed',            // payout failed at any step
      'sandbox_success',   // sandbox test — simulated success
      'sandbox_failed'     // sandbox test — simulated failure
    ],
    default: 'initiated',
    index: true
  },

  // ─── SANDBOX FLAG ────────────────────────────────────────────────────────────
  is_sandbox: { type: Boolean, default: true },

  // ─── BANK / UPI DETAILS (snapshot at payout time) ───────────────────────────
  account_holder:  { type: String, default: null },
  account_number:  { type: String, default: null },
  ifsc_code:       { type: String, default: null },
  bank_name:       { type: String, default: null },
  upi_id:          { type: String, default: null },

  // ─── FULL REQUEST / RESPONSE LOGS ───────────────────────────────────────────
  razorpay_contact_request:      { type: mongoose.Schema.Types.Mixed, default: null },
  razorpay_contact_response:     { type: mongoose.Schema.Types.Mixed, default: null },
  razorpay_fund_account_request: { type: mongoose.Schema.Types.Mixed, default: null },
  razorpay_fund_account_response:{ type: mongoose.Schema.Types.Mixed, default: null },
  razorpay_payout_request:       { type: mongoose.Schema.Types.Mixed, default: null },
  razorpay_payout_response:      { type: mongoose.Schema.Types.Mixed, default: null },

  // ─── ERROR DETAIL ────────────────────────────────────────────────────────────
  error_step:    { type: String, default: null },    // 'contact' | 'fund_account' | 'payout' | 'network'
  error_message: { type: String, default: null },
  error_code:    { type: String, default: null },    // Razorpay error code if available

  // ─── METADATA ────────────────────────────────────────────────────────────────
  initiated_by: { type: String, default: 'superadmin' },
  created_at:   { type: Date, default: Date.now, index: true }
}, {
  collection: 'payout_logs',
  // No pre-save hooks that affect other collections
});

payoutLogSchema.index({ transaction_id: 1, created_at: -1 });
payoutLogSchema.index({ owner_id: 1, status: 1 });
payoutLogSchema.index({ payout_id: 1 }, { sparse: true });

module.exports = mongoose.models.PayoutLog || mongoose.model('PayoutLog', payoutLogSchema);
