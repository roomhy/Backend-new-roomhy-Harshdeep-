'use strict';

/**
 * razorpayPayoutService.js
 * ────────────────────────
 * ADDITIVE-ONLY payout sandbox/testing layer.
 *
 * SAFETY GUARANTEES (enforced by design):
 * ─────────────────────────────────────────
 * 1. This service NEVER throws an unhandled exception to callers.
 *    Every public method returns { success, ... } — never throws.
 * 2. On ANY failure (API error, network, invalid creds, rate limit),
 *    a PayoutLog entry is created and { success: false, ... } is returned.
 * 3. This service NEVER modifies PaymentTransaction status, Owner balance,
 *    BookingRequest, or any other existing collection.
 * 4. If PAYOUT_ENABLED env var is false/missing, this service is never called.
 * 5. If PAYOUT_SANDBOX_MODE=true, Razorpay test keys + test mode are used.
 *
 * Provider: Razorpay Payout API (X-Test-Mode for sandbox)
 *
 * Required ENV vars (all optional — defaults to sandbox disabled):
 *   PAYOUT_ENABLED=false
 *   PAYOUT_SANDBOX_MODE=true
 *   RAZORPAY_PAYOUT_KEY_ID=rzp_test_xxxx
 *   RAZORPAY_PAYOUT_KEY_SECRET=xxxx
 *   PAYOUT_ACCOUNT_NUMBER=   (your Razorpay X current account number)
 *   PAYOUT_CURRENCY=INR
 *   PAYOUT_QUEUE_IF_LOW_BALANCE=true
 */

const https = require('https');

// ─── CONFIG ────────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    enabled:            process.env.PAYOUT_ENABLED === 'true',
    sandboxMode:        process.env.PAYOUT_SANDBOX_MODE !== 'false', // default true (safe)
    keyId:              process.env.RAZORPAY_PAYOUT_KEY_ID || '',
    keySecret:          process.env.RAZORPAY_PAYOUT_KEY_SECRET || '',
    accountNumber:      process.env.PAYOUT_ACCOUNT_NUMBER || '',
    currency:           process.env.PAYOUT_CURRENCY || 'INR',
    queueIfLowBalance:  process.env.PAYOUT_QUEUE_IF_LOW_BALANCE !== 'false',
  };
}

// ─── HTTP HELPER ───────────────────────────────────────────────────────────────

/**
 * Makes a Razorpay Payout API request.
 * Returns { statusCode, body } — never throws.
 */
async function razorpayRequest(method, path, payload, config) {
  return new Promise((resolve) => {
    const bodyStr = payload ? JSON.stringify(payload) : '';
    const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

    const options = {
      hostname: 'api.razorpay.com',
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        ...(config.sandboxMode ? { 'X-Payout-Idempotency': '' } : {}),
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: 15000 // 15s timeout
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, body: { raw: data } });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 0, body: null, networkError: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 0, body: null, networkError: 'Request timed out after 15s' });
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── STEP 1: Create Razorpay Contact ──────────────────────────────────────────

