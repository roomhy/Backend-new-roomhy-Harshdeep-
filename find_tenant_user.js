const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const Tenant = require('./models/Tenant');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    const loginId = 'ROOMHYTNT8004';
    const user = await User.findOne({ loginId });
    const tenant = await Tenant.findOne({ loginId });

    console.log('--- User collection for ROOMHYTNT8004 ---');
    console.log(user);

    console.log('--- Tenant collection for ROOMHYTNT8004 ---');
    console.log(tenant);

    await mongoose.disconnect();
}

main().catch(console.error);
