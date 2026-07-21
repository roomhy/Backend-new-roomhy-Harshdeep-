const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('../models/Review');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    
    const email = 'h2248370@gmail.com';
    const reviews = await Review.find({ email }).lean();
    
    console.log(`\n=== Reviews by ${email} ===`);
    if (reviews.length === 0) {
        console.log("No reviews found.");
    } else {
        reviews.forEach(r => {
            console.log(`Review ID: ${r._id}`);
            console.log(`  Property: ${r.propertyName} (${r.propertyId})`);
            console.log(`  Rating: ${r.rating}`);
            console.log(`  Content: "${r.review}"`);
            console.log(`  Status: ${r.status}`);
            console.log(`  moderationStatus: ${r.moderationStatus}`);
            console.log(`  isVerifiedStay: ${r.isVerifiedStay}`);
            console.log(`  tenantId: ${r.tenantId}`);
            console.log(`  bookingId: ${r.bookingId}`);
        });
    }
    
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
