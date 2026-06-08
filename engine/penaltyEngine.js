'use strict';
// Pure penalty engine — zero DB access, zero side effects.
// All date math uses IST (Asia/Kolkata) via native Intl API.

const IST_TZ = 'Asia/Kolkata';

function getISTDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date)); // returns "YYYY-MM-DD"
}

function calcDaysSinceDue(dueDate, asOfDate = null) {
  const todayStr = getISTDateString(asOfDate || new Date());
  const dueStr   = getISTDateString(new Date(dueDate));
  const todayMs  = new Date(todayStr + 'T00:00:00Z').getTime();
  const dueMs    = new Date(dueStr   + 'T00:00:00Z').getTime();
  return Math.round((todayMs - dueMs) / 86400000);
}

function determinePhase(daysSinceDue, config) {
  if (daysSinceDue < config.minorPenaltyDay) return 1;
  if (daysSinceDue < config.majorPenaltyDay) return 2;
  return 3;
}

// Days the invoice has been in Phase 2 (capped when Phase 3 starts)
function calcDaysInPhase2(daysSinceDue, config) {
  return Math.max(0, Math.min(daysSinceDue + 1, config.majorPenaltyDay) - config.minorPenaltyDay);
}

// Days the invoice has been in Phase 3 (starts at 1 on the first Phase 3 day)
function calcDaysInPhase3(daysSinceDue, config) {
  return Math.max(0, daysSinceDue - config.majorPenaltyDay + 1);
}

function calcMinorPenalty(outstandingBase, penaltyCfg, daysInPhase2) {
  if (!penaltyCfg || !penaltyCfg.enabled) return 0;
  if (penaltyCfg.type === 'percentage') {
    return Math.round(outstandingBase * (penaltyCfg.value / 100));
  }
  if (penaltyCfg.type === 'per_day') {
    // ₹X per day for every day spent in Phase 2
    return Math.round((penaltyCfg.value || 0) * daysInPhase2);
  }
  return penaltyCfg.value || 0; // fixed (one-time)
}

function calcMajorPenalty(outstandingBase, penaltyCfg, daysSinceDue, majorPenaltyDay, daysInPhase3) {
  if (!penaltyCfg || !penaltyCfg.enabled) return 0;

  const daysOverMajor = Math.max(0, daysSinceDue - majorPenaltyDay);
  let amount = 0;

  if (penaltyCfg.type === 'percentage') {
    amount = Math.round(outstandingBase * (penaltyCfg.value / 100));
  } else if (penaltyCfg.type === 'fixed') {
    amount = penaltyCfg.value || 0;
  } else if (penaltyCfg.type === 'per_day') {
    // ₹X per day for every day spent in Phase 3
    amount = (penaltyCfg.value || 0) * daysInPhase3;
  } else if (penaltyCfg.type === 'daily_fixed') {
    // legacy: base + (days over threshold) * increment
    amount = (penaltyCfg.value || 0) + daysOverMajor * (penaltyCfg.incrementValue || 0);
  } else if (penaltyCfg.type === 'weekly_fixed') {
    const weeksOver = Math.floor(daysOverMajor / 7);
    amount = (penaltyCfg.value || 0) + weeksOver * (penaltyCfg.incrementValue || 0);
  }

  if (penaltyCfg.maxCap && amount > penaltyCfg.maxCap) {
    amount = penaltyCfg.maxCap;
  }
  return Math.round(amount);
}

function calculatePenalties(invoice, config, asOfDate = null) {
  const daysSinceDue    = calcDaysSinceDue(invoice.dueDate, asOfDate);
  const phase           = determinePhase(daysSinceDue, config);
  // Use rent-specific tracker; fall back to paidAmount for invoices predating this field
  const rentPaid        = invoice.rentPaidAmount ?? invoice.paidAmount ?? 0;
  const outstandingBase = Math.max(0, (invoice.rentAmount || 0) - rentPaid);
  const daysInPhase2    = calcDaysInPhase2(daysSinceDue, config);
  const daysInPhase3    = calcDaysInPhase3(daysSinceDue, config);

  let minorPenalty = 0;
  let majorPenalty = 0;

  if (phase >= 2) {
    minorPenalty = calcMinorPenalty(outstandingBase, config.minorPenalty, daysInPhase2);
  }
  if (phase >= 3) {
    majorPenalty = calcMajorPenalty(
      outstandingBase,
      config.majorPenalty,
      daysSinceDue,
      config.majorPenaltyDay,
      daysInPhase3,
    );
  }

  const totalPenalty    = minorPenalty + majorPenalty;
  const totalDue        = outstandingBase + totalPenalty;
  const outstandingAmount = totalDue;

  return {
    daysSinceDue,
    phase,
    daysInPhase2,
    daysInPhase3,
    minorPenalty,
    majorPenalty,
    totalPenalty,
    totalDue,
    outstandingAmount,
    outstandingBase,
  };
}

function shouldSendPhase1Reminder(daysSinceDue, phase, config) {
  if (phase !== 1) return false;
  if (daysSinceDue < 0) return false;
  const freq = config.phase1ReminderFrequencyDays || 1;
  return daysSinceDue % freq === 0;
}

function generatePreviewBreakdown(rentAmount, config, previewDays = 20) {
  const rows = [];
  for (let d = 0; d <= previewDays; d++) {
    const fakeInvoice = { rentAmount, paidAmount: 0, dueDate: new Date() };
    const asOf = new Date(Date.now() + d * 86400000);
    const result = calculatePenalties(fakeInvoice, config, asOf);
    rows.push({ day: d, ...result });
  }
  return rows;
}

module.exports = {
  calcDaysSinceDue,
  determinePhase,
  calculatePenalties,
  shouldSendPhase1Reminder,
  generatePreviewBreakdown,
};
