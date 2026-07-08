const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const jwt = require('jsonwebtoken');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    const ownerUser = await User.findOne({ loginId: 'ROOMHY9999' });
    if (!ownerUser) {
        console.error('Owner user not found!');
        process.exit(1);
    }

    const token = jwt.sign({ id: ownerUser._id, role: ownerUser.role }, process.env.JWT_SECRET);
    console.log('Generated token:', token);

    // Now make a real HTTP request to the running backend local server (PORT 5001)
    const PORT = process.env.PORT || 5001;
    const url = `http://localhost:${PORT}/api/employees`;
    console.log(`Sending POST to ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: 'Test Warden 2',
                loginId: 'STAFF0009',
                phone: '9876543210',
                email: 'testwarden2@example.com',
                password: 'password123',
                role: 'Warden',
                parentLoginId: 'ROOMHY9999'
            })
        });

        console.log('HTTP Status:', response.status, response.statusText);
        const text = await response.text();
        console.log('HTTP Response Body:', text);

        if (response.status === 201) {
            const empData = JSON.parse(text);
            const employeeId = empData.data._id;

            // 2. Test Salary Endpoint
            const salaryUrl = `http://localhost:${PORT}/api/hr/salaries`;
            console.log(`Sending POST to ${salaryUrl}...`);
            const salaryResponse = await fetch(salaryUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    employeeId,
                    ownerLoginId: 'ROOMHY9999',
                    month: new Date().toLocaleString("default", { month: "long", year: "numeric" }),
                    baseSalary: 30000,
                    status: 'Pending'
                })
            });
            console.log('Salary HTTP Status:', salaryResponse.status, salaryResponse.statusText);
            console.log('Salary HTTP Response Body:', await salaryResponse.text());

            // 3. Test Shift Endpoint
            const shiftUrl = `http://localhost:${PORT}/api/hr/shifts`;
            console.log(`Sending POST to ${shiftUrl}...`);
            const shiftResponse = await fetch(shiftUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    employeeId,
                    ownerLoginId: 'ROOMHY9999',
                    shiftName: 'Day Shift',
                    startTime: '09:00 AM',
                    endTime: '06:00 PM',
                    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
                })
            });
            console.log('Shift HTTP Status:', shiftResponse.status, shiftResponse.statusText);
            console.log('Shift HTTP Response Body:', await shiftResponse.text());
        }
    } catch (err) {
        console.error('Request failed:', err.message);
    }

    await mongoose.disconnect();
}

main().catch(console.error);
