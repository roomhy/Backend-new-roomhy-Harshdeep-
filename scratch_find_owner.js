const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
require('dotenv').config();
const Property = require('./models/Property');

async function findOwner() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not found in env');
    return;
  }
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const properties = await Property.find({
    status: { $in: ['live', 'approved', 'active'] }
  }).lean();

  console.log(`\nFound ${properties.length} active/approved properties in DB.`);

  console.log('\n--- Matching properties in Kota, Talwandi ---');
  let matchCount = 0;
  properties.forEach(p => {
    const propInfo = p.propertyInfo || {};
    const city = String(p.city || propInfo.city || '').toLowerCase().trim();
    const locality = String(p.locality || propInfo.area || p.area || '').toLowerCase().trim();

    // Check if city matches Kota and locality contains Talwandi
    if (city.includes('kota') && (locality.includes('talwandi') || 'talwandi'.includes(locality))) {
      matchCount++;
      console.log(`\nMatch #${matchCount}:`);
      console.log(`Title: ${p.title}`);
      console.log(`City: ${p.city || propInfo.city}`);
      console.log(`Locality/Area: ${p.locality || propInfo.area || p.area}`);
      console.log(`Rent: ${p.monthlyRent || p.rent || propInfo.rent}`);
      console.log(`Owner Login ID: ${p.ownerLoginId}`);
      console.log(`Created By: ${p.createdBy}`);
      console.log(`Owner ID Ref: ${p.owner}`);
    }
  });

  await mongoose.disconnect();
}

findOwner().catch(console.error);
