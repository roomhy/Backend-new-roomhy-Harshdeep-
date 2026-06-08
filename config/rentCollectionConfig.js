// IMPORTANT: Currently configured for TESTING MODE.
// Before production deployment, update .env to:
//   RENT_MODE=production
//   RENT_GRACE_PERIOD_DAYS=6
//   RENT_MINOR_PENALTY_DAY=7
//   RENT_MAJOR_PENALTY_DAY=12
const rentCollectionConfig = {
  mode: process.env.RENT_MODE || 'testing',
  gracePeriodDays:              parseInt(process.env.RENT_GRACE_PERIOD_DAYS   ?? '0',  10),
  minorPenaltyDay:              parseInt(process.env.RENT_MINOR_PENALTY_DAY   ?? '7',  10),
  majorPenaltyDay:              parseInt(process.env.RENT_MAJOR_PENALTY_DAY   ?? '12', 10),
  phase1ReminderFrequencyDays:  parseInt(process.env.RENT_PHASE1_REMINDER_FREQ ?? '1', 10),
  timezone: process.env.RENT_TIMEZONE || 'Asia/Kolkata',
  cronSchedule:           process.env.RENT_CRON_SCHEDULE      || '0 8 * * *',
  invoiceGenCronSchedule: process.env.RENT_INVOICE_GEN_CRON   || '0 6 1 * *',
  notifRetryCronSchedule: process.env.RENT_NOTIF_RETRY_CRON   || '0 */2 * * *',
  maxNotificationRetries: parseInt(process.env.RENT_MAX_NOTIF_RETRIES    ?? '3',  10),
  cronBatchSize:          parseInt(process.env.RENT_CRON_BATCH_SIZE       ?? '100', 10),
  // How long (minutes) a cron lock is valid before it is considered abandoned
  // by a crashed process and can be re-acquired by the next run.
  cronLockTimeoutMinutes: parseInt(process.env.CRON_LOCK_TIMEOUT_MINUTES  ?? '60', 10),
};

module.exports = rentCollectionConfig;
