const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const Employee = require('./models/Employee');
const Owner = require('./models/Owner');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    const users = await User.find({ loginId: /9999/i });
    console.log('--- USERS ---');
    console.log(users);

    const employees = await Employee.find({ $or: [{ loginId: /9999/i }, { parentLoginId: /9999/i }] });
    console.log('--- EMPLOYEES ---');
    console.log(employees);

    const owners = await Owner.find({ loginId: /9999/i });
    console.log('--- OWNERS ---');
    console.log(owners);
    
    await mongoose.disconnect();
}

main().catch(console.error);
