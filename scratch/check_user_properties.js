const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const ApprovedProperty = require('../models/ApprovedProperty');

async function main() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(MONGO_URI);
    
    const email = 'h2248370@gmail.com';
    const tenants = await Tenant.find({ email }).populate('property').lean();
    
    console.log(`\n=== Checking ApprovedProperty status for tenant ${email} ===`);
    for (const t of tenants) {
        if (!t.property) continue;
        const propId = t.property._id;
        const approved = await ApprovedProperty.findOne({ $or: [{ _id: propId }, { visitId: String(propId) }] });
        console.log(`Property Title: ${t.property.title || t.property.propertyName || t.property.property_name}`);
        console.log(`  Property ID: ${propId}`);
        console.log(`  Present in ApprovedProperty: ${approved ? 'YES ✅' : 'NO ❌'}`);
        
        if (!approved) {
            console.log(`  --> Approving/Adding this property to ApprovedProperty to allow testing...`);
            const newApproved = new ApprovedProperty({
                _id: propId,
                visitId: String(propId),
                propertyInfo: {
                    name: t.property.propertyName || t.property.property_name || 'Test Property',
                    city: t.property.city || 'Kota',
                    area: t.property.area || 'Nearby',
                    rent: t.property.monthlyRent || t.property.agreedRent || 5000,
                    genderSuitability: t.property.gender || 'Any',
                    propertyType: t.property.propertyType || 'PG'
                },
                isLiveOnWebsite: true,
                status: 'live'
            });
            await newApproved.save();
            console.log(`  --> Property added to ApprovedProperty!`);
        }
    }
    
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
