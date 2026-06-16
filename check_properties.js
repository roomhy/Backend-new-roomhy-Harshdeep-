const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const ApprovedProperty = require('./models/ApprovedProperty');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI is missing');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    console.log('Fetching approved properties...');
    const properties = await ApprovedProperty.find({
        status: { $in: ['approved', 'live'] }
    }).lean();

    console.log(`Found ${properties.length} approved/live properties:`);
    for (const prop of properties) {
        console.log(`- ID: ${prop._id}`);
        console.log(`  Name: ${prop.propertyInfo?.name}`);
        console.log(`  VisitId: ${prop.visitId}`);
        console.log(`  ownerLoginId (field): ${prop.ownerLoginId}`);
        console.log(`  generatedCredentials:`, prop.generatedCredentials);
        console.log(`  isLiveOnWebsite: ${prop.isLiveOnWebsite}`);
        console.log('-----------------------------------');
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
