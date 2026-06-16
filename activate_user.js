const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const Owner = require('./models/Owner');
const Tenant = require('./models/Tenant');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI is missing');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    const emailToSearch = 'h2248370@gmail.com';

    // 1. Search in User collection
    console.log(`Searching User collection for ${emailToSearch}...`);
    const users = await User.find({ email: { $regex: new RegExp(emailToSearch, 'i') } });
    console.log(`Found ${users.length} matching user(s).`);
    for (const u of users) {
        console.log(`User ID: ${u._id}`);
        console.log(`  Name: ${u.name}`);
        console.log(`  Role: ${u.role}`);
        console.log(`  LoginId: ${u.loginId}`);
        console.log(`  isActive: ${u.isActive}`);
        console.log(`  status: ${u.status}`);
        
        if (u.isActive === false || u.status !== 'active') {
            console.log(`  --> Activating User...`);
            u.isActive = true;
            u.status = 'active';
            await u.save();
            console.log(`  --> User Activated successfully.`);
        }
    }

    // 2. Search in Owner collection
    console.log(`Searching Owner collection for ${emailToSearch}...`);
    const owners = await Owner.find({ email: { $regex: new RegExp(emailToSearch, 'i') } });
    console.log(`Found ${owners.length} matching owner(s).`);
    for (const o of owners) {
        console.log(`Owner ID: ${o._id}`);
        console.log(`  Name: ${o.name}`);
        console.log(`  LoginId: ${o.loginId}`);
        console.log(`  isActive: ${o.isActive}`);
        console.log(`  status: ${o.status}`);
        
        if (o.isActive === false || o.status !== 'active') {
            console.log(`  --> Activating Owner...`);
            o.isActive = true;
            o.status = 'active';
            await o.save();
            console.log(`  --> Owner Activated successfully.`);
        }
    }

    // 3. Search in Tenant collection
    console.log(`Searching Tenant collection for ${emailToSearch}...`);
    const tenants = await Tenant.find({ email: { $regex: new RegExp(emailToSearch, 'i') } });
    console.log(`Found ${tenants.length} matching tenant(s).`);
    for (const t of tenants) {
        console.log(`Tenant ID: ${t._id}`);
        console.log(`  Name: ${t.name}`);
        console.log(`  LoginId: ${t.loginId}`);
        console.log(`  status: ${t.status}`);
        
        if (t.status !== 'active') {
            console.log(`  --> Activating Tenant...`);
            t.status = 'active';
            await t.save();
            console.log(`  --> Tenant Activated successfully.`);
        }
    }

    console.log('Done.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
