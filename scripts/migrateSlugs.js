const dns = require('dns');
if (!dns.getServers().includes('8.8.8.8')) {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
}

require('dotenv').config();
const mongoose = require('mongoose');
const City = require('../models/City');
const Area = require('../models/Area');
const slugify = require('../utils/slugify');

async function migrate() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomhy';
    console.log(`🔗 Connecting to MongoDB: ${mongoUri.substring(0, 50)}...`);
    
    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log('✅ Connected to Database');

    // 1. Migrate Cities
    console.log('\n📊 Migrating Cities...');
    const cities = await City.find({});
    console.log(`Found ${cities.length} cities.`);
    
    let updatedCitiesCount = 0;
    for (const city of cities) {
        const expectedSlug = slugify(city.name);
        if (!city.slug || city.slug !== expectedSlug) {
            city.slug = expectedSlug;
            await city.save();
            console.log(`  ✓ Updated City "${city.name}" -> slug: "${city.slug}"`);
            updatedCitiesCount++;
        }
    }
    console.log(`✅ Cities migration complete. Updated ${updatedCitiesCount} records.`);

    // 2. Migrate Areas
    console.log('\n📊 Migrating Areas...');
    const areas = await Area.find({});
    console.log(`Found ${areas.length} areas.`);
    
    let updatedAreasCount = 0;
    for (const area of areas) {
        const expectedSlug = slugify(area.name);
        if (!area.slug || area.slug !== expectedSlug) {
            area.slug = expectedSlug;
            await area.save();
            console.log(`  ✓ Updated Area "${area.name}" (City: ${area.cityName}) -> slug: "${area.slug}"`);
            updatedAreasCount++;
        }
    }
    console.log(`✅ Areas migration complete. Updated ${updatedAreasCount} records.`);

    console.log('\n✨ All migrations finished successfully!');
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
