'use strict';
const RentInvoice    = require('../models/RentInvoice');
const PenaltyConfig  = require('../models/PenaltyConfig');
const RentAuditLog   = require('../models/RentAuditLog');
const CronHealth     = require('../models/CronHealth');
const Tenant         = require('../models/Tenant');
const globalConfig   = require('../config/rentCollectionConfig');
const {
  generateMonthlyInvoices,
  evaluateInvoice,
  recordPayment,
  waivePenalty,
  getEffectiveConfig,
} = require('../services/invoiceService');
const { queueNotification, dispatchNotification, sendReminderEmailDirect } = require('../services/notificationService');
const { calculatePenalties, generatePreviewBreakdown } = require('../engine/penaltyEngine');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPerformedBy(req) {
  return req.user?.loginId || String(req.user?._id) || 'unknown';
}

async function assertOwnership(invoice, userId) {
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (String(invoice.ownerId) !== String(userId)) {
    const err = new Error('Unauthorized access');
    err.status = 403;
    throw err;
  }
}

// ─── POST /api/rent-collection/invoices/generate ──────────────────────────────
async function generateInvoices(req, res) {
  try {
    const ownerId = req.user._id;
    const { billingMonth, tenants } = req.body;
    if (!billingMonth || !Array.isArray(tenants)) {
      return res.status(400).json({ success: false, message: 'billingMonth and tenants[] required' });
    }
    const result = await generateMonthlyInvoices(ownerId, billingMonth, tenants);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /api/rent-collection/penalty/calculate ──────────────────────────────
async function previewPenaltyCalculation(req, res) {
  try {
    const ownerId = req.user._id;
    const { rentAmount, propertyId, unitId, dueDate, paidAmount = 0, previewDays = 20 } = req.body;
    if (!rentAmount) return res.status(400).json({ success: false, message: 'rentAmount required' });

    const config = await getEffectiveConfig(ownerId, propertyId, unitId);
    const fakeInvoice = {
      rentAmount,
      paidAmount,
      rentPaidAmount: paidAmount,
      dueDate: dueDate || new Date(),
    };

    const current   = calculatePenalties(fakeInvoice, config);
    const breakdown = generatePreviewBreakdown(rentAmount, config, previewDays);

    res.json({ success: true, current, breakdown, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /api/rent-collection/payments ───────────────────────────────────────
async function recordPaymentHandler(req, res) {
  try {
    const { invoiceId, amount, paymentMethod, transactionId, notes } = req.body;
    if (!invoiceId || !amount) {
      return res.status(400).json({ success: false, message: 'invoiceId and amount required' });
    }

    const invoice = await RentInvoice.findById(invoiceId).lean();
    await assertOwnership(invoice, req.user._id);

    const result = await recordPayment(
      invoiceId,
      { amount, paymentMethod, transactionId, notes },
      getPerformedBy(req),
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

// ─── POST /api/rent-collection/invoices/:id/remind ───────────────────────────
async function sendReminder(req, res) {
  try {
    const invoice = await RentInvoice.findById(req.params.id).lean();
    await assertOwnership(invoice, req.user._id);

    const config    = await getEffectiveConfig(invoice.ownerId, invoice.propertyId, invoice.unitId);
    const penalties = calculatePenalties(invoice, config);

    // Always look up the tenant directly — never rely solely on what the frontend passes
    const tenantDoc = await Tenant.findById(invoice.tenantId).select('name email phone').lean();

    const [_yr, _mo] = (invoice.billingMonth || '').split('-');
    const billingMonthFormatted = (_yr && _mo)
      ? new Date(parseInt(_yr), parseInt(_mo) - 1).toLocaleString('en', { month: 'long' }) + ' ' + _yr
      : invoice.billingMonth || '';

    const payload = {
      tenantEmail:  tenantDoc?.email || invoice.tenantEmail || req.body.tenantEmail || '',
      tenantName:   tenantDoc?.name  || invoice.tenantName  || req.body.tenantName  || '',
      tenantPhone:  tenantDoc?.phone || invoice.tenantPhone || req.body.tenantPhone || '',
      billingMonth: invoice.billingMonth,
      billingMonthFormatted,
      dueDate: invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '',
      rentAmount:   invoice.rentAmount,
      totalPenalty: penalties.totalPenalty,
      daysSinceDue: penalties.daysSinceDue,
      electricityBill:          invoice.electricityBill          || 0,
      electricityUnitsConsumed: invoice.electricityUnitsConsumed || 0,
      electricityUnitCost:      invoice.electricityBill > 0 && invoice.electricityUnitsConsumed > 0
                                  ? Math.round(invoice.electricityBill / invoice.electricityUnitsConsumed)
                                  : 0,
      totalDue: penalties.totalDue + (invoice.electricityBill || 0),
    };

    if (!payload.tenantEmail || !payload.tenantEmail.includes('@')) {
      // Audit the skip so owners can see which tenants are blocking reminders
      await RentAuditLog.create({
        action:    'CONTACT_INFO_MISSING',
        invoiceId: invoice._id,
        tenantId:  invoice.tenantId,
        ownerId:   invoice.ownerId,
        meta: { reason: 'tenant_email_missing', channel: 'email', trigger: 'manual_reminder' },
      }).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'Tenant has no email address on file. Add it from the Tenants page first.',
      });
    }

    // Send email directly
    await sendReminderEmailDirect(payload.tenantEmail, payload, penalties.phase);

    // Send WhatsApp template — non-blocking, a failure here must not fail the response
    const channels = ['email'];
    try {
      const { sendWhatsAppTemplate, getMailerConfig, isWhatsAppConfigured, normalizePhoneNumber } = require('../utils/mailer');
      const cfg   = getMailerConfig();
      const phone = payload.tenantPhone
        ? normalizePhoneNumber(payload.tenantPhone, cfg.whatsappDefaultCountryCode)
        : '';
      if (isWhatsAppConfigured(cfg) && phone) {
        const phase = penalties.phase;
        // Phase 1 was created with 'en'; Phase 2 & 3 with 'en_US' — must match exactly
        const langCode = phase === 1 ? 'en' : 'en_US';
        let templateName, params;
        if (phase === 1) {
          templateName = 'roomhy_rent_due_reminder';
          params = [
            { name: 'tenant_name',    value: payload.tenantName            || 'Tenant' },
            { name: 'property_name',  value: payload.billingMonthFormatted || payload.billingMonth || 'this month' },
            { name: 'due_date',       value: payload.dueDate               || 'as scheduled' },
            { name: 'amount',         value: String(payload.rentAmount     || 0) },
          ];
        } else if (phase === 2) {
          templateName = 'roomhy_rent_penalty_notice';
          params = [
            { name: 'tenant_name',      value: payload.tenantName            || 'Tenant' },
            { name: 'billing_month',    value: payload.billingMonthFormatted || payload.billingMonth || 'this month' },
            { name: 'days_overdue',     value: String(payload.daysSinceDue   || 0) },
            { name: 'rent_amount',      value: String(payload.rentAmount     || 0) },
            { name: 'electricity_bill', value: payload.electricityBill > 0 ? String(payload.electricityBill) : 'Pending' },
            { name: 'penalty_amount',   value: String(payload.totalPenalty   || 0) },
            { name: 'total_due',        value: String(payload.totalDue       || 0) },
          ];
        } else {
          templateName = 'roomhy_rent_final_notice';
          params = [
            { name: 'tenant_name',      value: payload.tenantName            || 'Tenant' },
            { name: 'billing_month',    value: payload.billingMonthFormatted || payload.billingMonth || 'this month' },
            { name: 'days_overdue',     value: String(payload.daysSinceDue   || 0) },
            { name: 'rent_amount',      value: String(payload.rentAmount     || 0) },
            { name: 'electricity_bill', value: payload.electricityBill > 0 ? String(payload.electricityBill) : 'Pending' },
            { name: 'penalty_amount',   value: String(payload.totalPenalty   || 0) },
            { name: 'total_due',        value: String(payload.totalDue       || 0) },
          ];
        }
        const waSent = await sendWhatsAppTemplate(phone, templateName, langCode, params, cfg);
        if (waSent) channels.push('whatsapp');
      }
    } catch (waErr) {
      console.warn('[sendReminder] WhatsApp template failed:', waErr.message);
    }

    res.json({ success: true, queued: channels, phase: penalties.phase });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ─── PATCH /api/rent-collection/invoices/:id/waive ───────────────────────────
async function waivePenaltyHandler(req, res) {
  try {
    const invoice = await RentInvoice.findById(req.params.id).lean();
    await assertOwnership(invoice, req.user._id);

    const { reason, waivedAmount } = req.body;
    const result = await waivePenalty(req.params.id, { reason, waivedAmount }, getPerformedBy(req));
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/dashboard ──────────────────────────────────────
async function getDashboard(req, res) {
  try {
    const ownerId = req.user._id;

    const [all, paid, partial, pending, waived] = await Promise.all([
      RentInvoice.countDocuments({ ownerId }),
      RentInvoice.countDocuments({ ownerId, status: 'PAID' }),
      RentInvoice.countDocuments({ ownerId, status: 'PARTIAL' }),
      RentInvoice.countDocuments({ ownerId, status: 'PENDING' }),
      RentInvoice.countDocuments({ ownerId, status: 'WAIVED' }),
    ]);

    const [phase1, phase2, phase3] = await Promise.all([
      RentInvoice.countDocuments({ ownerId, status: { $in: ['PENDING', 'PARTIAL'] }, currentPhase: 1 }),
      RentInvoice.countDocuments({ ownerId, status: { $in: ['PENDING', 'PARTIAL'] }, currentPhase: 2 }),
      RentInvoice.countDocuments({ ownerId, status: { $in: ['PENDING', 'PARTIAL'] }, currentPhase: 3 }),
    ]);

    const overdueTotals = await RentInvoice.aggregate([
      { $match: { ownerId, status: { $in: ['PENDING', 'PARTIAL'] } } },
      { $group: { _id: null, totalOutstanding: { $sum: '$outstandingAmount' }, totalPenalty: { $sum: '$totalPenalty' } } },
    ]);

    const totals = overdueTotals[0] || { totalOutstanding: 0, totalPenalty: 0 };

    res.json({
      success: true,
      stats: { total: all, paid, partial, pending, waived, phase1, phase2, phase3, ...totals },
      mode: globalConfig.mode,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/invoices ───────────────────────────────────────
async function listInvoices(req, res) {
  try {
    const ownerId = req.user._id;
    const { status, phase, billingMonth, page = 1, limit = 20 } = req.query;

    const filter = { ownerId };
    if (status) {
      const values = status.split(',').map(v => v.trim()).filter(Boolean);
      filter.status = values.length > 1 ? { $in: values } : values[0];
    }
    if (phase)        filter.currentPhase = parseInt(phase, 10);
    if (billingMonth) filter.billingMonth  = billingMonth;

    const skip  = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [invoices, total] = await Promise.all([
      RentInvoice.find(filter)
        .populate('tenantId', 'name email phone roomNo bedNo')
        .sort({ dueDate: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      RentInvoice.countDocuments(filter),
    ]);

    res.json({ success: true, invoices, total, page: parseInt(page, 10), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/configs ────────────────────────────────────────
async function getPenaltyConfigs(req, res) {
  try {
    const ownerId = req.user._id;
    const configs = await PenaltyConfig.find({ ownerId, isActive: true }).lean();
    res.json({ success: true, configs, globalDefaults: globalConfig });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /api/rent-collection/configs ───────────────────────────────────────
async function savePenaltyConfig(req, res) {
  try {
    const ownerId = req.user._id;
    // Destructure ownerId out of body so it cannot overwrite the auth-derived ownerId in the update
    const { propertyId = null, unitId = null, ownerId: _bodyOwnerId, ...rest } = req.body;

    const existing = await PenaltyConfig.findOne({ ownerId, propertyId, unitId }).lean();

    const cfg = await PenaltyConfig.findOneAndUpdate(
      { ownerId, propertyId, unitId },
      { ownerId, propertyId, unitId, ...rest, isActive: true },
      { upsert: true, new: true },
    );

    await RentAuditLog.create({
      action:      existing ? 'CONFIG_UPDATED' : 'CONFIG_CREATED',
      ownerId,
      performedBy: getPerformedBy(req),
      meta:        { propertyId, unitId, old: existing, new: cfg },
    }).catch(() => {}); // best-effort — never fail the response over audit logging

    res.json({ success: true, config: cfg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/invoices/:id ────────────────────────────────────
async function getInvoiceById(req, res) {
  try {
    const invoice = await RentInvoice.findById(req.params.id).lean();
    await assertOwnership(invoice, req.user._id);

    const config = invoice.penaltyConfigSnapshot || await getEffectiveConfig(invoice.ownerId, invoice.propertyId, invoice.unitId);
    const live   = calculatePenalties(invoice, config);

    res.json({ success: true, invoice, live, config });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/cron-health ────────────────────────────────────
async function getCronHealth(req, res) {
  try {
    const [lastRun, recentRuns] = await Promise.all([
      CronHealth.findOne({ jobName: 'dailyRentEvaluator' })
        .sort({ startedAt: -1 })
        .lean(),
      CronHealth.find({ jobName: 'dailyRentEvaluator' })
        .sort({ startedAt: -1 })
        .limit(10)
        .lean(),
    ]);

    // If a run has been RUNNING for longer than the lock timeout it likely
    // crashed before the finally-block could mark it FAILED.
    const staleThresholdMs = globalConfig.cronLockTimeoutMinutes * 60 * 1000;
    const augmented = lastRun && lastRun.status === 'RUNNING'
      && (Date.now() - new Date(lastRun.startedAt).getTime()) > staleThresholdMs
      ? { ...lastRun, status: 'FAILED', errorMessage: 'Process likely crashed — lock timeout exceeded' }
      : lastRun;

    res.json({
      success: true,
      lastRun: augmented,
      recentRuns,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/missing-contacts ────────────────────────────────
async function getMissingContacts(req, res) {
  try {
    // Tenant model links to owner via ownerLoginId (String). req.user.loginId is
    // the same string stored when the tenant was assigned.
    const ownerLoginId = req.user.loginId;
    if (!ownerLoginId) {
      return res.status(400).json({ success: false, message: 'Owner loginId not found in session' });
    }

    const baseFilter = { ownerLoginId, checkoutDate: null };

    const noEmail = { ...baseFilter, email: { $in: [null, ''] } };
    const noPhone = { ...baseFilter, phone: { $in: [null, ''] } };
    const noBoth  = { ...baseFilter, email: { $in: [null, ''] }, phone: { $in: [null, ''] } };
    const either  = { ...baseFilter, $or: [{ email: { $in: [null, ''] } }, { phone: { $in: [null, ''] } }] };

    const [missingEmailCount, missingPhoneCount, missingBothCount, samples] = await Promise.all([
      Tenant.countDocuments(noEmail),
      Tenant.countDocuments(noPhone),
      Tenant.countDocuments(noBoth),
      Tenant.find(either)
        .select('_id name email phone roomNo bedNo')
        .limit(20)
        .lean(),
    ]);

    res.json({
      success: true,
      missingEmailCount,
      missingPhoneCount,
      missingBothCount,
      samples: samples.map(t => ({
        tenantId:   t._id,
        tenantName: t.name,
        email:      t.email  || null,
        phone:      t.phone  || null,
        roomNo:     t.roomNo || null,
        bedNo:      t.bedNo  || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/rent-collection/wa-templates ───────────────────────────────────
// Diagnostic: fetch the exact template names + language codes registered in Meta
async function getWhatsAppTemplates(req, res) {
  try {
    const { listWhatsAppTemplates, getMailerConfig } = require('../utils/mailer');
    const cfg  = getMailerConfig();
    const name = req.query.name || '';
    const data = await listWhatsAppTemplates(name, cfg);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  generateInvoices,
  previewPenaltyCalculation,
  recordPaymentHandler,
  sendReminder,
  waivePenaltyHandler,
  getDashboard,
  listInvoices,
  getPenaltyConfigs,
  savePenaltyConfig,
  getInvoiceById,
  getCronHealth,
  getMissingContacts,
  getWhatsAppTemplates,
};
