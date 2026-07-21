const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Harsh:Harsh%402925@cluster0.hddqr9e.mongodb.net/roohmy?retryWrites=true&w=majority&appName=Cluster0";

async function fixTenantSecurityDeposits() {
    try {
        console.log("Connecting to Live MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully.");

        const Tenant = mongoose.model('Tenant', new mongoose.Schema({}, { strict: false }));
        const Property = mongoose.model('Property', new mongoose.Schema({}, { strict: false }));
        const ApprovedProperty = mongoose.model('ApprovedProperty', new mongoose.Schema({}, { strict: false }));

        const tenants = await Tenant.find({ isDeleted: { $ne: true } });
        console.log(`Found ${tenants.length} tenants in DB.`);

        let updatedCount = 0;

        for (const t of tenants) {
            let prop = null;
            if (t.property) {
                prop = await Property.findById(t.property).lean() || await ApprovedProperty.findById(t.property).lean();
            }
            if (!prop && t.propertyTitle) {
                prop = await Property.findOne({ title: t.propertyTitle }).lean() || await ApprovedProperty.findOne({ title: t.propertyTitle }).lean();
            }

            const propDeposit = prop?.pricing?.securityDeposit || prop?.securityDeposit;

            if (propDeposit) {
                const depNum = parseInt(propDeposit, 10);
                if (!isNaN(depNum) && depNum > 0) {
                    console.log(`[SYNC] Tenant ${t.loginId} (${t.name}): Property "${t.propertyTitle}" Deposit = ₹${depNum}. Updating from ₹${t.securityDepositTotal || 0}...`);
                    
                    const updateObj = {
                        securityDepositTotal: depNum,
                        securityDepositBalance: Math.max(0, depNum - (t.securityDepositPaid || 0)),
                        "digitalCheckin.agreementDetails.securityDeposit": String(depNum),
                        "digitalCheckin.profile.securityDeposit": String(depNum)
                    };

                    await Tenant.updateOne({ _id: t._id }, { $set: updateObj });
                    updatedCount++;
                }
            }
        }

        console.log(`\n🎉 SUCCESS: Updated ${updatedCount} tenant security deposits in Live Database!`);
    } catch (err) {
        console.error("❌ Error fixing security deposits:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from DB.");
    }
}

fixTenantSecurityDeposits();
