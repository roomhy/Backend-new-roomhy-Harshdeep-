'use strict';
/**
 * One-time backfill: re-evaluate all PENDING/PARTIAL invoices using the live
 * penalty config so that old invoices (created before penalty settings were
 * configured) get correct penalty fields written to the DB immediately.
 *
 * Usage:
 *   node scripts/backfill_penalties.js
 *   node scripts/backfill_penalties.js --dry-run   (preview only, no writes)
 */

const mongoose = require('mongoose');
const path     = require('path');
const dotenv   = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const RentInvoice   = require('../models/RentInvoice');
const { evaluateInvoice } = require('../services/invoiceService');

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');
  if (isDryRun) console.log('🔍 DRY RUN — no writes will be made\n');

  const invoices = await RentInvoice.find({
    status: { $in: ['PENDING', 'PARTIAL'] },
  }).lean();

  console.log(`Found ${invoices.length} PENDING/PARTIAL invoices to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  for (const invoice of invoices) {
    try {
      const { updates, newPenalties, phaseHistoryAddition } = await evaluateInvoice(invoice);

      const changed =
        updates.totalPenalty    !== (invoice.totalPenalty    || 0) ||
        updates.currentPhase    !== (invoice.currentPhase    || 1) ||
        updates.outstandingAmount !== (invoice.outstandingAmount || invoice.rentAmount);

      if (!changed) {
        skipped++;
        continue;
      }

      console.log(
        `[${invoice._id}] ${invoice.billingMonth} — ` +
        `phase ${invoice.currentPhase || 1}→${updates.currentPhase}  ` +
        `penalty ₹${invoice.totalPenalty || 0}→₹${updates.totalPenalty}  ` +
        `outstanding ₹${invoice.outstandingAmount || invoice.rentAmount}→₹${updates.outstandingAmount}`
      );

      if (!isDryRun) {
        const pushOps = {};
        if (newPenalties.length)       pushOps.penaltyHistory = { $each: newPenalties };
        if (phaseHistoryAddition.length) pushOps.phaseHistory   = { $each: phaseHistoryAddition };

        await RentInvoice.findByIdAndUpdate(invoice._id, {
          $set:  updates,
          ...(Object.keys(pushOps).length ? { $push: pushOps } : {}),
        });
      }

      updated++;
    } catch (err) {
      console.error(`[${invoice._id}] ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n── Summary ─────────────────────────────`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped} (already correct)`);
  console.log(`  Errors  : ${errors}`);
  if (isDryRun) console.log('\n  (dry run — nothing was written)');

  await mongoose.disconnect();
  console.log('\n✅ Done. Disconnected.');
}

run().catch(err => {
  console.error('\n❌ Backfill failed:', err.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
