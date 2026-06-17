'use strict';
const cron = require('node-cron');
let Rent = null;
let Tenant = null;
let Notification = null;
let Owner = null;
let Property = null;
let Room = null;
let Complaint = null;
let TaskBoard = null;
let VisitorLog = null;
let ElectricityMeter = null;
let OwnerChangeRequest = null;
const { sendMail } = require('../utils/mailer');

try {
    Rent = require('../models/Rent');
    Tenant = require('../models/Tenant');
    Notification = require('../models/Notification');
    Owner = require('../models/Owner');
    Property = require('../models/Property');
    Room = require('../models/Room');
    Complaint = require('../models/Complaint');
    TaskBoard = require('../models/TaskBoard');
    VisitorLog = require('../models/VisitorLog');
    ElectricityMeter = require('../models/ElectricityMeter');
    OwnerChangeRequest = require('../models/OwnerChangeRequest');
} catch (err) {
    console.warn('⚠️ Models not found:', err.message);
}

// Ensure DEMO owner exists
async function initDemoOwner() {
    if (!Owner) return;
    try {
        const demoLoginId = 'ROOMHY0000';
        let demo = await Owner.findOne({ loginId: demoLoginId });
        
        if (!demo) {
            demo = await Owner.create({
                loginId: demoLoginId,
                name: 'Demo Owner',
                email: 'demo@roomhy.com',
                phone: '0000000000',
                isActive: true,
                credentials: {
                    password: 'demo123',
                    firstTime: false
                }
            });
            console.log(`✅ Demo owner profile created: ${demoLoginId}`);
        } else if (!demo.credentials || !demo.credentials.password) {
            // Patch existing broken demo account
            demo.credentials = { password: 'demo123', firstTime: false };
            await demo.save();
            console.log('✅ Demo owner profile patched with credentials');
        }

        const User = require('../models/user');
        if (User) {
            const demoUser = await User.findOne({ loginId: demoLoginId });
            if (!demoUser) {
                await User.create({
                    loginId: demoLoginId,
                    name: 'Demo Owner',
                    email: 'demo@roomhy.com',
                    phone: '0000000000',
                    password: 'demo123', // Will be hashed by User pre-save hook
                    role: 'owner',
                    isActive: true,
                    requirePasswordReset: false
                });
                console.log(`✅ Demo owner auth record created: ${demoLoginId} / demo123`);
            } else if (demoUser.requirePasswordReset !== false) {
                demoUser.requirePasswordReset = false;
                await demoUser.save();
            }
        }
    } catch (err) {
        console.error('❌ Failed to init demo owner:', err.message);
    }
}

// Reset DEMO account data every night at midnight
const demoResetSchedule = cron.schedule('0 0 * * *', async () => {
    if (!Owner || !Property) return;
    console.log('🔄 Running daily reset for ROOMHY0000 account...');
    try {
        const demoLoginId = 'ROOMHY0000';
        
        // 1. Get properties
        const properties = await Property.find({ ownerLoginId: demoLoginId });
        const propIds = properties.map(p => p._id);
        
        // 2. Delete Relational Data
        if (Room) await Room.deleteMany({ property: { $in: propIds } });
        if (ElectricityMeter) await ElectricityMeter.deleteMany({ property: { $in: propIds } });
        
        if (Tenant) {
            const tenants = await Tenant.find({ ownerLoginId: demoLoginId });
            const tenantIds = tenants.map(t => t._id);
            if (Rent) await Rent.deleteMany({ tenant: { $in: tenantIds } });
            await Tenant.deleteMany({ ownerLoginId: demoLoginId });
        }
        
        if (Complaint) await Complaint.deleteMany({ ownerLoginId: demoLoginId });
        
        // TaskBoard belongs to owner by object id, fetch owner first
        const demoOwner = await Owner.findOne({ loginId: demoLoginId });
        if (demoOwner && TaskBoard) {
            await TaskBoard.deleteMany({ ownerId: demoOwner._id });
        }
        
        if (VisitorLog) await VisitorLog.deleteMany({ ownerLoginId: demoLoginId });
        if (OwnerChangeRequest) await OwnerChangeRequest.deleteMany({ ownerLoginId: demoLoginId });
        
        // 3. Delete Properties
        await Property.deleteMany({ ownerLoginId: demoLoginId });

        // 4. Reset Owner profile (keep login active but clear PII/Bank details)
        if (demoOwner) {
            demoOwner.checkinAccountHolderName = '';
            demoOwner.checkinBankName = '';
            demoOwner.checkinBranchName = '';
            demoOwner.checkinBankAccountNumber = '';
            demoOwner.checkinIfscCode = '';
            demoOwner.checkinUpiId = '';
            demoOwner.roomCount = 0;
            demoOwner.bedCount = 0;
            demoOwner.vacantRooms = 0;
            demoOwner.vacantBeds = 0;
            demoOwner.occupiedRooms = 0;
            demoOwner.occupiedBeds = 0;
            demoOwner.roomInventory = [];
            await demoOwner.save();
        }

        console.log('✅ Successfully wiped and reset ROOMHY0000 account data.');
    } catch (err) {
        console.error('❌ Failed to reset demo account:', err.message);
    }
});

