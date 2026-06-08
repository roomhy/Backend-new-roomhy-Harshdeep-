'use strict';
const NotificationLog = require('../models/NotificationLog');
const RentAuditLog    = require('../models/RentAuditLog');
const globalConfig    = require('../config/rentCollectionConfig');

let sendMail, sendWhatsAppTemplate, sendWhatsAppMessage, getMailerConfig, isWhatsAppConfigured, normalizePhoneNumber;
try {
  const mailer            = require('../utils/mailer');
  sendMail                = mailer.sendMail;
  sendWhatsAppTemplate    = mailer.sendWhatsAppTemplate;
  sendWhatsAppMessage     = mailer.sendWhatsAppMessage;
  getMailerConfig         = mailer.getMailerConfig;
  isWhatsAppConfigured    = mailer.isWhatsAppConfigured;
  normalizePhoneNumber    = mailer.normalizePhoneNumber;
} catch (_) {
  sendMail = null;
}

function buildPaymentDetailsWA(p) {
  const lines = [];
  if (p.ownerUpiId)         lines.push(`📱 *UPI ID:* ${p.ownerUpiId}`);
  if (p.ownerAccountNumber) {
    lines.push(`🏦 *Bank Transfer:*`);
    if (p.ownerBankName)      lines.push(`   Bank: ${p.ownerBankName}`);
    if (p.ownerAccountHolder) lines.push(`   A/c Holder: ${p.ownerAccountHolder}`);
    lines.push(`   A/c No: ${p.ownerAccountNumber}`);
    if (p.ownerIfscCode)      lines.push(`   IFSC: ${p.ownerIfscCode}`);
  }
  if (!lines.length) return '';
  return `💳 *Complete Your Payment*\n\n${lines.join('\n')}\n\nPlease confirm once payment is done 🙏`;
}

// ─── Queue a notification (dedup via unique index) ────────────────────────────

async function queueNotification({ invoiceId, tenantId, ownerId, propertyId, channel, phase, phaseKey, templateId, payload }) {
  try {
    const log = await NotificationLog.create({
      invoiceId, tenantId, ownerId, propertyId,
      channel, phase, phaseKey, templateId,
      status: 'queued',
      payload,
    });
    return log;
  } catch (err) {
    // Duplicate key = already queued/sent for this (invoice, channel, phaseKey) — skip silently
    if (err.code === 11000) return null;
    throw err;
  }
}

// ─── Dispatch a single queued notification ────────────────────────────────────

// Returns: 'sent' | 'failed' | 'queued' | null
// Callers (cron loop) use the return value to aggregate health stats
// without issuing extra DB queries.
async function dispatchNotification(logId) {
  const log = await NotificationLog.findById(logId);
  if (!log || log.status === 'sent') return null;

  await NotificationLog.findByIdAndUpdate(logId, {
    $inc: { attempts: 1 },
    $set: { lastAttemptAt: new Date() },
  });

  try {
    if (log.channel === 'email') {
      await sendEmailNotification(log);
    } else if (log.channel === 'whatsapp') {
      await sendWhatsappNotification(log);
    } else if (log.channel === 'dashboard') {
      await sendDashboardNotification(log);
    }

    await NotificationLog.findByIdAndUpdate(logId, {
      $set: { status: 'sent', deliveredAt: new Date() },
    });

    await RentAuditLog.create({
      action:     'NOTIFICATION_SENT',
      invoiceId:  log.invoiceId,
      tenantId:   log.tenantId,
      ownerId:    log.ownerId,
      propertyId: log.propertyId,
      meta:       { channel: log.channel, phase: log.phase },
    });

    return 'sent';
  } catch (err) {
    const attempts = (log.attempts || 0) + 1;
    const newStatus = attempts >= globalConfig.maxNotificationRetries ? 'failed' : 'queued';

    await NotificationLog.findByIdAndUpdate(logId, {
      $set: { status: newStatus, failureReason: err.message },
    });

    if (newStatus === 'failed') {
      await RentAuditLog.create({
        action:     'NOTIFICATION_FAILED',
        invoiceId:  log.invoiceId,
        tenantId:   log.tenantId,
        ownerId:    log.ownerId,
        meta:       { channel: log.channel, phase: log.phase, error: err.message },
      });
    }

    return newStatus; // 'failed' | 'queued'
  }
}

// ─── Retry failed/queued notifications ───────────────────────────────────────

// After a server crash a record can be stranded in 'processing' forever.
// Any record whose lastAttemptAt is older than this threshold is considered
// abandoned and is safe to reclaim.
const STALE_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes

