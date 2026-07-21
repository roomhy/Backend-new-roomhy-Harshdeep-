const mongoose = require('mongoose');
require('dotenv').config();
const ApprovedProperty = require('./models/ApprovedProperty');
const PageLayout = require('./models/PageLayout');

async function test() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI is missing in .env!');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  // Test Approved Properties query logic
  try {
    console.log('Testing ApprovedProperty.find...');
    const rawProperties = await ApprovedProperty.find({
        status: { $in: ['approved', 'live'] }
    });
    console.log(`Found ${rawProperties.length} raw approved properties.`);

    const uniqueMap = new Map();
    rawProperties.forEach(p => {
        const key = p.visitId || p.propertyId || p._id.toString();
        if (!uniqueMap.has(key)) uniqueMap.set(key, p);
    });
    
    const properties = Array.from(uniqueMap.values());
    console.log(`Found ${properties.length} unique properties.`);

    const transformedProperties = properties.map((prop, index) => {
      try {
        const propInfo = prop.propertyInfo || {};
        const city = prop.city || propInfo.city || propInfo.area || '';
        const rawImages = prop.images?.length > 0 ? prop.images : (propInfo.photos || []);
        
        // Safety check for rawImages to prevent crashes if it is not an array
        if (!Array.isArray(rawImages)) {
          console.log(`Property index ${index} has non-array images:`, typeof rawImages, rawImages);
        }

        const images = Array.isArray(rawImages) 
          ? rawImages.filter(img => img && typeof img === 'string' && !img.startsWith('data:'))
          : [];
          
        const { photos: _photos, ownerGmail: _g, ownerPhone: _ph, ownerEmail: _em, ...safeInfo } = propInfo;
        return {
          _id: prop._id,
          visitId: prop.visitId,
          property_name: propInfo.name || 'Property',
          city,
          images
        };
      } catch (err) {
        console.error(`Error mapping property index ${index} (${prop._id}):`, err);
        throw err;
      }
    });

    console.log('Successfully transformed all properties.');
  } catch (err) {
    console.error('Error in ApprovedProperty test:', err);
  }

  // Test Page Layouts query logic
  try {
    console.log('\nTesting PageLayout.find...');
    const pageKeys = ['home', 'about', 'contact', 'list-property', 'faq', 'privacy', 'terms', 'login', 'register', 'our-property', 'property-details'];
    for (const key of pageKeys) {
      const layout = await PageLayout.findOne({ pageKey: key });
      console.log(`PageKey "${key}": ${layout ? 'Found in DB' : 'Not in DB (will use default)'}`);
    }
  } catch (err) {
    console.error('Error in PageLayout test:', err);
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

test().catch(console.error);
