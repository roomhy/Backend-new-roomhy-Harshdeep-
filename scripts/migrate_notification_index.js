'use strict';
/**
 * Migration: swap NotificationLog dedup index
 *
 * Before: unique { invoiceId, channel, phase }
 * After:  unique sparse { invoiceId, channel, phaseKey }
 *
 * Why: the old phase-number index blocked all Phase-3 repeat reminders
 * because every Phase-3 notification shares the same phase=3 value.
 * The new phaseKey index uses day-bucket strings so each window is distinct.
 *
 * Safe to run multiple times — all operations are idempotent.
 *
 * Usage:
 *   node scripts/migrate_notification_index.js
 *
 * Rollback:
 *   node scripts/migrate_notification_index.js --rollback
 */

const mongoose = require('mongoose');
const path     = require('path');
const dotenv   = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const OLD_INDEX = 'invoiceId_1_channel_1_phase_1';
const NEW_INDEX = 'invoiceId_1_channel_1_phaseKey_1';
const COLLECTION = 'notification_logs';

const isRollback = process.argv.includes('--rollback');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db         = mongoose.connection.db;
  const collection = db.collection(COLLECTION);

  // ── List current indexes ────────────────────────────────────────────────────
  const indexes = await collection.indexes();
  const indexNames = indexes.map(i => i.name);

  console.log('\nCurrent indexes on', COLLECTION + ':');
  indexes.forEach(i => console.log(' •', i.name, JSON.stringify(i.key)));

  if (isRollback) {
    await rollback(collection, indexNames);
  } else {
    await forward(collection, indexNames);
  }

  await mongoose.disconnect();
  console.log('\n✅ Done. Disconnected.');
}

// ── Forward migration ─────────────────────────────────────────────────────────

async function forward(collection, indexNames) {
  // Step 1: drop old index if present
  if (indexNames.includes(OLD_INDEX)) {
    console.log(`\nDropping old index "${OLD_INDEX}"...`);
    await collection.dropIndex(OLD_INDEX);
    console.log('  ✅ Dropped.');
  } else {
    console.log(`\nOld index "${OLD_INDEX}" not found — already removed or fresh install.`);
  }

  // Step 2: ensure new index exists
  if (indexNames.includes(NEW_INDEX)) {
    console.log(`New index "${NEW_INDEX}" already exists — nothing to create.`);
  } else {
    console.log(`Creating new index "${NEW_INDEX}"...`);
    await collection.createIndex(
      { invoiceId: 1, channel: 1, phaseKey: 1 },
      { unique: true, sparse: true, name: NEW_INDEX },
    );
    console.log('  ✅ Created.');
  }

  // Step 3: verify
  const after = await collection.indexes();
  const afterNames = after.map(i => i.name);

  if (afterNames.includes(OLD_INDEX)) {
    console.error('\n❌ VERIFICATION FAILED: old index still present.');
    process.exitCode = 1;
    return;
  }
  if (!afterNames.includes(NEW_INDEX)) {
    console.error('\n❌ VERIFICATION FAILED: new index not found.');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅ Verification passed:');
  console.log(`  OLD "${OLD_INDEX}" — absent ✓`);
  console.log(`  NEW "${NEW_INDEX}" — present ✓`);
}

// ── Rollback ──────────────────────────────────────────────────────────────────

async function rollback(collection, indexNames) {
  console.log('\n⏪ Running rollback...');

  // Step 1: drop new index if present
  if (indexNames.includes(NEW_INDEX)) {
    console.log(`Dropping new index "${NEW_INDEX}"...`);
    await collection.dropIndex(NEW_INDEX);
    console.log('  ✅ Dropped.');
  } else {
    console.log(`New index "${NEW_INDEX}" not found — nothing to drop.`);
  }

  // Step 2: re-create old index
  if (indexNames.includes(OLD_INDEX)) {
    console.log(`Old index "${OLD_INDEX}" already present — nothing to create.`);
  } else {
    console.log(`Recreating old index "${OLD_INDEX}"...`);
    await collection.createIndex(
      { invoiceId: 1, channel: 1, phase: 1 },
      { unique: true, name: OLD_INDEX },
    );
    console.log('  ✅ Recreated.');
  }

  // Step 3: verify
  const after = await collection.indexes();
  const afterNames = after.map(i => i.name);

  if (!afterNames.includes(OLD_INDEX)) {
    console.error('\n❌ ROLLBACK VERIFICATION FAILED: old index not restored.');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅ Rollback verification passed:');
  console.log(`  OLD "${OLD_INDEX}" — present ✓`);
}

run().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