async function retryFailedNotifications() {
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS);

  const retryable = await NotificationLog.find({
    $or: [
      // Normal retry candidates
      { status: { $in: ['queued', 'failed'] }, attempts: { $lt: globalConfig.maxNotificationRetries } },
      // Stale processing records — claimed but server crashed before dispatch finished.
      // $not $gte also catches null (no attempt timestamp recorded before crash).
      { status: 'processing', lastAttemptAt: { $not: { $gte: staleThreshold } } },
    ],
  }).limit(50).lean();

  for (const log of retryable) {
    // Atomically re-claim.  For normal records: reject if already processing.
    // For stale records: allow re-claim only if still within the stale window
    // (guards against a tight race where two workers both saw the same stale record).
    const claimed = await NotificationLog.findOneAndUpdate(
      {
        _id: log._id,
        $or: [
          { status: { $ne: 'processing' } },
          { status: 'processing', lastAttemptAt: { $not: { $gte: staleThreshold } } },
        ],
      },
      { $set: { status: 'processing' } },
      { new: true },
    );
    if (!claimed) continue; // active worker already holds this record

    await dispatchNotification(log._id);
  }
}

// ─── Channel senders ──────────────────────────────────────────────────────────

async function sendEmailNotification(log) {
  if (!sendMail) return;
  const p = log.payload || {};
  if (!p.tenantEmail) return;
  await sendMail(
    p.tenantEmail,
    p.subject || `Rent Reminder — Phase ${log.phase}`,
    null,
    buildEmailHtml(p, log.phase),
    { skipWhatsApp: true }, // WhatsApp is handled by the dedicated 'whatsapp' channel
  );
}