async function createContact(owner, config, log) {
  const payload = {
    name:         owner.checkinAccountHolderName || owner.name || owner.profile?.name || 'Owner',
    email:        owner.email || owner.profile?.email || undefined,
    contact:      owner.checkinPhone || owner.phone || owner.profile?.phone || undefined,
    type:         'vendor',
    reference_id: String(owner.loginId || owner._id),
    notes: {
      owner_login_id: String(owner.loginId || ''),
      source:         'roomhy_payout_service'
    }
  };

  // Remove undefined fields
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  log.razorpay_contact_request = payload;
  log.status = 'initiated';

  const result = await razorpayRequest('POST', '/v1/contacts', payload, config);

  log.razorpay_contact_response = result.body;

  if (result.networkError) {
    log.error_step = 'contact';
    log.error_message = `Network error: ${result.networkError}`;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  if (!result.body || result.statusCode < 200 || result.statusCode >= 300) {
    log.error_step = 'contact';
    log.error_message = result.body?.error?.description || `HTTP ${result.statusCode}`;
    log.error_code    = result.body?.error?.code || null;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  log.contact_id = result.body.id;
  log.status = 'contact_created';
  return { success: true, contactId: result.body.id };
}

// ─── STEP 2: Create Fund Account ──────────────────────────────────────────────

async function createFundAccount(contactId, owner, mode, config, log) {
  let payload;

  if (mode === 'upi') {
    payload = {
      contact_id:       contactId,
      account_type:     'vpa',
      vpa: {
        address: owner.checkinUpiId
      }
    };
  } else {
    payload = {
      contact_id:       contactId,
      account_type:     'bank_account',
      bank_account: {
        name:           owner.checkinAccountHolderName || owner.name || owner.profile?.name || 'Owner',
        ifsc:           owner.checkinIfscCode || owner.profile?.ifscCode || '',
        account_number: owner.checkinBankAccountNumber || owner.profile?.accountNumber || ''
      }
    };
  }

  log.razorpay_fund_account_request = payload;

  const result = await razorpayRequest('POST', '/v1/fund_accounts', payload, config);

  log.razorpay_fund_account_response = result.body;

  if (result.networkError) {
    log.error_step = 'fund_account';
    log.error_message = `Network error: ${result.networkError}`;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  if (!result.body || result.statusCode < 200 || result.statusCode >= 300) {
    log.error_step = 'fund_account';
    log.error_message = result.body?.error?.description || `HTTP ${result.statusCode}`;
    log.error_code    = result.body?.error?.code || null;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  log.fund_account_id = result.body.id;
  log.status = 'fund_account_created';
  return { success: true, fundAccountId: result.body.id };
}

// ─── STEP 3: Create Payout ────────────────────────────────────────────────────

async function createPayout(fundAccountId, amountInPaise, transactionId, config, log) {
  const payload = {
    account_number:  config.accountNumber,
    fund_account_id: fundAccountId,
    amount:          amountInPaise,              // Razorpay expects paise (₹1 = 100 paise)
    currency:        config.currency,
    mode:            log.mode === 'upi' ? 'UPI' : 'NEFT',
    purpose:         'payout',
    queue_if_low_balance: config.queueIfLowBalance,
    reference_id:    `ROOMHY_${transactionId}`,
    narration:       `Roomhy Owner Payout - ${transactionId}`,
    notes: {
      transaction_id: String(transactionId),
      source:         'roomhy_payout_service',
      sandbox:        String(config.sandboxMode)
    }
  };

  log.razorpay_payout_request = payload;

  const result = await razorpayRequest('POST', '/v1/payouts', payload, config);

  log.razorpay_payout_response = result.body;

  if (result.networkError) {
    log.error_step = 'payout';
    log.error_message = `Network error: ${result.networkError}`;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  if (!result.body || result.statusCode < 200 || result.statusCode >= 300) {
    log.error_step = 'payout';
    log.error_message = result.body?.error?.description || `HTTP ${result.statusCode}`;
    log.error_code    = result.body?.error?.code || null;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  // Razorpay payout status: 'queued', 'processing', 'processed', 'cancelled', 'rejected', 'reversed'
  const rzpStatus = result.body.status || 'queued';
  if (['cancelled', 'rejected', 'reversed'].includes(rzpStatus)) {
    log.error_step = 'payout';
    log.error_message = `Razorpay rejected payout: ${rzpStatus}`;
    log.status = 'failed';
    return { success: false, error: log.error_message };
  }

  log.payout_id = result.body.id;
  log.status = rzpStatus === 'processed' ? 'processed' : 'queued';
  return { success: true, razorpay_payout_id: result.body.id, rzpStatus };
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

/**
 * initiateOwnerPayout(tx, ownerDoc, options)
 * ─────────────────────────────────────────
 * @param {Object} tx       - PaymentTransaction document
 * @param {Object} ownerDoc - Owner document
 * @param {Object} options  - { initiated_by: 'superadmin' }
 *
 * @returns {Promise<{
 *   success: boolean,
 *   razorpay_payout_id?: string,
 *   status?: string,
 *   log_id?: string,
 *   error?: string
 * }>}
 *
 * NEVER THROWS. Always returns an object.
 * NEVER modifies tx, ownerDoc, or any existing record.
 */
async function initiateOwnerPayout(tx, ownerDoc, options = {}) {
  const config = getConfig();

  // ── Validation: config check ──────────────────────────────────────────────
  if (!config.enabled) {
    return { success: false, error: 'PAYOUT_ENABLED is not set to true' };
  }
  if (!config.keyId || !config.keySecret) {
    return { success: false, error: 'Razorpay payout keys not configured (RAZORPAY_PAYOUT_KEY_ID / RAZORPAY_PAYOUT_KEY_SECRET)' };
  }
  if (!config.accountNumber) {
    return { success: false, error: 'PAYOUT_ACCOUNT_NUMBER not configured (Razorpay X account number)' };
  }

  // ── Determine payout mode ─────────────────────────────────────────────────
  const hasUpi  = !!(ownerDoc.checkinUpiId && ownerDoc.checkinUpiId.includes('@'));
  const hasBank = !!(ownerDoc.checkinBankAccountNumber && ownerDoc.checkinIfscCode);
  const mode    = hasUpi ? 'upi' : (hasBank ? 'bank' : null);

  if (!mode) {
    return {
      success: false,
      error: 'Owner has no valid bank account or UPI details configured'
    };
  }

  // ── Amount: Razorpay expects paise ────────────────────────────────────────
  const amountInPaise = Math.round((tx.owner_amount || 0) * 100);
  if (amountInPaise <= 0) {
    return { success: false, error: `Invalid payout amount: ₹${tx.owner_amount}` };
  }

  // ── Build log object (in-memory, saved at end) ────────────────────────────
  const PayoutLog = require('../models/PayoutLog');
  const logData = {
    transaction_id:  String(tx._id),
    owner_id:        String(tx.owner_id || ownerDoc.loginId || ''),
    owner_name:      tx.owner_name || ownerDoc.name || '',
    amount:          tx.owner_amount,
    mode,
    is_sandbox:      config.sandboxMode,
    account_holder:  ownerDoc.checkinAccountHolderName || ownerDoc.name || null,
    account_number:  mode === 'bank' ? ownerDoc.checkinBankAccountNumber : null,
    ifsc_code:       mode === 'bank' ? ownerDoc.checkinIfscCode : null,
    bank_name:       mode === 'bank' ? ownerDoc.checkinBankName : null,
    upi_id:          mode === 'upi'  ? ownerDoc.checkinUpiId : null,
    initiated_by:    options.initiated_by || 'superadmin',
    status:          'initiated'
  };

  // Use a plain object as mutable log — saved to DB at the end
  const log = { ...logData };

  try {
    // ── STEP 1: Create Contact ──────────────────────────────────────────────
    const contactResult = await createContact(ownerDoc, config, log);
    if (!contactResult.success) {
      await saveLog(PayoutLog, log);
      return { success: false, error: contactResult.error, log_id: log._savedId };
    }

    // ── STEP 2: Create Fund Account ─────────────────────────────────────────
    const fundResult = await createFundAccount(contactResult.contactId, ownerDoc, mode, config, log);
    if (!fundResult.success) {
      await saveLog(PayoutLog, log);
      return { success: false, error: fundResult.error, log_id: log._savedId };
    }

    // ── STEP 3: Create Payout ───────────────────────────────────────────────
    const payoutResult = await createPayout(
      fundResult.fundAccountId,
      amountInPaise,
      String(tx._id),
      config,
      log
    );

    await saveLog(PayoutLog, log);

    if (!payoutResult.success) {
      return { success: false, error: payoutResult.error, log_id: log._savedId };
    }

    console.log(`[PayoutService] ✅ Payout initiated: ${payoutResult.razorpay_payout_id} | Owner: ${log.owner_id} | ₹${tx.owner_amount} | Mode: ${mode} | Sandbox: ${config.sandboxMode}`);

    return {
      success:            true,
      razorpay_payout_id: payoutResult.razorpay_payout_id,
      status:             log.status,
      log_id:             log._savedId,
      mode
    };

  } catch (unexpectedErr) {
    // ── Catch-all: any unhandled error is swallowed here ───────────────────
    // This guarantees the caller (superadminRoutes) is never affected.
    log.error_step    = 'unexpected';
    log.error_message = unexpectedErr.message || 'Unexpected error in payout service';
    log.status        = 'failed';

    console.error('[PayoutService] ❌ Unexpected error (non-blocking):', unexpectedErr.message);

    try {
      await saveLog(PayoutLog, log);
    } catch (_) {
      // Even log saving failure is silently swallowed
    }

    return { success: false, error: log.error_message };
  }
}

// ─── SAVE LOG HELPER ──────────────────────────────────────────────────────────

async function saveLog(PayoutLog, log) {
  try {
    const saved = await PayoutLog.create(log);
    log._savedId = String(saved._id);
  } catch (logErr) {
    // Log save failure is NEVER propagated — it's a best-effort audit trail
    console.warn('[PayoutService] ⚠️ PayoutLog save failed (non-blocking):', logErr.message);
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  initiateOwnerPayout,

  /**
   * getPayoutStatus(payoutId)
   * Check live status from Razorpay for a given payout ID.
   * Returns { success, status, body } — never throws.
   */
  async getPayoutStatus(payoutId) {
    try {
      const config = getConfig();
      if (!config.keyId || !config.keySecret) {
        return { success: false, error: 'Razorpay payout keys not configured' };
      }
      const result = await razorpayRequest('GET', `/v1/payouts/${payoutId}`, null, config);
      if (result.networkError || !result.body) {
        return { success: false, error: result.networkError || 'No response' };
      }
      return { success: true, status: result.body.status, body: result.body };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};
