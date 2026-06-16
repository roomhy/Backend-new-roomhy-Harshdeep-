const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const ApprovedProperty = require('./models/ApprovedProperty');
const Property = require('./models/Property');
const Owner = require('./models/Owner');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    console.log('Searching Owner document for ROOMHY9999...');
    const ownerDoc = await Owner.findOne({ loginId: 'ROOMHY9999' }).lean();
    console.log('Owner Doc:', ownerDoc);

    console.log('Searching in ApprovedProperty by generatedCredentials.loginId: ROOMHY9999 or ROOMHY3819 ...');
    const approvedProps = await ApprovedProperty.find({
        $or: [
            { 'generatedCredentials.loginId': { $in: ['ROOMHY9999', 'ROOMHY3819'] } },
            { ownerLoginId: { $in: ['ROOMHY9999', 'ROOMHY3819'] } }
        ]
    }).lean();

    console.log(`Found ${approvedProps.length} properties in ApprovedProperty:`);
    approvedProps.forEach(p => {
        console.log(`- ID: ${p._id}, visitId: ${p.visitId}, Name: ${p.propertyInfo?.name}, ownerLoginId: ${p.ownerLoginId || p.generatedCredentials?.loginId}`);
    });

    console.log('\nSearching in Property by ownerLoginId: ROOMHY9999 or owner ObjectId...');
    const queryConditions = [{ ownerLoginId: 'ROOMHY9999' }];
    if (ownerDoc) {
        queryConditions.push({ owner: ownerDoc._id });
    }
    const props = await Property.find({ $or: queryConditions }).lean();

    console.log(`Found ${props.length} properties in Property:`);
    props.forEach(p => {
        console.log(JSON.stringify(p, null, 2));
    });

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
