const dns = require('dns');
dns.setServers(['8.8.8.8']);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Property = require('../models/Property');
const Owner = require('../models/Owner');
const User = require('../models/user');
const ApprovedProperty = require('../models/ApprovedProperty');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://roomhy:VUVXMMggbiDCD1L7@cluster0.ycjlcok.mongodb.net/roomhy?retryWrites=true&w=majority';

async function runMigration() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB.');

    // Find all properties where ownerLoginId is missing/empty
    const properties = await Property.find({
      $or: [
        { ownerLoginId: { $exists: false } },
        { ownerLoginId: '' },
        { ownerLoginId: null }
      ],
      isDeleted: { $ne: true }
    });

    console.log(`🔍 Found ${properties.length} properties with missing ownerLoginId.`);
    let updatedCount = 0;

    for (const prop of properties) {
      console.log(`\n--------------------------------------------`);
      console.log(`🏠 Processing Property: "${prop.title}" (ID: ${prop._id})`);
      console.log(`   Contact Email: ${prop.contact?.email}`);
      console.log(`   Contact Phone: ${prop.contact?.number}`);
      console.log(`   Owner Phone: ${prop.ownerPhone}`);
      console.log(`   Owner Name: ${prop.ownerName}`);

      let ownerDoc = null;

      // 1. Try matching by email
      const email = String(prop.contact?.email || prop.email || '').trim().toLowerCase();
      if (email) {
        ownerDoc = await Owner.findOne({
          $or: [
            { email: email },
            { 'profile.email': email }
          ]
        });
        if (ownerDoc) console.log(`   💡 Found owner by email match: "${ownerDoc.name}" (${ownerDoc.loginId})`);
      }

      // 2. Try matching by phone
      if (!ownerDoc) {
        const phone = String(prop.contact?.number || prop.ownerPhone || prop.phone || '').trim();
        if (phone) {
          const cleanPhone = phone.replace(/^\+?91/, '').trim();
          if (cleanPhone.length >= 10) {
            ownerDoc = await Owner.findOne({
              $or: [
                { phone: new RegExp(cleanPhone + '$') },
                { 'profile.phone': new RegExp(cleanPhone + '$') },
                { checkinPhone: new RegExp(cleanPhone + '$') }
              ]
            });
            if (ownerDoc) console.log(`   💡 Found owner by phone match: "${ownerDoc.name}" (${ownerDoc.loginId})`);
          }
        }
      }

      if (ownerDoc) {
        prop.ownerLoginId = ownerDoc.loginId;
        if (!prop.ownerName) prop.ownerName = ownerDoc.name || ownerDoc.profile?.name;
        if (!prop.ownerPhone) prop.ownerPhone = ownerDoc.phone || ownerDoc.profile?.phone;

        // Find corresponding user ObjectId
        const userDoc = await User.findOne({ loginId: ownerDoc.loginId, role: 'owner' });
        if (userDoc) {
          prop.owner = userDoc._id;
        }

        await prop.save();
        console.log(`   ✅ Successfully updated Property document.`);

        // Also sync to website ApprovedProperty if active and live
        if (prop.isLiveOnWebsite && prop.status === 'active') {
          const vId = prop.visitId || prop._id.toString();
          await ApprovedProperty.findOneAndUpdate(
            { visitId: vId },
            {
              $set: {
                'generatedCredentials.loginId': ownerDoc.loginId,
                'generatedCredentials.ownerName': ownerDoc.name || ownerDoc.profile?.name || prop.ownerName
              }
            }
          );
          console.log(`   ✅ Successfully synced generated credentials in ApprovedProperty.`);
        }
        updatedCount++;
      } else {
        console.log(`   ❌ Could not find a matching owner in the database.`);
      }
    }

    console.log(`\n============================================`);
    console.log(`🎉 Migration Completed. Successfully linked ${updatedCount} properties.`);
  } catch (err) {
    console.error('❌ Migration failed with error:', err);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connection closed.');
  }
}

runMigration();
