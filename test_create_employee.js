const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const jwt = require('jsonwebtoken');

// We will fetch the employee controller/routes directly or hit the handler.
// But hitting the route handler directly is easiest:
const express = require('express');
const employeeRouter = require('./routes/employeeRoutes');

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

    // Mock request and response to test the router directly
    const req = {
        method: 'POST',
        url: '/',
        headers: {
            authorization: `Bearer ${token}`
        },
        body: {
            name: 'Test Warden',
            loginId: 'STAFF0009',
            phone: '9876543210',
            email: 'testwarden@example.com',
            password: 'password123',
            role: 'Warden',
            parentLoginId: 'ROOMHY9999'
        }
    };

    const res = {
        statusCode: 200,
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            console.log(`Response Status: ${this.statusCode}`);
            console.log('Response JSON:', data);
            return this;
        }
    };

    // Let's manually trigger the POST '/' handler in employeeRoutes
    // First, find the POST '/' route
    const postRoute = employeeRouter.stack.find(s => s.route && s.route.path === '/' && s.route.methods.post);
    if (!postRoute) {
        console.error('POST / route not found in employeeRouter!');
        process.exit(1);
    }

    console.log('Found route. Handlers count:', postRoute.route.stack.length);

    // We can simulate the middleware stack: protect -> authorize -> main handler
    // Let's execute them in sequence
    let currentHandlerIndex = 0;
    const stack = postRoute.route.stack;

    const next = async (err) => {
        if (err) {
            console.error('Middleware next() called with error:', err);
            return;
        }
        if (currentHandlerIndex < stack.length) {
            const layer = stack[currentHandlerIndex++];
            console.log(`Executing layer ${currentHandlerIndex}: name = ${layer.name || 'anonymous'}`);
            try {
                // In Express 4, route layer handlers are executed via layer.handle(req, res, next)
                await layer.handle(req, res, next);
            } catch (handlerErr) {
                console.error('Error executing layer:', handlerErr);
            }
        } else {
            console.log('Finished executing all stack layers.');
        }
    };

    await next();

    await mongoose.disconnect();
}

main().catch(console.error);
