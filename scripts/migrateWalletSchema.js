/**
 * Database Migration Script - Wallet Schema
 * Updates existing owners and system settings with balance fields.
 * Run: node scripts/migrateWalletSchema.js
 */
require('dotenv').config();
const dns = require('dns');
// Set public DNS to resolve MongoDB Atlas SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found in .env");
  process.exit(1);
}

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully for migration");

    const Owner = require('../models/Owner');
    const SystemSettings = require('../models/SystemSettings');

    // 1. Backfill Owner wallets
    const ownersCount = await Owner.countDocuments();
    console.log(`🔍 Found ${ownersCount} Owner documents to migrate.`);

    const ownerRes = await Owner.updateMany(
      {
        $or: [
          { walletBalance: { $exists: false } },
          { pendingBalance: { $exists: false } },
          { withdrawnBalance: { $exists: false } }
        ]
      },
      {
        $set: {
          walletBalance: 0,
          pendingBalance: 0,
          withdrawnBalance: 0
        }
      }
    );
    console.log(`✅ Backfilled ${ownerRes.modifiedCount} Owner documents with wallet balances.`);

    // 2. Backfill SystemSettings
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings({
        commission_percentage: 10,
        revenueBalance: 0,
        updated_by: 'migration'
      });
      await settings.save();
      console.log("✅ Created new SystemSettings with revenueBalance initialized to 0.");
    } else {
      const settingsRes = await SystemSettings.updateMany(
        { revenueBalance: { $exists: false } },
        { $set: { revenueBalance: 0 } }
      );
      console.log(`✅ Updated ${settingsRes.modifiedCount} SystemSettings with revenueBalance.`);
    }

    console.log("🎉 Wallet schema migration completed successfully!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during migration:", err);
    process.exit(1);
  }
}

main();
