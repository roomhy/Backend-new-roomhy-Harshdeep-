const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Harsh:Harsh%402925@cluster0.hddqr9e.mongodb.net/roohmy?retryWrites=true&w=majority&appName=Cluster0";

async function markOnboardingTenantsPaid() {
    try {
        console.log("Connecting to Live MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully.");

        const Tenant = mongoose.model('Tenant', new mongoose.Schema({}, { strict: false }));
        const Rent = mongoose.model('Rent', new mongoose.Schema({}, { strict: false }));
        const RentInvoice = mongoose.model('RentInvoice', new mongoose.Schema({}, { strict: false }));

        // Target the 3 tenants from user screenshots: Arsalan, Priyansh, Soban Ahmad
        const targetLoginIds = ["ROOMHYTNT4296", "ROOMHYTNT9965", "ROOMHYTNT7405"];

        console.log("Targeted login IDs:", targetLoginIds);

        const tenants = await Tenant.find({ loginId: { $in: targetLoginIds } });
        console.log(`Found ${tenants.length} tenants in DB.`);

        for (const t of tenants) {
            console.log(`\nProcessing Tenant ${t.loginId} (${t.name}):`);

            // 1. Mark Tenant Security Deposit as Paid
            const depTotal = t.securityDepositTotal || 0;
            await Tenant.updateOne(
                { _id: t._id },
                {
                    $set: {
                        securityDepositPaid: depTotal,
                        securityDepositBalance: 0
                    }
                }
            );
            console.log(`  ✅ Tenant Security Deposit marked PAID (Paid: ₹${depTotal}, Balance: ₹0)`);

            // 2. Mark Rent collection records as PAID & zero penalty
            const rentUpdate = await Rent.updateMany(
                { tenantLoginId: t.loginId },
                {
                    $set: {
                        paymentStatus: 'paid',
                        paidAmount: t.agreedRent || 0,
                        paymentDate: t.moveInDate || new Date()
                    }
                }
            );
            console.log(`  ✅ Updated ${rentUpdate.modifiedCount} Rent records to status='paid'`);

            // 3. Mark RentInvoices as PAID & clear all penalties
            const invoiceUpdate = await RentInvoice.updateMany(
                { tenantId: t._id },
                {
                    $set: {
                        status: 'PAID',
                        paidAmount: t.agreedRent || 0,
                        rentPaidAmount: t.agreedRent || 0,
                        outstandingAmount: 0,
                        totalPenalty: 0,
                        minorPenaltyAmount: 0,
                        majorPenaltyAmount: 0,
                        currentPhase: 1,
                        daysSinceDue: 0,
                        penaltyHistory: []
                    }
                }
            );
            console.log(`  ✅ Updated ${invoiceUpdate.modifiedCount} RentInvoice records to status='PAID' & zero penalty`);
        }

        console.log(`\n🎉 SUCCESS: All 3 onboarding tenants (Arsalan, Priyansh, Soban Ahmad) marked PAID with NO PENALTIES!`);
    } catch (err) {
        console.error("❌ Error in seed script:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from DB.");
    }
}

markOnboardingTenantsPaid();
