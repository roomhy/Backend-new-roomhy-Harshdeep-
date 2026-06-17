const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const { evaluateInvoice } = require('./services/invoiceService');
const { queueNotificationsForInvoice } = require('./jobs/dailyRentEvaluator');
const { releaseLock } = require('./services/cronLockService');
const Tenant = require('./models/Tenant');
const Rent = require('./models/Rent');
const RentInvoice = require('./models/RentInvoice');
const Property = require('./models/Property');
const Owner = require('./models/Owner');
const User = require('./models/user');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    const email = 'harshdeepbca503@gmail.com';
    const ownerLoginId = 'ROOMHY9999';

    // 1. Clean up old test records to avoid conflicts
    console.log('Cleaning up old test records for email:', email);
    await Tenant.deleteMany({ email });
    await Rent.deleteMany({ tenantEmail: email });
    await RentInvoice.deleteMany({ tenantEmail: email });

    // Ensure Owner User
    let ownerUser = await User.findOne({ loginId: ownerLoginId });
    if (!ownerUser) {
        ownerUser = await User.create({
            loginId: ownerLoginId,
            name: 'Harsh',
            email: 'owner9999@roomhy.com',
            phone: '9876543210',
            password: 'ownerpassword123',
            role: 'owner',
            isActive: true
        });
    }

    // Ensure Property
    let property = await Property.findOne({ ownerLoginId });
    if (!property) {
        property = await Property.create({
            ownerLoginId,
            title: 'Roomhy Premium PG - 1',
            address: 'Sector 62, Noida',
            city: 'Noida'
        });
    }

    // Ensure Owner profile with bank details from SS 2
    let owner = await Owner.findOne({ loginId: ownerLoginId });
    if (!owner) {
        owner = await Owner.create({
            loginId: ownerLoginId,
            name: 'Harsh',
            email: 'owner9999@roomhy.com',
            phone: '9876543210',
            checkinUpiId: '453653634654',
            checkinBankAccountNumber: '4565475475647',
            checkinIfscCode: '474764',
            checkinBankName: 'zseferf',
            checkinAccountHolderName: 'Harsh',
            isActive: true
        });
    } else {
        owner.checkinUpiId = '453653634654';
        owner.checkinBankAccountNumber = '4565475475647';
        owner.checkinIfscCode = '474764';
        owner.checkinBankName = 'zseferf';
        owner.checkinAccountHolderName = 'Harsh';
        await owner.save();
    }

    // Create fresh Tenant
    const tenant = await Tenant.create({
        name: 'Aarav Sharma',
        email,
        phone: '919464165010',
        ownerLoginId,
        property: property._id,
        room: new mongoose.Types.ObjectId(),
        roomNo: 'Room 2',
        status: 'active',
        agreedRent: 7500,
        assignedBy: ownerUser._id
    });
    console.log('✅ Seeded Tenant:', tenant.name);

    // Create fresh Rent
    const lastMonth = '2026-05';
    await Rent.create({
        propertyId: property._id,
        propertyName: property.title,
        ownerLoginId,
        tenantId: tenant._id,
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        tenantPhone: tenant.phone,
        roomNumber: 'Room 2',
        rentAmount: 7500,
        totalDue: 7500,
        paidAmount: 0,
        collectionMonth: lastMonth,
        paymentStatus: 'pending',
        overdueStartDate: new Date(new Date().setDate(new Date().getDate() - 15)),
        reminders: []
    });
    console.log('✅ Seeded Rent record.');

    // Create fresh RentInvoice
    const billingMonth = '2026-06';
    const dueDate = new Date('2026-06-02T00:00:00Z');
    const invoiceNumber = `INV-${billingMonth}-${String(tenant._id).slice(-6)}-TEST`;

    const invoice = await RentInvoice.create({
        invoiceNumber,
        ownerId: ownerUser._id,
        propertyId: property._id,
        tenantId: tenant._id,
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        tenantPhone: tenant.phone,
        billingMonth,
        rentAmount: 7500,
        dueDate,
        electricityBill: 289,
        electricityUnitsConsumed: 34,
        electricityPrevReading: 100,
        electricityCurrReading: 134,
        electricityReadingAdded: true,
        minorPenaltyAmount: 0,
        majorPenaltyAmount: 0,
        totalPenalty: 0,
        totalDue: 7789,
        outstandingAmount: 7789,
        paidAmount: 0,
        currentPhase: 3,
        daysSinceDue: 15,
        status: 'PENDING'
    });
    console.log('✅ Seeded RentInvoice:', invoice.invoiceNumber);

    // 2. Release cron job lock
    console.log('Releasing cron locks...');
    await releaseLock('dailyRentEvaluator');

    // 3. Run the daily evaluator logic ONLY for this invoice
    console.log('Running daily evaluator logic for invoice:', invoice.invoiceNumber);
    
    // Evaluate
    const { updates, penalties, config } = await evaluateInvoice(invoice);
    console.log('Evaluated updates:', JSON.stringify(updates, null, 2));

    // Save updates
    await RentInvoice.updateOne({ _id: invoice._id }, { $set: updates });
    
    // Send notifications
    console.log('Queueing and sending email notification...');
    const stats = await queueNotificationsForInvoice(invoice, penalties, config);
    console.log('Notification Stats:', JSON.stringify(stats, null, 2));

    console.log('✅ Execution completed.');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error during manual run:', err);
    process.exit(1);
});
