// Quick script: Update owner name
// Usage: node scripts/updateOwnerName.js <loginId> <newName>

const dns = require('dns');
if (!dns.getServers().includes('8.8.8.8')) dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');

const loginId = process.argv[2] || 'ROOMHY3869';
const newName = process.argv[3] || 'Harsh';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected');

  const Owner = require('../models/Owner');
  const User = require('../models/user');

  const owner = await Owner.findOneAndUpdate(
    { loginId },
    { $set: { name: newName, 'profile.name': newName } },
    { new: true }
  );

  if (owner) {
    console.log(`✅ Owner updated: ${owner.loginId} → name: "${owner.name}"`);
  } else {
    console.log(`❌ Owner not found: ${loginId}`);
  }

  // Also update User collection if exists
  const user = await User.findOneAndUpdate(
    { loginId },
    { $set: { name: newName } },
    { new: true }
  ).catch(() => null);

  if (user) console.log(`✅ User updated: ${user.loginId} → name: "${user.name}"`);

  await mongoose.disconnect();
  console.log('✅ Done! Refresh browser to see updated name.');
  process.exit(0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
