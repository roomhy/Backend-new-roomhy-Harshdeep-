'use strict';
const CronLock = require('../models/CronLock');

/**
 * Attempt to acquire an exclusive lock for a named cron job.
 *
 * Uses a single atomic findOneAndUpdate + upsert so two concurrent callers
 * can never both succeed:
 *   • If no document exists for jobName → upsert creates a locked one → acquired.
 *   • If document exists and lock is free (or expired) → update sets it locked → acquired.
 *   • If document exists but is actively locked → upsert would violate the unique
 *     index on jobName → duplicate-key error → returns false (not acquired).
 *
 * @param {string} jobName         Unique name of the cron job.
 * @param {number} timeoutMinutes  Auto-expire the lock after this many minutes
 *                                 so a crashed process never blocks forever.
 * @returns {Promise<boolean>}
 */
async function acquireLock(jobName, timeoutMinutes) {
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

  try {
    await CronLock.findOneAndUpdate(
      {
        jobName,
        $or: [
          { locked: false },
          { expiresAt: { $lte: now } }, // expired lock — safe to reclaim
        ],
      },
      { $set: { locked: true, lockedAt: now, expiresAt } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    // Duplicate key on the unique jobName index means:
    // a document WITH this jobName exists but did NOT satisfy the filter
    // (i.e., another process holds an active, non-expired lock).
    if (err.code === 11000) return false;
    throw err;
  }
}

/**
 * Release the lock held by this process.
 * Safe to call even if the lock has already expired — it is a no-op in that case.
 */
async function releaseLock(jobName) {
  await CronLock.updateOne({ jobName }, { $set: { locked: false } });
}

module.exports = { acquireLock, releaseLock };
