const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const mongoose = require('mongoose');
require('dotenv').config();
const Tenant = require('./models/Tenant');
const Rent = require('./models/Rent');
const RentInvoice = require('./models/RentInvoice');
const Owner = require('./models/Owner');
const User = require('./models/user');
const Property = require('./models/Property');

async function check() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const email = 'harshdeepbca503@gmail.com';
  const ownerLoginId = 'ROOMHY9999';

  console.log('\n--- Users ---');
  const users = await User.find({ $or: [{ email }, { loginId: ownerLoginId }] }).lean();
  console.log(JSON.stringify(users, null, 2));

  console.log('\n--- Owners ---');
  const owners = await Owner.find({ loginId: ownerLoginId }).lean();
  console.log(JSON.stringify(owners, null, 2));

  console.log('\n--- Tenants ---');
  const tenants = await Tenant.find({ email }).lean();
  console.log(JSON.stringify(tenants, null, 2));

  console.log('\n--- Rents ---');
  const rents = await Rent.find({ $or: [{ tenantEmail: email }, { ownerLoginId }] }).lean();
  console.log(JSON.stringify(rents, null, 2));

  console.log('\n--- RentInvoices ---');
  const invoices = await RentInvoice.find({ $or: [{ tenantEmail: email }, { ownerId: { $in: users.map(u => u._id) } }] }).lean();
  console.log(JSON.stringify(invoices, null, 2));

  await mongoose.disconnect();
}

check().catch(console.error);