// Send rent reminders: Every day at 10 AM during collection period (10-15th)
const rentReminderSchedule = cron.schedule('0 10 10-15 * *', async () => {
    if (!Rent) {
        console.warn('⚠️  Skipping rent reminder - dependencies not loaded');
        return;
    }
    console.log('🔔 Running rent reminder job...');
    try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const pendingRents = await Rent.find({
            collectionMonth: currentMonth,
            paymentStatus: { $in: ['pending', 'partially_paid'] }
        });

        for (const rent of pendingRents) {
            await sendRentReminderEmail(rent);
            rent.reminders.push({
                sentAt: new Date(),
                type: 'initial',
                status: 'sent',
                message: 'Rent due reminder sent'
            });
            await rent.save();
        }

        console.log(`✅ Sent ${pendingRents.length} rent reminders`);
    } catch (err) {
        console.error('❌ Rent reminder job error:', err.message);
    }
});

// Send delayed payment reminders: 3x daily (9 AM, 2 PM, 6 PM) after 15th until 31st
const delayedReminderSchedule = cron.schedule('0 9,14,18 16-31 * *', async () => {
    if (!Rent) {
        console.warn('⚠️  Skipping delayed reminder - dependencies not loaded');
        return;
    }
    console.log('🚨 Running delayed payment reminder job...');
    try {
        // Get previous month's overdue rents
        const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
        
        const overdueRents = await Rent.find({
            collectionMonth: lastMonth,
            paymentStatus: { $in: ['pending', 'partially_paid', 'overdue'] }
        });

        let sent = 0;
        for (const rent of overdueRents) {
            // Limit to 3 reminders per day
            const todayReminders = rent.reminders.filter(r => {
                const sentDate = new Date(r.sentAt);
                return sentDate.toDateString() === new Date().toDateString() && r.type.includes('delayed');
            });

            if (todayReminders.length < 3) {
                const reminderNumber = todayReminders.length + 1;
                const sent_today = await sendDelayedReminderEmail(rent, reminderNumber);
                
                if (sent_today) {
                    rent.paymentStatus = 'overdue';
                    if (!rent.overdueStartDate) rent.overdueStartDate = new Date();
                    
                    rent.reminders.push({
                        sentAt: new Date(),
                        type: `delayed_${reminderNumber}`,
                        status: 'sent',
                        message: `Overdue payment reminder #${reminderNumber}`
                    });
                    await rent.save();
                    sent++;
                }
            }
        }

        console.log(`✅ Sent ${sent} delayed payment reminders`);
    } catch (err) {
        console.error('❌ Delayed reminder job error:', err.message);
    }
});

// Daily auto reminders for rents manually enabled from rent collection page
const autoReminderSchedule = cron.schedule('30 10 * * *', async () => {
    if (!Rent) {
        console.warn('??  Skipping daily auto reminder - dependencies not loaded');
        return;
    }

    console.log('?? Running daily auto reminder job...');
    try {
        const activeRents = await Rent.find({ autoReminderEnabled: true });

        let sent = 0;
        for (const rent of activeRents) {
            // Auto-stop if already paid
            if (rent.paymentStatus === 'paid' || rent.paymentStatus === 'completed') {
                rent.autoReminderEnabled = false;
                rent.autoReminderLastSentAt = undefined;
                await rent.save();
                continue;
            }

            const lastSent = rent.autoReminderLastSentAt ? new Date(rent.autoReminderLastSentAt) : null;
            const now = new Date();
            const alreadySentToday = lastSent && lastSent.toDateString() === now.toDateString();
            if (alreadySentToday) continue;

            const emailSent = await sendRentReminderEmail(rent);
            if (!emailSent) continue;

            rent.autoReminderLastSentAt = now;
            rent.reminders.push({
                sentAt: now,
                type: 'auto_daily',
                status: 'sent',
                message: 'Daily auto reminder sent'
            });
            await rent.save();
            sent++;
        }

        console.log(`? Sent ${sent} daily auto reminders`);
    } catch (err) {
        console.error('? Daily auto reminder job error:', err.message);
    }
});

