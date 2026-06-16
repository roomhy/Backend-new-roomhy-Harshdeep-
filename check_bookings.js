const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const BookingRequest = require('./models/BookingRequest');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI is missing');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    console.log('Fetching latest booking requests...');
    const bookings = await BookingRequest.find()
        .sort({ created_at: -1 })
        .limit(10)
        .lean();

    console.log(`Latest 10 booking requests:`);
    for (const b of bookings) {
        console.log(`- ID: ${b._id}`);
        console.log(`  Property Name: ${b.property_name}`);
        console.log(`  Property ID: ${b.property_id}`);
        console.log(`  User: ${b.name} (${b.email})`);
        console.log(`  Owner ID: ${b.owner_id}`);
        console.log(`  Owner Name: ${b.owner_name}`);
        console.log(`  Request Type: ${b.request_type}`);
        console.log(`  Status: ${b.status}`);
        console.log(`  Created At: ${b.created_at || b.createdAt}`);
        console.log('-----------------------------------');
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
