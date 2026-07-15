const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./models/Tenant');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // Fetch all active tenants
    const tenants = await Tenant.find({ isDeleted: { $ne: true } }).lean();
    console.log('--- ACTIVE TENANTS ---');
    console.log(JSON.stringify(tenants.map(t => ({
        name: t.name,
        loginId: t.loginId,
        email: t.email,
        phone: t.phone,
        password: t.password || t.checkinPassword || 'password123',
        status: t.status,
        ownerLoginId: t.ownerLoginId
    })), null, 2));

    await mongoose.disconnect();
}

main().catch(console.error);
