const dns = require('dns');
if (!dns.getServers().includes('8.8.8.8')) {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
}

require('dotenv').config();
const mongoose = require('mongoose');
const SeoPage = require('../models/SeoPage');
const SeoRedirect = require('../models/SeoRedirect');
const seoController = require('../controllers/seoController');
const City = require('../models/City');
const Area = require('../models/Area');
const slugify = require('../utils/slugify');

async function testFlow() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomhy';
    console.log(`🔗 Connecting to MongoDB: ${mongoUri.substring(0, 50)}...`);
    
    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log('✅ Connected to Database');

    // Clean up any old test records
    await SeoPage.deleteMany({ pageKey: 'test-page' });
    await SeoRedirect.deleteMany({ oldUrl: 'test-old-slug' });

    console.log('\n🧪 Testing Slugify Utility...');
    const slug1 = slugify('New Delhi');
    const slug2 = slugify('Vijay Nagar');
    console.log(`  "New Delhi" -> "${slug1}" (Expected: "new-delhi")`);
    console.log(`  "Vijay Nagar" -> "${slug2}" (Expected: "vijay-nagar")`);
    if (slug1 !== 'new-delhi' || slug2 !== 'vijay-nagar') {
        throw new Error('❌ Slugify utility failed');
    }
    console.log('✅ Slugify verified.');

    console.log('\n🧪 Testing Page Registration & Resolution...');
    // Register a template page
    const mockRequest = {
        body: {
            pageKey: 'test-page',
            pageName: 'Test Page',
            slug: 'website/test-page',
            metaTitle: 'Best Rooms in {city} {area} | Test',
            metaDescription: 'Verified accommodations in {area}, {city} on Test.',
            metaKeywords: 'pg in {city}, hostel in {area}',
            isIndexed: true,
            sitemapPriority: 0.9,
            sitemapChangefreq: 'daily'
        }
    };
    
    let responseData = null;
    const mockResponse = {
        status: (code) => {
            return {
                json: (data) => {
                    responseData = data;
                    return data;
                }
            };
        }
    };

    await seoController.registerPage(mockRequest, mockResponse);
    if (!responseData || !responseData.success) {
        throw new Error('❌ Page registration API failed');
    }
    console.log('  ✓ Test page registered successfully');

    // Query template page with dynamic parameters
    const mockQueryRequest = {
        query: {
            pageKey: 'test-page',
            city: 'Indore',
            area: 'Vijay Nagar'
        }
    };

    await seoController.getSeoMetadata(mockQueryRequest, mockResponse);
    if (!responseData || !responseData.success || !responseData.data) {
        throw new Error('❌ SEO metadata resolution API failed');
    }

    const { metaTitle, metaDescription, metaKeywords, canonicalUrl } = responseData.data;
    console.log(`  Resolved Title: "${metaTitle}"`);
    console.log(`  Resolved Description: "${metaDescription}"`);
    console.log(`  Resolved Keywords: "${metaKeywords}"`);
    console.log(`  Resolved Canonical URL: "${canonicalUrl}"`);

    if (
        metaTitle !== 'Best Rooms in Indore Vijay Nagar | Test' ||
        metaDescription !== 'Verified accommodations in Vijay Nagar, Indore on Test.' ||
        metaKeywords !== 'pg in Indore, hostel in Vijay Nagar' ||
        canonicalUrl !== 'https://roomhy.com/test-page'
    ) {
        throw new Error('❌ SEO template resolution values mismatched expectations');
    }
    console.log('✅ Template placeholder substitution verified.');

    console.log('\n🧪 Testing Database Redirects...');
    // Create redirect rule
    const mockRedirectRequest = {
        body: {
            oldUrl: 'test-old-slug',
            newUrl: '/website/ourproperty/indore/vijay-nagar',
            statusCode: 301
        }
    };

    await seoController.createRedirect(mockRedirectRequest, mockResponse);
    if (!responseData || !responseData.success) {
        throw new Error('❌ Redirect creation failed');
    }
    console.log('  ✓ Redirect rule created successfully');

    // Query the metadata API with the old URL to verify redirect resolution
    const mockLookupRedirectRequest = {
        query: {
            url: 'test-old-slug'
        }
    };

    await seoController.getSeoMetadata(mockLookupRedirectRequest, mockResponse);
    if (!responseData || !responseData.success || !responseData.redirect) {
        throw new Error('❌ Redirect resolution lookup failed');
    }

    console.log(`  ✓ Resolution output: Redirect? ${responseData.redirect}, Target: "${responseData.newUrl}", Code: ${responseData.statusCode}`);
    if (responseData.newUrl !== '/website/ourproperty/indore/vijay-nagar' || responseData.statusCode !== 301) {
        throw new Error('❌ Redirect resolution data mismatched expectations');
    }
    console.log('✅ Redirect manager verified.');

    // Cleanup test data
    await SeoPage.deleteMany({ pageKey: 'test-page' });
    await SeoRedirect.deleteMany({ oldUrl: 'test-old-slug' });
    
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! backend SEO foundation is completely correct.');
    await mongoose.disconnect();
    process.exit(0);
}

testFlow().catch(err => {
    console.error('❌ Test execution failed:', err.message);
    mongoose.disconnect();
    process.exit(1);
});
