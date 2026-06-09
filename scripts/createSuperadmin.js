/**
 * Create Superadmin Script
 * Run: node scripts/createSuperadmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── CHANGE THESE ──
const SUPERADMIN_NAME     = "Super Admin";
const SUPERADMIN_EMAIL    = "roomhyadmin@gmail.com";
const SUPERADMIN_PHONE    = "9999999999";
const SUPERADMIN_LOGIN_ID = "roomhyadmin@gmail.com";
const SUPERADMIN_PASSWORD = "admin@123";
// ─────────────────

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found in .env");
  process.exit(1);
}

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String },
  phone:    { type: String, required: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['superadmin','areamanager','owner','tenant','employee'], default: 'tenant' },
  loginId:  { type: String, unique: true, sparse: true },
  status:   { type: String, default: 'active' },
  isActive: { type: Boolean, default: true },
  isDeleted:{ type: Boolean, default: false },
  createdAt:{ type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

async function main() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ MongoDB connected");

    const User = mongoose.models.User || mongoose.model('User', userSchema);

    // Check if already exists
    const existing = await User.findOne({ loginId: SUPERADMIN_LOGIN_ID });
    if (existing) {
      console.log(`⚠️  Superadmin with loginId "${SUPERADMIN_LOGIN_ID}" already exists.`);
      console.log("   Updating password...");
      const salt = await bcrypt.genSalt(10);
      existing.password = await bcrypt.hash(SUPERADMIN_PASSWORD, salt);
      existing.role = 'superadmin';
      existing.isActive = true;
      existing.isDeleted = false;
      await existing.save({ validateBeforeSave: false });
      console.log("✅ Password updated!");
    } else {
      const admin = new User({
        name:     SUPERADMIN_NAME,
        email:    SUPERADMIN_EMAIL,
        phone:    SUPERADMIN_PHONE,
        password: SUPERADMIN_PASSWORD,
        role:     'superadmin',
        loginId:  SUPERADMIN_LOGIN_ID,
        status:   'active',
        isActive: true,
        isDeleted: false,
      });
      await admin.save();
      console.log("✅ Superadmin created successfully!");
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Login ID  :", SUPERADMIN_LOGIN_ID);
    console.log("  Password  :", SUPERADMIN_PASSWORD);
    console.log("  Role      : superadmin");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
