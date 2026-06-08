'use strict';
/**
 * Deletes notification log entries where the email was never actually sent
 * because the payload had an empty tenantEmail. These get incorrectly marked
 * 'sent' which blocks future dedup-based retries.
 *
 * Safe to run multiple times.
 *
 * Usage:
 *   node scripts/reset_stale_notifications.js
 */

const mongoose = require('mongoose');
const path     = require('path');
const dotenv   = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db         = mongoose.connection.db;
  const collection = db.collection('notification_logs');

  // Delete email notifications where tenantEmail was empty — these were marked
  // 'sent' without actually sending, and now block the dedup from creating fresh entries
  const result = await collection.deleteMany({
    channel: 'email',
    $or: [
      { 'payload.tenantEmail': '' },
      { 'payload.tenantEmail': null },
      { 'payload.tenantEmail': { $exists: false } },
    ],
  });

  console.log(`✅ Deleted ${result.deletedCount} stale email notification log(s)`);

  await mongoose.disconnect();
  console.log('✅ Done.');
}

run().catch(err => {
  console.error('❌ Failed:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
