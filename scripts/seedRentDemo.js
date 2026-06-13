require('dotenv').config();
const mongoose = require('mongoose');
const Owner = require('../models/Owner');
const Property = require('../models/Property');
const Room = require('../models/Room');
const Tenant = require('../models/Tenant');
const Rent = require('../models/Rent');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomhy';

async function seedData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const ownerLoginId = 'ROOMHY3819';
    const owner = await Owner.findOne({ loginId: ownerLoginId });
    if (!owner) {
        console.error('Owner not found!');
        process.exit(1);
    }

    // 1. Get or Create 3 Properties
    let properties = await Property.find({ ownerLoginId });
    while (properties.length < 3) {
        const newProp = await Property.create({
            title: `Demo Property ${properties.length + 1}`,
            ownerLoginId,
            owner: owner._id,
            status: 'approved'
        });
        properties.push(newProp);
    }
    
    // We will use the first 3 properties
    properties = properties.slice(0, 3);

    const testCases = [
        {
            propIdx: 0,
            roomTitle: '101',
            baseRent: 15000,
            agreedRent: 12000, // 3000 discount
            paidAmt: 12000, // Full payment
            tenantName: 'Rahul Sharma'
        },
        {
            propIdx: 1,
            roomTitle: '201',
            baseRent: 12000,
            agreedRent: 10000, // 2000 discount
            paidAmt: 5000, // Partial payment (underpaid)
            tenantName: 'Priya Singh'
        },
        {
            propIdx: 2,
            roomTitle: '301',
            baseRent: 10000,
            agreedRent: 9000, // 1000 discount
            paidAmt: 10000, // Overpaid (paid 10000 against 9000 agreed)
            tenantName: 'Amit Kumar'
        }
    ];

    for (const tc of testCases) {
        const prop = properties[tc.propIdx];

        // 2. Create Room
        let room = await Room.findOne({ property: prop._id, title: tc.roomTitle });
        if (!room) {
            room = await Room.create({
                property: prop._id,
                title: tc.roomTitle,
                type: 'Single',
                beds: 1,
                price: tc.baseRent,
                status: 'available'
            });
        }

        // 3. Create Tenant
        // Delete existing tenant for this room to avoid duplicates
        await Tenant.deleteMany({ property: prop._id, roomNo: tc.roomTitle });
        await Rent.deleteMany({ propertyName: prop.title, roomNumber: tc.roomTitle });

        const tenant = await Tenant.create({
            name: tc.tenantName,
            phone: '999999999' + tc.propIdx,
            email: `tenant${tc.propIdx}@test.com`,
            property: prop._id,
            room: room._id,
            roomNo: tc.roomTitle,
            baseRoomRent: tc.baseRent,
            agreedRent: tc.agreedRent,
            ownerLoginId: ownerLoginId,
            propertyTitle: prop.title,
            status: 'active',
            moveInDate: new Date()
        });

        // 4. Create Rent record
        await Rent.create({
            propertyName: prop.title,
            roomNumber: tc.roomTitle,
            tenantName: tenant.name,
            tenantPhone: tenant.phone,
            tenantLoginId: tenant.loginId || `TNT${Date.now()}`,
            ownerLoginId: ownerLoginId,
            rentAmount: tc.agreedRent, // System generates rent based on agreedRent
            totalDue: tc.agreedRent,
            paidAmount: tc.paidAmt,
            paymentStatus: tc.paidAmt >= tc.agreedRent ? 'paid' : 'partially_paid',
            collectionMonth: new Date().toLocaleString('default', { month: 'short', year: 'numeric' }),
            moveInDate: new Date()
        });

        console.log(`Added Tenant: ${tc.tenantName} in ${prop.title} - Base: ${tc.baseRent}, Agreed: ${tc.agreedRent}, Paid: ${tc.paidAmt}`);
    }

    console.log('Seed completed!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedData();
