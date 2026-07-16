const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');

async function fixDemoAccount() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI missing in .env');
        process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    const demoLoginId = 'ROOMHY0000';

    // ─── 1. Fix Owner collection ──────────────────────────────────────────────
    const ownerCol = mongoose.connection.collection('owners');
    const ownerDoc = await ownerCol.findOne({ loginId: demoLoginId });

    if (!ownerDoc) {
        console.log('⚠️  Owner doc NOT found — creating fresh...');
        await ownerCol.insertOne({
            loginId: demoLoginId,
            name: 'Demo Owner',
            email: 'demo@roomhy.com',
            phone: '0000000000',
            isActive: true,
            isDeleted: false,
            credentials: { password: 'demo123', firstTime: false },
            roomCount: 0,
            bedCount: 0,
            vacantRooms: 0,
            vacantBeds: 0,
            occupiedRooms: 0,
            occupiedBeds: 0,
            roomInventory: [],
            walletBalance: 0,
            pendingBalance: 0,
            withdrawnBalance: 0,
            createdAt: new Date()
        });
        console.log('✅ Owner doc created!');
    } else {
        console.log('📋 Owner doc found:');
        console.log(`   isActive   : ${ownerDoc.isActive}`);
        console.log(`   isDeleted  : ${ownerDoc.isDeleted}`);
        console.log(`   credentials: ${JSON.stringify(ownerDoc.credentials)}`);

        const ownerUpdate = {
            isActive: true,
            isDeleted: false,
        };

        // Restore credentials if missing/broken
        if (!ownerDoc.credentials || !ownerDoc.credentials.password) {
            ownerUpdate.credentials = { password: 'demo123', firstTime: false };
            console.log('   ⚠️  Credentials missing — restoring...');
        }

        await ownerCol.updateOne(
            { loginId: demoLoginId },
            { $set: ownerUpdate }
        );
        console.log('✅ Owner doc fixed → isActive: true, isDeleted: false');
    }

    // ─── 2. Fix User (auth) collection ───────────────────────────────────────
    const userCol = mongoose.connection.collection('users');
    const userDoc = await userCol.findOne({ loginId: demoLoginId });

    if (!userDoc) {
        console.log('\n⚠️  User auth doc NOT found — creating fresh...');
        // NOTE: password will be plain here since no pre-save hook runs in raw collection
        // We create via mongoose model so the hash runs
        const User = require('./models/user');
        await User.create({
            loginId: demoLoginId,
            name: 'Demo Owner',
            email: 'demo@roomhy.com',
            phone: '0000000000',
            password: 'demo123',
            role: 'owner',
            isActive: true,
            status: 'active',
            isDeleted: false,
            requirePasswordReset: false
        });
        console.log('✅ User auth doc created with hashed password!');
    } else {
        console.log('\n📋 User auth doc found:');
        console.log(`   isActive           : ${userDoc.isActive}`);
        console.log(`   status             : ${userDoc.status}`);
        console.log(`   isDeleted          : ${userDoc.isDeleted}`);
        console.log(`   requirePasswordReset: ${userDoc.requirePasswordReset}`);
        console.log(`   role               : ${userDoc.role}`);

        await userCol.updateOne(
            { loginId: demoLoginId },
            {
                $set: {
                    isActive: true,
                    status: 'active',
                    isDeleted: false,
                    requirePasswordReset: false,
                    role: 'owner'
                }
            }
        );
        console.log('✅ User auth doc fixed → isActive: true, status: active');
    }

    // ─── 3. Final verification ────────────────────────────────────────────────
    console.log('\n🔍 Final verification:');
    const finalOwner = await ownerCol.findOne({ loginId: demoLoginId });
    const finalUser = await userCol.findOne({ loginId: demoLoginId });

    console.log(`\nOwner [${demoLoginId}]:`);
    console.log(`  isActive  : ${finalOwner?.isActive}`);
    console.log(`  isDeleted : ${finalOwner?.isDeleted}`);
    console.log(`  credentials exists: ${!!(finalOwner?.credentials?.password)}`);

    console.log(`\nUser [${demoLoginId}]:`);
    console.log(`  isActive  : ${finalUser?.isActive}`);
    console.log(`  status    : ${finalUser?.status}`);
    console.log(`  role      : ${finalUser?.role}`);
    console.log(`  isDeleted : ${finalUser?.isDeleted}`);

    if (finalOwner?.isActive && finalUser?.isActive && finalUser?.status === 'active') {
        console.log('\n🎉 SUCCESS! ROOMHY0000 demo account is LIVE and ready!');
        console.log('   Login ID : ROOMHY0000');
        console.log('   Password : demo123');
    } else {
        console.log('\n❌ Something still looks off — check logs above.');
    }

    await mongoose.disconnect();
    process.exit(0);
}

fixDemoAccount().catch(err => {
    console.error('💥 Script crashed:', err);
    process.exit(1);
});
