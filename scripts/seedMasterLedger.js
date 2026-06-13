/**
 * Master Financial Ledger & Multi-role Seed Script
 * Run: node scripts/seedMasterLedger.js
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/roomhy';

const User = require('../models/user');
const Owner = require('../models/Owner');
const Property = require('../models/Property');
const Room = require('../models/Room');
const Tenant = require('../models/Tenant');
const Rent = require('../models/Rent');
const RentInvoice = require('../models/RentInvoice');
const RentPayment = require('../models/RentPayment');
const PaymentTransaction = require('../models/PaymentTransaction');
const SystemSettings = require('../models/SystemSettings');
const Employee = require('../models/Employee');

const OWNER_LOGIN_ID = 'ROOMHY3869';
const OWNER_PASSWORD = '123456';
const OWNER_NAME = 'Harsh';
const OWNER_EMAIL = 'harshdeep@roomhy.com';
const OWNER_PHONE = '9876543210';
const PROPERTY_TITLE = 'Mangoapp PG';
const LOCATION_CODE = 'RHY';

async function seed() {
  try {
    console.log('🔌 Connecting to MongoDB...', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. System Settings Setup
    console.log('⚙️ Setting up global commission configuration...');
    await SystemSettings.deleteMany({});
    await SystemSettings.create({
      commission_percentage: 10,
      updated_by: 'superadmin'
    });

    // 2. Superadmin Account Setup
    console.log('👤 Setting up Superadmin user...');
    await User.deleteMany({ role: 'superadmin' });
    const superAdmin = new User({
      name: 'Super Admin',
      email: 'roomhyadmin@gmail.com',
      phone: '9999999999',
      password: 'admin@123',
      role: 'superadmin',
      loginId: 'roomhyadmin@gmail.com',
      status: 'active',
      isActive: true,
      isDeleted: false
    });
    await superAdmin.save();

    // 3. Employee Account Setup
    console.log('👥 Setting up Employee (Manager) account...');
    await Employee.deleteMany({});
    await Employee.create({
      name: 'Demo Employee',
      loginId: 'roomhyemployee@gmail.com',
      email: 'roomhyemployee@gmail.com',
      phone: '9876543211',
      password: 'employee@123',
      role: 'manager',
      isActive: true,
      isDeleted: false
    });

    // 4. Owner Account Setup
    console.log('🏢 Setting up Owner account...');
    await User.deleteMany({ loginId: OWNER_LOGIN_ID });
    const ownerUser = new User({
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      phone: OWNER_PHONE,
      password: OWNER_PASSWORD,
      role: 'owner',
      loginId: OWNER_LOGIN_ID,
      locationCode: LOCATION_CODE,
      status: 'active',
      isActive: true
    });
    await ownerUser.save();

    await Owner.deleteMany({ loginId: OWNER_LOGIN_ID });
    const hashedPwd = await bcrypt.hash(OWNER_PASSWORD, 10);
    const ownerProfile = await Owner.create({
      loginId: OWNER_LOGIN_ID,
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      phone: OWNER_PHONE,
      address: 'Sector 14, Gurgaon',
      locationCode: LOCATION_CODE,
      profile: {
        name: OWNER_NAME,
        email: OWNER_EMAIL,
        phone: OWNER_PHONE,
        address: 'Sector 14, Gurgaon',
        city: 'Gurgaon',
        bankName: 'HDFC Bank',
        accountNumber: '50100123456789',
        ifscCode: 'HDFC0001234',
        branchName: 'Gurgaon Main'
      },
      credentials: { password: hashedPwd, firstTime: false },
      checkinUpiId: 'harshdeep@upi',
      kyc: { status: 'verified' },
      isActive: true,
      roomCount: 8,
      bedCount: 16,
      vacantRooms: 2,
      occupiedRooms: 6
    });

    // 5. Property and Rooms
    console.log('🏠 Setting up Property and Rooms...');
    await Property.deleteMany({ ownerLoginId: OWNER_LOGIN_ID });
    const property = await Property.create({
      title: PROPERTY_TITLE,
      ownerLoginId: OWNER_LOGIN_ID,
      owner: ownerProfile._id,
      locationCode: LOCATION_CODE,
      address: 'Sector 14, Gurgaon, Haryana',
      city: 'Gurgaon',
      area: 'Sector 14',
      propertyType: 'pg',
      gender: 'co-ed',
      status: 'active',
      totalRooms: 8,
      totalBeds: 16,
      description: 'Premium PG with all amenities'
    });

    const roomDefs = [
      { title: '101', type: 'Single', beds: 1, rent: 12000, gender: 'male' },
      { title: '102', type: 'Double', beds: 2, rent: 9000, gender: 'male' },
      { title: '201', type: 'Single', beds: 1, rent: 13000, gender: 'female' },
      { title: '202', type: 'Double', beds: 2, rent: 10000, gender: 'co-ed' }
    ];

    await Room.deleteMany({ property: property._id });
    const rooms = {};
    for (const rd of roomDefs) {
      rooms[rd.title] = await Room.create({ ...rd, property: property._id, status: 'available' });
    }

    // 6. Tenants
    console.log('👥 Creating Tenants...');
    await Tenant.deleteMany({ ownerLoginId: OWNER_LOGIN_ID });
    
    const tenantDefs = [
      { name: 'Arjun Mehta', phone: '9811001001', email: 'arjun@gmail.com', gender: 'Male', roomNo: '101', rent: 12000 },
      { name: 'Sneha Patel', phone: '9811001002', email: 'sneha@gmail.com', gender: 'Female', roomNo: '201', rent: 13000 },
      { name: 'Rahul Gupta', phone: '9811001003', email: 'rahul@gmail.com', gender: 'Male', roomNo: '102', rent: 9000 }
    ];

    const tenants = [];
    let idx = 1;
    for (const td of tenantDefs) {
      const loginId = `ROOMHYTNT${3800 + idx}`;
      
      // Tenant User
      await User.deleteMany({ loginId });
      const tUser = await User.create({
        name: td.name,
        email: td.email,
        phone: td.phone,
        password: 'Tenant@123',
        role: 'tenant',
        loginId,
        locationCode: LOCATION_CODE,
        status: 'active',
        isActive: true
      });

      const roomObj = rooms[td.roomNo];
      const tenant = await Tenant.create({
        name: td.name,
        phone: td.phone,
        email: td.email,
        gender: td.gender,
        property: property._id,
        room: roomObj._id,
        roomNo: td.roomNo,
        bedNo: '1',
        moveInDate: new Date('2026-03-01'),
        agreedRent: td.rent,
        rentAgreementType: 'monthly',
        loginId,
        ownerLoginId: OWNER_LOGIN_ID,
        propertyTitle: PROPERTY_TITLE,
        securityDepositTotal: td.rent * 2,
        securityDepositPaid: td.rent * 2,
        securityDepositBalance: 0,
        user: tUser._id,
        kycStatus: 'verified',
        status: 'active'
      });
      tenants.push(tenant);
      idx++;
    }

    // 7. Clear old financial records
    console.log('🧹 Clearing old invoices, payments and transactions...');
    await Rent.deleteMany({ ownerLoginId: OWNER_LOGIN_ID });
    await RentInvoice.deleteMany({ ownerId: ownerProfile._id });
    await RentPayment.deleteMany({ ownerId: ownerProfile._id });
    await PaymentTransaction.deleteMany({});

    // 8. Generate Rent, Invoices, Payments, and Superadmin PaymentTransactions
    console.log('💰 Seeding Ledger History (April & May 2026)...');

    const ledgerMonths = [
      { monthStr: '2026-04', desc: 'April 2026' },
      { monthStr: '2026-05', desc: 'May 2026' }
    ];

    let txCounter = 1000;

    for (const lm of ledgerMonths) {
      for (const t of tenants) {
        // Create Rent summary record
        await Rent.create({
          propertyId: property._id,
          propertyName: PROPERTY_TITLE,
          ownerLoginId: OWNER_LOGIN_ID,
          tenantId: t._id,
          tenantLoginId: t.loginId,
          tenantName: t.name,
          tenantEmail: t.email,
          tenantPhone: t.phone,
          roomNumber: t.roomNo,
          rentAmount: t.agreedRent,
          totalDue: t.agreedRent + 200, // + electricity/maintenance
          collectionMonth: lm.monthStr,
          paymentStatus: lm.monthStr === '2026-04' ? 'paid' : 'pending',
          paidAmount: lm.monthStr === '2026-04' ? t.agreedRent + 200 : 0,
          moveInDate: t.moveInDate,
          dueDate: new Date(`${lm.monthStr}-10`)
        });

        // Create detailed Invoice
        const invoice = await RentInvoice.create({
          invoiceNumber: `INV-${lm.monthStr.replace('-', '')}-${t.roomNo}`,
          ownerId: ownerProfile._id,
          propertyId: property._id,
          tenantId: t._id,
          tenantName: t.name,
          tenantEmail: t.email,
          tenantPhone: t.phone,
          billingMonth: lm.monthStr,
          dueDate: new Date(`${lm.monthStr}-10`),
          rentAmount: t.agreedRent,
          electricityBill: 150,
          maintenanceCharge: 50,
          totalDue: t.agreedRent + 200,
          outstandingAmount: lm.monthStr === '2026-04' ? 0 : t.agreedRent + 200,
          status: lm.monthStr === '2026-04' ? 'PAID' : 'PENDING',
          currentPhase: 1,
          createdAt: new Date(`${lm.monthStr}-01`)
        });

        // If April, seed successful payment & payout
        if (lm.monthStr === '2026-04') {
          txCounter++;
          const payId = `pay_RHY${txCounter}`;
          const amt = t.agreedRent + 200;

          // Record payment for owner
          const payment = await RentPayment.create({
            ownerId: ownerProfile._id,
            tenantId: t._id,
            invoiceId: invoice._id,
            amount: amt,
            paymentMethod: 'razorpay',
            transactionId: payId,
            paymentDate: new Date(`2026-04-09T14:30:00Z`),
            isPartial: false,
            remainingAfter: 0,
            notes: 'Auto-seeded April Rent payment via Razorpay'
          });

          // Create platform PaymentTransaction with "Paid" payout status (Already settled to owner)
          await PaymentTransaction.create({
            razorpay_payment_id: payId,
            razorpay_order_id: `order_RPY${txCounter}`,
            razorpay_signature: `sig_RPY${txCounter}`,
            booking_id: invoice._id.toString(),
            property_id: property._id.toString(),
            property_name: PROPERTY_TITLE,
            tenant_id: t._id.toString(),
            tenant_name: t.name,
            owner_id: OWNER_LOGIN_ID,
            owner_name: OWNER_NAME,
            booking_amount: amt,
            commission_percentage: 10,
            commission_amount: amt * 0.10,
            owner_amount: amt * 0.90,
            payout_status: 'Paid',
            payout_reference: `PAY_SETTLED_${txCounter}`,
            payout_date: new Date(`2026-04-12T10:00:00Z`),
            payout_initiated_by: 'superadmin',
            payout_account_holder: ownerProfile.profile.accountHolderName || OWNER_NAME,
            payout_account_number: ownerProfile.profile.accountNumber,
            payout_ifsc_code: ownerProfile.profile.ifscCode,
            payout_bank_name: ownerProfile.profile.bankName,
            payment_method: 'razorpay',
            payment_date: new Date(`2026-04-09T14:30:00Z`),
            notes: 'April Rent Collection Settlement Complete'
          });
        }

        // If May, seed successful payment, but leave payout "Pending" (So Superadmin can payout to owner)
        if (lm.monthStr === '2026-05') {
          txCounter++;
          const payId = `pay_RHY${txCounter}`;
          const amt = t.agreedRent + 200;

          // Update rent invoice to show it was paid in mid May
          invoice.status = 'PAID';
          invoice.outstandingAmount = 0;
          await invoice.save();

          // Update Rent summary
          await Rent.findOneAndUpdate(
            { tenantLoginId: t.loginId, collectionMonth: lm.monthStr },
            { paymentStatus: 'paid', paidAmount: amt }
          );

          // Record payment for owner
          await RentPayment.create({
            ownerId: ownerProfile._id,
            tenantId: t._id,
            invoiceId: invoice._id,
            amount: amt,
            paymentMethod: 'razorpay',
            transactionId: payId,
            paymentDate: new Date(`2026-05-11T16:20:00Z`),
            isPartial: false,
            remainingAfter: 0,
            notes: 'Auto-seeded May Rent payment via Razorpay'
          });

          // Create platform PaymentTransaction with "Pending" payout status (Needs to be clicked in Admin)
          await PaymentTransaction.create({
            razorpay_payment_id: payId,
            razorpay_order_id: `order_RPY${txCounter}`,
            razorpay_signature: `sig_RPY${txCounter}`,
            booking_id: invoice._id.toString(),
            property_id: property._id.toString(),
            property_name: PROPERTY_TITLE,
            tenant_id: t._id.toString(),
            tenant_name: t.name,
            owner_id: OWNER_LOGIN_ID,
            owner_name: OWNER_NAME,
            booking_amount: amt,
            commission_percentage: 10,
            commission_amount: amt * 0.10,
            owner_amount: amt * 0.90,
            payout_status: 'Pending',
            payment_method: 'razorpay',
            payment_date: new Date(`2026-05-11T16:20:00Z`),
            notes: 'May Rent Collection Received. Awaiting Settlement Disbursement.'
          });
        }
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🎉 SEED SUCCESSFUL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Role       | Username/Login ID       | Password');
    console.log('  -----------+-------------------------+----------');
    console.log('  Superadmin | roomhyadmin@gmail.com   | admin@123');
    console.log('  Employee   | roomhyemployee@gmail.com| employee@123');
    console.log('  Owner      | ROOMHY3869              | 123456');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