// Daily agreement renewal checks (11-month rule)
// Runs daily at 9 AM — handles missed dates, grace period, and auto ex-tenant
const agreementRenewalSchedule = cron.schedule('0 9 * * *', async () => {
    if (!Tenant || !Notification) {
        console.warn('⚠️  Skipping agreement renewal job - dependencies not loaded');
        return;
    }
    console.log('🔔 Running agreement renewal check job...');
    try {
        const activeTenants = await Tenant.find({ status: { $in: ['active', 'inactive'] } });
        const now = new Date();
        now.setHours(0, 0, 0, 0); // normalize to midnight

        let notifsSent = 0;
        let exTenantCount = 0;

        for (const tenant of activeTenants) {
            const startDate = tenant.moveInDate || tenant.agreementSignedAt || tenant.createdAt;
            if (!startDate) continue;

            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);

            // Total days since move-in
            const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));

            // Calculate months diff more accurately
            const monthDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

            // Day of month difference within current month
            const dayInMonthDiff = now.getDate() - start.getDate();

            // ── 11 months + 3 days grace expired → Auto Ex-Tenant ─────────────────
            // Either more than 11 months, or exactly 11 months and 3+ days past anniversary
            const isGraceExpired = monthDiff > 11 || (monthDiff === 11 && dayInMonthDiff >= 3);

            if (isGraceExpired && tenant.status === 'active') {
                // Auto move to inactive (ex-tenant)
                tenant.status = 'inactive';
                await tenant.save();
                exTenantCount++;

                // Notify tenant
                if (tenant.loginId) {
                    await Notification.create({
                        toLoginId: tenant.loginId,
                        from: 'system',
                        type: 'system',
                        meta: { title: '⚠️ Agreement Expired — Account Suspended', message: 'Your 11-month agreement has expired and the 3-day grace period is over. Your account has been marked inactive. Please contact your property owner to renew.' },
                        read: false
                    });
                }

                // Notify owner
                if (tenant.ownerLoginId) {
                    await Notification.create({
                        toLoginId: tenant.ownerLoginId,
                        from: 'system',
                        type: 'system',
                        meta: { title: `🚨 Tenant ${tenant.name} — Agreement Expired`, message: `Tenant ${tenant.name} (Room: ${tenant.roomNo || 'N/A'}) agreement has expired and grace period is over. They have been marked inactive. Please renew or process moveout.` },
                        read: false
                    });
                }

                // Send email to tenant
                if (tenant.email) {
                    await sendMail(
                        tenant.email,
                        '⚠️ Your Roomhy Agreement Has Expired',
                        `Dear ${tenant.name}, your 11-month rental agreement has expired. Please contact your property owner to renew.`,
                        `<h2>Agreement Expired</h2><p>Dear ${tenant.name},</p><p>Your 11-month rental agreement at <b>${tenant.propertyTitle || 'your property'}</b> has expired and the 3-day grace period is now over.</p><p>Your account has been marked inactive. Please contact your property owner immediately to renew your agreement.</p><br><p>— Roomhy Team</p>`
                    ).catch(e => console.error('Email failed:', e.message));
                }

                console.log(`🚨 Auto ex-tenant: ${tenant.name} (${tenant.loginId}) — ${daysSince} days`);
                notifsSent++;
                continue; // Skip other checks for this tenant
            }

            // ── 11-month mark — Agreement Expired, 3-day grace starts ──────────────
            // Fire on anniversary day OR within 2 days after (in case cron missed)
            const isAt11Month = monthDiff === 11 && dayInMonthDiff >= 0 && dayInMonthDiff <= 2;

            if (isAt11Month && tenant.status === 'active') {
                // Check if we already sent this notification recently (dedup)
                const recentNotif = await Notification.findOne({
                    toLoginId: tenant.loginId,
                    title: { $regex: 'ACTION REQUIRED', $options: 'i' },
                    createdAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
                }).catch(() => null);

                if (!recentNotif) {
                    if (tenant.loginId) {
                        await Notification.create({
                            toLoginId: tenant.loginId,
                            from: 'system',
                            type: 'system',
                            meta: { title: 'ACTION REQUIRED: Agreement Expired', message: 'Your 11-month rental agreement has expired. You have 3 days to renew. After 3 days, your account will be suspended.' },
                            read: false
                        });
                    }
                    if (tenant.ownerLoginId) {
                        await Notification.create({
                            toLoginId: tenant.ownerLoginId,
                            from: 'system',
                            type: 'system',
                            meta: { title: `Tenant Agreement Expired — ${tenant.name}`, message: `The 11-month agreement for tenant ${tenant.name} (Room: ${tenant.roomNo || 'N/A'}) has expired. They have 3 days to renew before being marked inactive.` },
                            read: false
                        });
                    }

                    // Email tenant
                    if (tenant.email) {
                        await sendMail(
                            tenant.email,
                            '⚠️ ACTION REQUIRED: Your Agreement Has Expired',
                            `Dear ${tenant.name}, your 11-month agreement has expired. You have 3 days to renew.`,
                            `<h2>Agreement Expired — Action Required</h2><p>Dear ${tenant.name},</p><p>Your 11-month rental agreement at <b>${tenant.propertyTitle || 'your property'}</b> has expired.</p><p><b>You have 3 days to renew your agreement.</b> After 3 days, your account will be automatically suspended.</p><p>Please contact your property owner immediately.</p><br><p>— Roomhy Team</p>`
                        ).catch(e => console.error('Email failed:', e.message));
                    }

                    notifsSent++;
                    console.log(`⚠️  11-month expiry notif sent: ${tenant.name} (${daysSince} days)`);
                }
                continue;
            }

            // ── 10-month mark — 1-month warning ────────────────────────────────────
            // Fire on anniversary day OR within 2 days after (catch-up)
            const isAt10Month = monthDiff === 10 && dayInMonthDiff >= 0 && dayInMonthDiff <= 2;

            if (isAt10Month && tenant.status === 'active') {
                // Dedup: check if already sent in last 3 days
                const recentNotif = await Notification.findOne({
                    toLoginId: tenant.loginId,
                    title: { $regex: 'Agreement Renewal Upcoming', $options: 'i' },
                    createdAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
                }).catch(() => null);

                if (!recentNotif) {
                    if (tenant.loginId) {
                        await Notification.create({
                            toLoginId: tenant.loginId,
                            from: 'system',
                            type: 'system',
                            meta: { title: '🔔 Agreement Renewal Upcoming', message: 'Your 11-month rental agreement will expire in 1 month. Please prepare for renewal with your property owner.' },
                            read: false
                        });
                    }
                    if (tenant.ownerLoginId) {
                        await Notification.create({
                            toLoginId: tenant.ownerLoginId,
                            from: 'system',
                            type: 'system',
                            meta: { title: `Tenant Agreement Expiring Soon — ${tenant.name}`, message: `The 11-month agreement for tenant ${tenant.name} (Room: ${tenant.roomNo || 'N/A'}) will expire in 1 month.` },
                            read: false
                        });
                    }

                    // Email tenant
                    if (tenant.email) {
                        await sendMail(
                            tenant.email,
                            '🔔 Your Agreement Expires in 1 Month',
                            `Dear ${tenant.name}, your rental agreement expires in 1 month. Please contact your property owner to renew.`,
                            `<h2>Agreement Renewal Reminder</h2><p>Dear ${tenant.name},</p><p>Your 11-month rental agreement at <b>${tenant.propertyTitle || 'your property'}</b> will expire in <b>1 month</b>.</p><p>Please contact your property owner to discuss renewal before it expires.</p><br><p>— Roomhy Team</p>`
                        ).catch(e => console.error('Email failed:', e.message));
                    }

                    notifsSent++;
                    console.log(`🔔 10-month warning sent: ${tenant.name} (${daysSince} days)`);
                }
            }
        }

        console.log(`✅ Agreement renewal job done: ${notifsSent} notifications, ${exTenantCount} auto ex-tenants`);
    } catch (err) {
        console.error('❌ Agreement renewal job error:', err.message);
    }
});


