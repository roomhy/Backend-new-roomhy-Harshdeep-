const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./models/Tenant');
const Rent = require('./models/Rent');
const RentInvoice = require('./models/RentInvoice');
const Property = require('./models/Property');
const Owner = require('./models/Owner');
const User = require('./models/user');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI is missing');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    const ownerLoginId = 'ROOMHY9999';

    // 1. Ensure User model exists for ROOMHY9999
    let ownerUser = await User.findOne({ loginId: ownerLoginId });
    if (!ownerUser) {
        ownerUser = await User.create({
            loginId: ownerLoginId,
            name: 'Harsh',
            email: 'owner9999@roomhy.com',
            phone: '9876543210',
            password: 'ownerpassword123', // Will be hashed automatically by pre-save hook
            role: 'owner',
            isActive: true
        });
        console.log('✅ Created Owner User:', ownerUser._id);
    } else {
        console.log('✅ Found existing Owner User:', ownerUser._id);
    }

    // 2. Ensure Property exists
    let property = await Property.findOne({ ownerLoginId });
    if (!property) {
        property = await Property.create({
            ownerLoginId,
            title: 'Roomhy Premium PG - 1',
            address: 'Sector 62, Noida',
            city: 'Noida'
        });
        console.log('✅ Created mock Property:', property._id);
    } else {
        console.log('✅ Found existing Property:', property._id);
    }

    // 3. Ensure Owner exists with bank details from SS 2
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
        console.log('✅ Created mock Owner:', owner.loginId);
    } else {
        // Update bank details to ensure they match SS 2
        owner.checkinUpiId = '453653634654';
        owner.checkinBankAccountNumber = '4565475475647';
        owner.checkinIfscCode = '474764';
        owner.checkinBankName = 'zseferf';
        owner.checkinAccountHolderName = 'Harsh';
        await owner.save();
        console.log('✅ Updated existing Owner bank details:', owner.loginId);
    }

    // 4. Create/Update Tenant
    const email = 'harshdeepbca503@gmail.com';
    let tenant = await Tenant.findOne({ email });
    if (!tenant) {
        tenant = await Tenant.create({
            name: 'Aarav Sharma',
            email,
            phone: '919464165010',
            ownerLoginId,
            property: property._id,
            room: new mongoose.Types.ObjectId(), // Create a mock room ObjectId
            roomNo: 'Room 2',
            status: 'active',
            agreedRent: 7500,
            assignedBy: ownerUser._id
        });
        console.log('✅ Created Tenant:', tenant._id);
    } else {
        tenant.name = 'Aarav Sharma';
        tenant.ownerLoginId = ownerLoginId;
        tenant.property = property._id;
        tenant.roomNo = 'Room 2';
        tenant.status = 'active';
        tenant.agreedRent = 7500;
        tenant.assignedBy = ownerUser._id;
        await tenant.save();
        console.log('✅ Updated Tenant:', tenant._id);
    }

    // 5. Create Rent record for the previous month (for compatibility/backup)
    const billingMonth = '2026-06';
    const lastMonth = '2026-05';
    console.log(`Setting up rent record for billing month: ${lastMonth}`);

    let rent = await Rent.findOne({ tenantId: tenant._id, collectionMonth: lastMonth });
    if (rent) {
        await Rent.deleteOne({ _id: rent._id });
        console.log('🗑️ Deleted old rent record.');
    }

    rent = await Rent.create({
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
        overdueStartDate: new Date(new Date().setDate(new Date().getDate() - 15)), // 15 days overdue
        reminders: []
    });
    console.log('✅ Created Rent record:', rent._id);

    // 6. Create RentInvoice record (for the new system tested in dailyRentEvaluator)
    console.log(`Setting up RentInvoice record for billing month: ${billingMonth}`);
    let invoice = await RentInvoice.findOne({ tenantId: tenant._id, billingMonth });
    if (invoice) {
        await RentInvoice.deleteOne({ _id: invoice._id });
        console.log('🗑️ Deleted old RentInvoice record.');
    }

    const dueDate = new Date('2026-06-02T00:00:00Z'); // 15 days ago from June 17, 2026
    const invoiceNumber = `INV-${billingMonth}-${String(tenant._id).slice(-6)}-TEST`;

    invoice = await RentInvoice.create({
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
    console.log('✅ Created RentInvoice record:', invoice._id);

    await mongoose.disconnect();
    console.log('✅ Seeding Done.');
    process.exit(0);
}

main().catch(err => {
    console.error('Error during seeding:', err);
    process.exit(1);
});
