const dns = require('dns');
if (!dns.getServers().includes('8.8.8.8')) {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
}

require('dotenv').config();
const mongoose = require('mongoose');
const SeoPage = require('../models/SeoPage');

const seoPagesSeedData = [
    {
        pageKey: 'home',
        pageName: 'Home',
        slug: '',
        metaTitle: 'Roomhy | Find your perfect stay',
        metaDescription: 'Find broker-free verified PGs, hostels, apartments, and co-living spaces for students and working professionals on Roomhy.',
        metaKeywords: 'student housing, pg, hostel, co-living, roomhy',
        sitemapPriority: 1.0,
        sitemapChangefreq: 'daily'
    },
    {
        pageKey: 'about',
        pageName: 'About Us',
        slug: 'website/about',
        metaTitle: 'About Us | Roomhy',
        metaDescription: 'Learn more about Roomhy, our mission to build broker-free housing, and how we help students find verified accommodations easily.',
        metaKeywords: 'about roomhy, broker free pg, roomhy mission',
        sitemapPriority: 0.8,
        sitemapChangefreq: 'monthly'
    },
    {
        pageKey: 'contact',
        pageName: 'Contact Us',
        slug: 'website/contact',
        metaTitle: 'Contact Us | Roomhy',
        metaDescription: "Get in touch with the Roomhy support team. We're here to help you find the best PG, hostel, or rental home.",
        metaKeywords: 'contact roomhy, roomhy support, roomhy email',
        sitemapPriority: 0.7,
        sitemapChangefreq: 'monthly'
    },
    {
        pageKey: 'blogs',
        pageName: 'Blogs',
        slug: 'website/blogs',
        metaTitle: 'Latest Blogs & Guides | Roomhy',
        metaDescription: 'Read student lifestyle tips, moving guides, and city insights on the Roomhy blog.',
        metaKeywords: 'roomhy blog, student guide, college hostel tips',
        sitemapPriority: 0.8,
        sitemapChangefreq: 'weekly'
    },
    {
        pageKey: 'blog-details',
        pageName: 'Blog Details',
        slug: 'website/blogs/{blogSlug}',
        metaTitle: '{blogTitle} | Roomhy Blog',
        metaDescription: '{blogSummary}',
        metaKeywords: 'roomhy blog, {blogKeywords}',
        sitemapPriority: 0.6,
        sitemapChangefreq: 'monthly'
    },
    {
        pageKey: 'our-property',
        pageName: 'Property Listing',
        slug: 'website/ourproperty',
        metaTitle: 'PGs and Hostels in {city} {area} | Roomhy',
        metaDescription: 'Find and book verified co-living spaces, PGs, and hostels in {area}, {city} with no brokerage on Roomhy.',
        metaKeywords: 'pg in {city}, hostel in {area}, co-living {city}, broker-free pg',
        sitemapPriority: 0.9,
        sitemapChangefreq: 'daily'
    },
    {
        pageKey: 'property-details',
        pageName: 'Property Details',
        slug: 'website/property-details/{propertyId}',
        metaTitle: '{name} in {area}, {city} | Roomhy',
        metaDescription: 'View rooms, amenities, rent pricing, and reviews for {name} in {area}, {city}. Book directly without brokerage on Roomhy.',
        metaKeywords: '{name}, pg in {area}, hostel in {city}, roomhy',
        sitemapPriority: 0.9,
        sitemapChangefreq: 'weekly'
    },
    {
        pageKey: 'privacy-policy',
        pageName: 'Privacy Policy',
        slug: 'website/privacy',
        metaTitle: 'Privacy Policy | Roomhy',
        metaDescription: 'Read the Roomhy privacy policy to understand how we protect your personal details and manage data security.',
        metaKeywords: 'privacy policy, roomhy privacy',
        sitemapPriority: 0.3,
        sitemapChangefreq: 'yearly'
    },
    {
        pageKey: 'terms-and-conditions',
        pageName: 'Terms and Conditions',
        slug: 'website/terms',
        metaTitle: 'Terms and Conditions | Roomhy',
        metaDescription: 'Read our terms and conditions before renting PGs or hosting properties on the Roomhy marketplace.',
        metaKeywords: 'terms and conditions, roomhy agreement',
        sitemapPriority: 0.3,
        sitemapChangefreq: 'yearly'
    },
    {
        pageKey: 'owner',
        pageName: 'Owner Panel',
        slug: 'propertyowner/index',
        metaTitle: 'Property Owner Panel | Roomhy',
        metaDescription: 'List your hostel, PG, or flats on Roomhy, manage tenant check-ins, collect rent, and view reports.',
        metaKeywords: 'list property, pg manager, roomhy owner',
        sitemapPriority: 0.5,
        sitemapChangefreq: 'monthly'
    },
    {
        pageKey: 'tenant',
        pageName: 'Tenant Portal',
        slug: 'tenant/tenantdashboard',
        metaTitle: 'Tenant Dashboard | Roomhy',
        metaDescription: 'Access your Roomhy tenant portal to raise complaints, view rent invoices, and check rent payment details.',
        metaKeywords: 'tenant dashboard, pay rent online, roomhy tenant',
        sitemapPriority: 0.5,
        sitemapChangefreq: 'monthly'
    }
];

async function seed() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomhy';
    console.log(`🔗 Connecting to MongoDB: ${mongoUri.substring(0, 50)}...`);
    
    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        family: 4
    });
    console.log('✅ Connected to Database');

    console.log('\n📊 Seeding SEO Pages...');
    
    let seededCount = 0;
    for (const data of seoPagesSeedData) {
        // Upsert based on unique pageKey and null entityId
        const updated = await SeoPage.findOneAndUpdate(
            { pageKey: data.pageKey, entityId: null },
            { $set: data },
            { upsert: true, new: true }
        );
        console.log(`  ✓ Seeded pageKey "${updated.pageKey}"`);
        seededCount++;
    }

    console.log(`\n✅ Seeding complete. Processed ${seededCount} pages.`);
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