// Helper to generate the premium HTML template for rent reminders
function buildRentReminderEmailHtml(rent, phase, daysOverdue, ownerInfo) {
    const isPhase1 = phase === 1;
    const isPhase2 = phase === 2;
    const isPhase3 = phase === 3;

    const headerColor  = isPhase1 ? '#2563eb' : isPhase2 ? '#d97706' : '#dc2626';
    const badgeColor   = isPhase1 ? '#dbeafe' : isPhase2 ? '#fef3c7' : '#fee2e2';
    const badgeText    = isPhase1 ? '#1d4ed8' : isPhase2 ? '#92400e' : '#991b1b';
    const badgeLabel   = isPhase1 ? 'Phase 1 — Friendly Reminder' : isPhase2 ? 'Phase 2 — Penalty Applied' : 'Phase 3 — Final Notice';

    const greeting     = isPhase1
      ? `Your rent for <strong>${rent.collectionMonth || 'this month'}</strong> is due. Please pay at the earliest to avoid late penalties.`
      : isPhase2
      ? `Your rent for <strong>${rent.collectionMonth || 'this month'}</strong> is overdue. A late penalty has been added to your balance.`
      : `Your rent for <strong>${rent.collectionMonth || 'this month'}</strong> remains unpaid. This is a <strong>final notice</strong>. Continued non-payment may result in further action.`;

    const penaltyAmount = Math.max(0, (rent.totalDue || 0) - (rent.rentAmount || 0));
    const penaltyRow = isPhase1 ? '' : `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">Late Penalty</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#dc2626;font-weight:600;font-size:14px;text-align:right">₹${penaltyAmount || 0}</td>
        </tr>`;

    // Static warning for electricity as Rent model does not separate it
    const electricityRow = `<tr>
          <td colspan="2" style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#b45309;font-size:12px;font-weight:500;text-align:left">⚡ Electricity reading not yet submitted - bill will be updated once entered</td>
        </tr>`;

    const footerMessage = isPhase1
      ? 'Kindly clear your dues to avoid penalties.'
      : isPhase2
      ? 'Please pay immediately to prevent further penalties.'
      : 'Settle your outstanding balance now to avoid legal escalation.';

    const appBaseUrl = (process.env.APP_BASE_URL || 'https://app.roomhy.com').replace(/\/$/, '');
    const dashboardUrl = `${appBaseUrl}/tenant/tenantdashboard`;
    const onlinePayUrl = `${dashboardUrl}?pay=online`;
    const cashPayUrl = `${dashboardUrl}?pay=cash`;

    const { ownerUpiId, ownerBankName, ownerAccountHolder, ownerAccountNumber, ownerIfscCode } = ownerInfo;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    .button {
      background-color: ${headerColor};
      color: white !important;
      padding: 10px 20px;
      text-decoration: none;
      border-radius: 4px;
      display: inline-block;
      font-weight: bold;
      font-size: 13px;
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr>
          <td style="background:${headerColor};padding:28px 32px">
            <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:1px;text-transform:uppercase">ROOMHY PROPERTY MANAGEMENT</p>
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
            <p style="margin:0 0 10px;color:#111;font-size:15px">Dear <strong>${rent.tenantName || 'Tenant'}</strong>,</p>
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
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right">${rent.collectionMonth || '—'}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#555;font-size:14px">Rent Amount</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right">₹${rent.rentAmount || 0}</td>
              </tr>
              ${penaltyRow}
              ${electricityRow}
              <tr style="background:#f9fafb">
                <td style="padding:12px 14px;color:#111;font-size:15px;font-weight:700">Total Due</td>
                <td style="padding:12px 14px;color:${headerColor};font-size:16px;font-weight:700;text-align:right">₹${rent.totalDue || rent.rentAmount || 0}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Days Overdue (phases 2 & 3 only) -->
        ${!isPhase1 ? `
        <tr>
          <td style="padding:0 32px 20px">
            <p style="margin:0;background:${badgeColor};border-left:4px solid ${headerColor};padding:10px 14px;border-radius:4px;color:${badgeText};font-size:13px">
              <strong style="color:${headerColor}">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</strong> — ${footerMessage}
            </p>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:0 32px 20px">
            <p style="margin:0;background:#eff6ff;border-left:4px solid #2563eb;padding:10px 14px;border-radius:4px;color:#1e3a8a;font-size:13px">${footerMessage}</p>
          </td>
        </tr>`}

        <!-- Pay Now section -->
        ${(ownerUpiId || ownerAccountNumber) ? `
        <tr>
          <td style="padding:0 32px 24px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d1fae5;border-radius:8px;overflow:hidden;background:#f0fdf4">
              <tr>
                <td colspan="2" style="padding:10px 14px 6px;font-size:12px;font-weight:700;color:#166534;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #d1fae5">
                  ✅ Complete Your Payment
                </td>
              </tr>
              ${ownerUpiId ? `
              <tr>
                <td style="padding:10px 14px;color:#555;font-size:13px;width:140px;vertical-align:top">Pay via UPI</td>
                <td style="padding:10px 14px;font-weight:700;font-size:14px;color:#166534;font-family:monospace">${ownerUpiId}</td>
              </tr>` : ''}
              ${ownerAccountNumber ? `
              <tr style="border-top:1px solid #d1fae5">
                <td style="padding:10px 14px;color:#555;font-size:13px;vertical-align:top">Bank Transfer</td>
                <td style="padding:10px 14px;font-size:13px;color:#111;line-height:1.7">
                  ${ownerBankName ? `<strong>${ownerBankName}</strong><br>` : ''}
                  ${ownerAccountHolder ? `A/c Holder: ${ownerAccountHolder}<br>` : ''}
                  A/c No: <strong style="font-family:monospace">${ownerAccountNumber}</strong><br>
                  ${ownerIfscCode ? `IFSC: <strong style="font-family:monospace">${ownerIfscCode}</strong>` : ''}
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>` : ''}



        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#888;font-size:12px;line-height:1.6">
              This is an automated notification from <strong style="color:#333">Roomhy</strong>. Please do not reply to this email.<br>
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

// Fetch owner payment details helper
async function getOwnerPaymentDetails(ownerLoginId) {
    const info = {
        ownerUpiId: '',
        ownerBankName: '',
        ownerAccountHolder: '',
        ownerAccountNumber: '',
        ownerIfscCode: ''
    };
    if (!ownerLoginId) return info;
    try {
        if (Owner) {
            const ownerDoc = await Owner.findOne({ loginId: ownerLoginId }).lean();
            if (ownerDoc) {
                info.ownerUpiId = ownerDoc.checkinUpiId || '';
                info.ownerAccountNumber = ownerDoc.checkinBankAccountNumber || '';
                info.ownerIfscCode = ownerDoc.checkinIfscCode || '';
                info.ownerBankName = ownerDoc.checkinBankName || '';
                info.ownerAccountHolder = ownerDoc.checkinAccountHolderName || '';
            }
        }
        let CheckinRecord = null;
        try { CheckinRecord = require('../models/CheckinRecord'); } catch (_) {}
        if (CheckinRecord) {
            const checkinDoc = await CheckinRecord.findOne({ role: 'owner', loginId: ownerLoginId }).lean();
            const cp = checkinDoc?.ownerProfile?.payment || {};
            if (cp.upiId && !info.ownerUpiId) info.ownerUpiId = cp.upiId;
            if (cp.bankAccountNumber && !info.ownerAccountNumber) info.ownerAccountNumber = cp.bankAccountNumber;
            if (cp.ifscCode && !info.ownerIfscCode) info.ownerIfscCode = cp.ifscCode;
            if (cp.accountHolderName && !info.ownerAccountHolder) info.ownerAccountHolder = cp.accountHolderName;
        }
    } catch (err) {
        console.warn('Error resolving owner bank details for reminder email:', err.message);
    }
    return info;
}

// Send rent reminder email
async function sendRentReminderEmail(rent) {
    try {
        const appBaseUrl = (process.env.APP_BASE_URL || 'https://app.roomhy.com').replace(/\/$/, '');
        const dashboardUrl = `${appBaseUrl}/tenant/tenantdashboard`;
        const onlinePayUrl = `${dashboardUrl}?pay=online`;
        const cashPayUrl = `${dashboardUrl}?pay=cash`;

        const ownerInfo = await getOwnerPaymentDetails(rent.ownerLoginId);
        const html = buildRentReminderEmailHtml(rent, 1, 0, ownerInfo);

        const text = [
            `Hi ${rent.tenantName || 'Tenant'},`,
            `Rent due reminder for ${rent.propertyName || 'your property'}.`,
            `Amount: INR ${Number(rent.rentAmount || 0)}`,
            `Due: 15th of ${rent.collectionMonth || 'this month'}`,
            '',
            'Payment options:',
            `1) Online (Razorpay): ${onlinePayUrl}`,
            `2) Cash + OTP flow: ${cashPayUrl}`
        ].join('\n');

        await sendMail(
            rent.tenantEmail,
            `🔔 Rent Due Reminder - ${rent.propertyName}`,
            text,
            html
        );
        console.log('✅ Rent reminder email sent to', rent.tenantEmail);
        return true;
    } catch (err) {
        console.error('❌ Failed to send rent reminder:', err.message);
        return false;
    }
}

// Send delayed payment reminder email
async function sendDelayedReminderEmail(rent, reminderNumber = 1) {
    try {
        const urgencyLevels = ['', 'URGENT', 'VERY URGENT', 'FINAL NOTICE'];
        const urgency = urgencyLevels[reminderNumber] || 'FINAL NOTICE';
        const phase = reminderNumber === 3 ? 3 : 2;

        let daysOverdue = 0;
        let start = rent.overdueStartDate ? new Date(rent.overdueStartDate) : null;
        if (!start && rent.collectionMonth && rent.collectionMonth.includes('-')) {
            const [year, month] = rent.collectionMonth.split('-');
            start = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 15);
        }
        if (!start) {
            start = new Date();
            start.setDate(15);
        }
        start.setHours(0, 0, 0, 0);
        const diff = new Date() - start;
        if (diff > 0) {
            daysOverdue = Math.floor(diff / (1000 * 60 * 60 * 24));
        }

        const appBaseUrl = (process.env.APP_BASE_URL || 'https://app.roomhy.com').replace(/\/$/, '');
        const dashboardUrl = `${appBaseUrl}/tenant/tenantdashboard`;
        const onlinePayUrl = `${dashboardUrl}?pay=online`;
        const cashPayUrl = `${dashboardUrl}?pay=cash`;

        const ownerInfo = await getOwnerPaymentDetails(rent.ownerLoginId);
        const html = buildRentReminderEmailHtml(rent, phase, daysOverdue, ownerInfo);

        const text = [
            `${urgency} - Overdue rent payment`,
            `Property: ${rent.propertyName || '-'}`,
            `Outstanding: INR ${Number((rent.totalDue || 0) - (rent.paidAmount || 0))}`,
            `Days overdue: ${daysOverdue}`,
            '',
            `Pay online: ${onlinePayUrl}`,
            `Pay by cash: ${cashPayUrl}`
        ].join('\n');
        
        await sendMail(
            rent.tenantEmail,
            `Rent ${phase === 3 ? 'Final Notice' : 'Penalty Notice'} — ${rent.collectionMonth}`,
            text,
            html
        );
        console.log(`✅ Delayed payment reminder #${reminderNumber} sent to`, rent.tenantEmail);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send delayed reminder #${reminderNumber}:`, err.message);
        return false;
    }
}

// Export functions
module.exports = {
    startCronJobs: () => {
        initDemoOwner(); // Ensure DEMO owner is ready
        console.log('🕐 Cron jobs initialized');
        console.log('   - Demo account reset: Daily midnight');
        console.log('   - Rent reminders: Daily 10 AM (10-15th)');
        console.log('   - Delayed payment reminders: 9 AM, 2 PM, 6 PM (after 15th)');
        console.log('   - Auto reminders: Daily 10:30 AM (enabled manually per unpaid rent)');
        console.log('   - Agreement renewals: Daily 9 AM (10 and 11 month checks)');
    },
    stopCronJobs: () => {
        demoResetSchedule.stop();
        rentReminderSchedule.stop();
        delayedReminderSchedule.stop();
        autoReminderSchedule.stop();
        agreementRenewalSchedule.stop();
        console.log('🛑 Cron jobs stopped');
    }
};

