/**
 * TEST SCRIPT: Agreement Expiry Check for tenant ROOMHY3869
 * Usage: node scripts/testAgreementExpiry.js
 *
 * What it does:
 *  1. Sets moveInDate to 11 months + 4 days ago (grace period expired)
 *  2. Immediately runs the agreement renewal logic
 *  3. Prints results
 */

// ── DNS Fix for MongoDB Atlas SRV (same as server.js) ────────────────────────
const dns = require('dns');
const currentDns = dns.getServers();
if (!currentDns.includes('8.8.8.8')) {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
  console.log('🔧 DNS set to 8.8.8.8 / 8.8.4.4');
}
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
const TEST_LOGIN_ID = process.argv[2]; // Pass as: node scripts/testAgreementExpiry.js ROOMHYTNT1234

async function run() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  const Tenant = require('../models/Tenant');
  const Notification = require('../models/Notification');
  const { sendMail } = require('../utils/mailer');

  // ── If no loginId given, list available active tenants ───────────────────────
  if (!TEST_LOGIN_ID) {
    console.log('⚠️  No loginId provided. Usage: node scripts/testAgreementExpiry.js <TENANT_LOGIN_ID>\n');
    const tenants = await Tenant.find({ status: 'active' }).select('loginId name moveInDate roomNo').limit(20);
    console.log('📋 Available active tenants:');
    tenants.forEach(t => console.log(`   ${t.loginId} — ${t.name} (Room: ${t.roomNo || 'N/A'}) moveIn: ${t.moveInDate?.toDateString() || 'N/A'}`));
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Step 1: Find the tenant ──────────────────────────────────────────────────
  const tenant = await Tenant.findOne({ loginId: TEST_LOGIN_ID });
  if (!tenant) {
    console.error(`❌ Tenant ${TEST_LOGIN_ID} not found! This might be an Owner loginId.`);
    console.log('\n📋 Searching all tenants...');
    const tenants = await Tenant.find({ status: 'active' }).select('loginId name moveInDate roomNo').limit(20);
    console.log('Available active tenants:');
    tenants.forEach(t => console.log(`   ${t.loginId} — ${t.name} (Room: ${t.roomNo || 'N/A'})`));
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`👤 Tenant found: ${tenant.name} (${tenant.loginId})`);
  console.log(`   Current status: ${tenant.status}`);
  console.log(`   Current moveInDate: ${tenant.moveInDate}`);

  // ── Step 2: Set moveInDate to 11 months + 4 days ago ────────────────────────
  const testDate = new Date();
  testDate.setMonth(testDate.getMonth() - 11);
  testDate.setDate(testDate.getDate() - 4); // 4 days past 11-month mark = grace expired

  console.log(`\n📅 Setting moveInDate to: ${testDate.toDateString()} (11m + 4 days ago)`);
  console.log('🔄 Resetting status to ACTIVE for fresh test...');
  tenant.moveInDate = testDate;
  tenant.status = 'active'; // Force reset for testing
  await tenant.save();
  console.log('✅ moveInDate updated + status reset to active\n');

  // ── Step 3: Run agreement renewal logic NOW ──────────────────────────────────
  console.log('🔔 Running agreement renewal check...\n');

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const start = new Date(testDate);
  start.setHours(0, 0, 0, 0);

  const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const monthDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const dayInMonthDiff = now.getDate() - start.getDate();

  console.log(`   Days since move-in: ${daysSince}`);
  console.log(`   Month diff: ${monthDiff}`);
  console.log(`   Day-in-month diff: ${dayInMonthDiff}`);

  const isGraceExpired = monthDiff > 11 || (monthDiff === 11 && dayInMonthDiff >= 3);
  console.log(`   Grace expired? ${isGraceExpired ? '✅ YES' : '❌ NO'}\n`);

  if (isGraceExpired && tenant.status === 'active') {
    console.log('🚨 Grace period expired → Marking as inactive (ex-tenant)...');

    tenant.status = 'inactive';
    await tenant.save();
    console.log('✅ Status set to INACTIVE\n');

    // Notify tenant
    if (tenant.loginId) {
      await Notification.create({
        toLoginId: tenant.loginId,
        from: 'system',
        type: 'system',
        meta: { title: '⚠️ Agreement Expired — Account Suspended', message: 'Your 11-month agreement has expired and the 3-day grace period is over. Your account has been marked inactive. Please contact your property owner to renew.' },
        read: false
      });
      console.log(`✅ Notification sent to tenant: ${tenant.loginId}`);
    }

    // Notify owner
    if (tenant.ownerLoginId) {
      await Notification.create({
        toLoginId: tenant.ownerLoginId,
        from: 'system',
        type: 'system',
        meta: { title: `🚨 Tenant ${tenant.name} — Agreement Expired`, message: `Tenant ${tenant.name} (Room: ${tenant.roomNo || 'N/A'}) agreement has expired. They have been marked inactive. Please renew or process moveout.` },
        read: false
      });
      console.log(`✅ Notification sent to owner: ${tenant.ownerLoginId}`);
    }

    // Email
    if (tenant.email) {
      try {
        await sendMail(
          tenant.email,
          '⚠️ Your Roomhy Agreement Has Expired',
          `Dear ${tenant.name}, your 11-month rental agreement has expired. Please contact your property owner to renew.`,
          `<h2>Agreement Expired</h2><p>Dear ${tenant.name},</p><p>Your 11-month rental agreement has expired and the 3-day grace period is now over.</p><p>Your account has been marked inactive. Please contact your property owner immediately.</p><br><p>— Roomhy Team</p>`
        );
        console.log(`✅ Email sent to: ${tenant.email}`);
      } catch (e) {
        console.warn(`⚠️  Email failed: ${e.message}`);
      }
    } else {
      console.log('ℹ️  No email on file for this tenant');
    }

  } else if (tenant.status !== 'active') {
    console.log(`ℹ️  Tenant is already ${tenant.status} — no action needed`);
  } else {
    console.log('ℹ️  Grace period not expired yet');
  }

  const updated = await Tenant.findOne({ loginId: TEST_LOGIN_ID });
  const ownerLoginId = updated.ownerLoginId;
  const tenantNotifs = await Notification.find({ toLoginId: TEST_LOGIN_ID }).sort({ createdAt: -1 }).limit(3);
  const ownerNotifs = ownerLoginId ? await Notification.find({ toLoginId: ownerLoginId }).sort({ createdAt: -1 }).limit(3) : [];

  console.log('\n─── FINAL STATE ────────────────────────────────────────');
  console.log(`Tenant status: ${updated.status}`);
  console.log(`Owner loginId: ${ownerLoginId || 'N/A'}`);
  console.log(`\nTenant notifications (${tenantNotifs.length}):`);
  tenantNotifs.forEach(n => console.log(`  📨 [${n.meta?.title || n.title || '?'}] — ${n.createdAt?.toISOString()}`));
  console.log(`\nOwner notifications (${ownerNotifs.length}):`);
  ownerNotifs.forEach(n => console.log(`  📨 [${n.meta?.title || n.title || '?'}] — ${n.createdAt?.toISOString()}`));
  console.log('────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✅ Done! Check app.roomhy.com notifications panel.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Script error:', err);
  process.exit(1);
});