async function sendWhatsappNotification(log) {
  if (!sendWhatsAppTemplate || !getMailerConfig || !isWhatsAppConfigured || !normalizePhoneNumber) {
    throw new Error('WhatsApp mailer helpers not loaded');
  }
  const cfg = getMailerConfig();
  if (!isWhatsAppConfigured(cfg)) {
    throw new Error('WhatsApp not configured — missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
  }

  const p     = log.payload || {};
  const phone = normalizePhoneNumber(p.tenantPhone, cfg.whatsappDefaultCountryCode);
  if (!phone) throw new Error('Tenant phone number missing or invalid');

  const phase = log.phase || 1;
  // All phases use the single approved template; amount escalates with phase
  const amount = phase === 1
    ? String(p.rentAmount || 0)
    : String(p.totalDue   || 0); // rent + electricity + penalty for phase 2/3
  const params = [
    { name: 'tenant_name',   value: p.tenantName            || 'Tenant' },
    { name: 'property_name', value: p.billingMonthFormatted || p.billingMonth || 'this month' },
    { name: 'due_date',      value: p.dueDate               || 'as scheduled' },
    { name: 'amount',        value: amount },
  ];

  const sent = await sendWhatsAppTemplate(phone, 'roomhy_rent_due_reminder', 'en', params, cfg);
  if (!sent) throw new Error(`WhatsApp template delivery failed`);

  // Follow-up free-form message with payment details (only works within Meta's 24h window)
  const payMsg = buildPaymentDetailsWA(p);
  if (payMsg && sendWhatsAppMessage) {
    sendWhatsAppMessage(phone, payMsg, cfg).catch(() => {});
  }
}

async function sendDashboardNotification(log) {
  const Notification = require('../models/Notification');
  const p = log.payload || {};
  await Notification.create({
    userId:    log.ownerId,
    type:      'rent_alert',
    title:     p.subject || 'Rent Payment Alert',
    message:   p.body    || `Tenant has a pending rent (Phase ${log.phase})`,
    metadata:  { invoiceId: log.invoiceId, phase: log.phase },
    isRead:    false,
  }).catch(() => {}); // best effort
}

function buildEmailHtml(p, phase) {
  const isPhase1 = phase === 1;
  const isPhase2 = phase === 2;
  const isPhase3 = phase === 3;

  const headerColor  = isPhase1 ? '#2563eb' : isPhase2 ? '#d97706' : '#dc2626';
  const badgeColor   = isPhase1 ? '#dbeafe' : isPhase2 ? '#fef3c7' : '#fee2e2';
  const badgeText    = isPhase1 ? '#1d4ed8' : isPhase2 ? '#92400e' : '#991b1b';
  const badgeLabel   = isPhase1 ? 'Phase 1 — Friendly Reminder' : isPhase2 ? 'Phase 2 — Penalty Applied' : 'Phase 3 — Final Notice';

  const greeting     = isPhase1
    ? `Your rent for <strong>${p.billingMonth || 'this month'}</strong> is due. Please pay at the earliest to avoid late penalties.`
    : isPhase2
    ? `Your rent for <strong>${p.billingMonth || 'this month'}</strong> is overdue. A late penalty has been added to your balance.`
    : `Your rent for <strong>${p.billingMonth || 'this month'}</strong> remains unpaid. This is a <strong>final notice</strong>. Continued non-payment may result in further action.`;

  const penaltyRow = isPhase1 ? '' : `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">Late Penalty</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#dc2626;font-weight:600;font-size:14px;text-align:right">₹${p.totalPenalty || 0}</td>
        </tr>`;

  const electricityRow = p.electricityBill > 0
    ? `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">Electricity Bill<br><span style="font-size:11px;color:#888">${p.electricityUnitsConsumed || 0} units @ ₹${p.electricityUnitCost || '—'}/unit</span></td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#d97706;font-weight:600;font-size:14px;text-align:right">₹${p.electricityBill}</td>
        </tr>`
    : `<tr>
          <td colspan="2" style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;font-style:italic">⚡ Electricity reading not yet submitted — bill will be updated once entered</td>
        </tr>`;

  const footerMessage = isPhase1
    ? 'Kindly clear your dues to avoid penalties.'
    : isPhase2
    ? 'Please pay immediately to prevent further penalties.'
    : 'Settle your outstanding balance now to avoid legal escalation.';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr>
          <td style="background:${headerColor};padding:28px 32px">
            <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:1px;text-transform:uppercase">Roohmy Property Management</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700">Rent Payment Notice</h1>
          </td>
        </tr>

        <!-- Phase Badge -->
        <tr>
          <td style="padding:20px 32px 0">
            <span style="display:inline-block;background:${badgeColor};color:${badgeText};font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.5px">${badgeLabel}</span>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:16px 32px 24px">
            <p style="margin:0 0 10px;color:#111;font-size:15px">Dear <strong>${p.tenantName || 'Tenant'}</strong>,</p>
            <p style="margin:0;color:#444;font-size:14px;line-height:1.6">${greeting}</p>
          </td>
        </tr>

        <!-- Amount Table -->
        <tr>
          <td style="padding:0 32px 24px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              <tr style="background:#f9fafb">
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#888;letter-spacing:0.5px;text-transform:uppercase">Description</td>
                <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#888;letter-spacing:0.5px;text-transform:uppercase;text-align:right">Amount</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">Billing Month</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right">${p.billingMonth || '—'}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">Rent Amount</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right">₹${p.rentAmount || 0}</td>
              </tr>
              ${penaltyRow}
              ${electricityRow}
              <tr style="background:#f9fafb">
                <td style="padding:12px 14px;color:#111;font-size:15px;font-weight:700">Total Due</td>
                <td style="padding:12px 14px;color:${headerColor};font-size:16px;font-weight:700;text-align:right">₹${p.totalDue || p.rentAmount || 0}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Days Overdue (phases 2 & 3 only) -->
        ${!isPhase1 ? `
        <tr>
          <td style="padding:0 32px 20px">
            <p style="margin:0;background:#fff7ed;border-left:4px solid ${headerColor};padding:10px 14px;border-radius:4px;color:#555;font-size:13px">
              <strong style="color:${headerColor}">${p.daysSinceDue || 0} day${(p.daysSinceDue || 0) !== 1 ? 's' : ''} overdue</strong> — ${footerMessage}
            </p>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:0 32px 20px">
            <p style="margin:0;background:#eff6ff;border-left:4px solid #2563eb;padding:10px 14px;border-radius:4px;color:#555;font-size:13px">${footerMessage}</p>
          </td>
        </tr>`}

        <!-- Pay Now section -->
        ${(p.ownerUpiId || p.ownerAccountNumber) ? `
        <tr>
          <td style="padding:0 32px 24px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d1fae5;border-radius:8px;overflow:hidden;background:#f0fdf4">
              <tr>
                <td colspan="2" style="padding:10px 14px 6px;font-size:12px;font-weight:700;color:#166534;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #d1fae5">
                  ✅ Complete Your Payment
                </td>
              </tr>
              ${p.ownerUpiId ? `
              <tr>
                <td style="padding:10px 14px;color:#555;font-size:13px;width:140px;vertical-align:top">Pay via UPI</td>
                <td style="padding:10px 14px;font-weight:700;font-size:14px;color:#166534;font-family:monospace">${p.ownerUpiId}</td>
              </tr>` : ''}
              ${p.ownerAccountNumber ? `
              <tr style="border-top:1px solid #d1fae5">
                <td style="padding:10px 14px;color:#555;font-size:13px;vertical-align:top">Bank Transfer</td>
                <td style="padding:10px 14px;font-size:13px;color:#111;line-height:1.7">
                  ${p.ownerBankName ? `<strong>${p.ownerBankName}</strong><br>` : ''}
                  ${p.ownerAccountHolder ? `A/c Holder: ${p.ownerAccountHolder}<br>` : ''}
                  A/c No: <strong style="font-family:monospace">${p.ownerAccountNumber}</strong><br>
                  ${p.ownerIfscCode ? `IFSC: <strong style="font-family:monospace">${p.ownerIfscCode}</strong>` : ''}
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#888;font-size:12px;line-height:1.6">
              This is an automated notification from <strong style="color:#333">Roohmy</strong>. Please do not reply to this email.<br>
              For queries, contact your property manager directly.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Direct send for manual reminders (bypasses queue/dedup entirely) ────────

async function sendReminderEmailDirect(toEmail, payload, phase) {
  if (!sendMail) throw new Error('Mail service not configured');
  if (!toEmail || !toEmail.includes('@')) throw new Error('Invalid email address');
  await sendMail(
    toEmail,
    payload.subject || `Rent ${phase === 1 ? 'Reminder' : phase === 2 ? 'Penalty Notice' : 'Final Notice'} — ${payload.billingMonth}`,
    null,
    buildEmailHtml(payload, phase),
  );
}

module.exports = {
  queueNotification,
  dispatchNotification,
  retryFailedNotifications,
  sendReminderEmailDirect,
};
