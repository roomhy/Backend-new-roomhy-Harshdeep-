/**
 * Seed Script — ROOMHY3869 Owner + Full Tenant Data
 * Run: node scripts/seedOwnerData.js
 */

// ─── FIX: Override DNS to Google's public DNS (8.8.8.8) ─────────────────────
// Local DNS (127.0.0.1) blocks MongoDB Atlas SRV lookups
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('❌ MONGO_URI missing'); process.exit(1); }

// ─── helpers ────────────────────────────────────────────────────────────────
const daysAgo = (d) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt; };
const monthsAgo = (m) => { const dt = new Date(); dt.setMonth(dt.getMonth() - m); return dt; };

// ─── OWNER CONFIG ────────────────────────────────────────────────────────────
const OWNER_LOGIN_ID = 'ROOMHY3869';
const OWNER_PASSWORD = '123456';
const OWNER_NAME = 'Harsh';
const OWNER_EMAIL = 'harshdeep@roomhy.com';
const OWNER_PHONE = '9876543210';
const PROPERTY_TITLE = 'Mangoapp PG';
const LOCATION_CODE = 'RHY';

// ─── MODELS (inline to avoid import path issues) ─────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true }, email: String,
  phone: { type: String, required: true }, password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'areamanager', 'owner', 'tenant', 'employee'], default: 'tenant' },
  loginId: { type: String, unique: true, sparse: true },
  locationCode: String, status: { type: String, default: 'active' },
  isActive: { type: Boolean, default: true }, isDeleted: { type: Boolean, default: false },
  requirePasswordReset: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now }
});
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt); next();
});

const ownerSchema = new mongoose.Schema({
  loginId: { type: String, required: true, unique: true },
  name: String, email: String, phone: String, address: String,
  locationCode: String, area: String,
  profile: { name: String, email: String, phone: String, address: String, city: String, bankName: String, accountNumber: String, ifscCode: String, branchName: String },
  credentials: { password: String, firstTime: { type: Boolean, default: false } },
  kyc: { status: { type: String, default: 'verified' } },
  checkinUpiId: String,
  isActive: { type: Boolean, default: true }, isDeleted: { type: Boolean, default: false },
  roomCount: { type: Number, default: 0 }, bedCount: { type: Number, default: 0 },
  vacantRooms: { type: Number, default: 0 }, occupiedRooms: { type: Number, default: 0 },
  settings: {
    checkoutTime: { type: String, default: '10:00 AM' }, checkinTime: { type: String, default: '11:00 AM' },
    fineGracePeriod: { type: Number, default: 5 }, fineAmount: { type: Number, default: 100 },
    curfewTime: { type: String, default: '11:00 PM' }, electricityUnitRate: { type: Number, default: 12 }
  },
  createdAt: { type: Date, default: Date.now }
});

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true }, ownerLoginId: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
  locationCode: String, address: String, city: String, area: String,
  propertyType: { type: String, default: 'pg' }, gender: { type: String, default: 'co-ed' },
  status: { type: String, default: 'active' }, isDeleted: { type: Boolean, default: false },
  totalRooms: Number, totalBeds: Number, description: String,
  createdAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  title: { type: String, required: true }, type: String, roomType: String,
  beds: { type: Number, default: 2 }, rent: { type: Number, default: 0 },
  gender: String, status: { type: String, default: 'available' },
  bedAssignments: { type: Array, default: [] }, createdAt: { type: Date, default: Date.now }
});

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true }, phone: { type: String, required: true },
  email: String, dob: String, gender: String,
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  roomNo: String, floor: String, bedNo: String,
  moveInDate: Date, agreedRent: Number, rentAgreementType: String,
  loginId: { type: String, unique: true, sparse: true }, tempPassword: String,
  ownerLoginId: String, propertyTitle: String,
  securityDepositTotal: { type: Number, default: 0 }, securityDepositPaid: { type: Number, default: 0 },
  securityDepositBalance: { type: Number, default: 0 },
  electricityCharge: { type: Number, default: 0 }, maintenanceCharge: { type: Number, default: 0 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  kyc: { aadhar: String, idProof: String }, agreementSigned: { type: Boolean, default: false },
  digitalCheckin: { agreementDetails: { type: mongoose.Schema.Types.Mixed, default: {} } },
  status: { type: String, enum: ['pending', 'active', 'inactive', 'suspended'], default: 'active' },
  isDeleted: { type: Boolean, default: false }, kycStatus: { type: String, default: 'verified' },
  occupation: String, company: String,
  emergencyContact: { name: String, phone: String, relationship: String },
  createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now }
});

const rentSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  propertyName: String, ownerLoginId: String,
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  tenantLoginId: String, tenantName: String, tenantEmail: String, tenantPhone: String,
  roomNumber: String, rentAmount: Number, totalDue: Number,
  collectionMonth: String, paymentStatus: { type: String, default: 'pending' },
  paidAmount: { type: Number, default: 0 }, moveInDate: Date, dueDate: Date,
  createdAt: { type: Date, default: Date.now }
});

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log('✅ MongoDB connected\n');

  const User = mongoose.models.User || mongoose.model('User', userSchema);
  const Owner = mongoose.models.Owner || mongoose.model('Owner', ownerSchema);
  const Property = mongoose.models.Property || mongoose.model('Property', propertySchema);
  const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);
  const Tenant = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
  const Rent = mongoose.models.Rent || mongoose.model('Rent', rentSchema);

  // ── 1. OWNER USER ────────────────────────────────────────────────────────
  console.log('👤 Creating owner user...');
  let ownerUser = await User.findOne({ loginId: OWNER_LOGIN_ID });
  if (ownerUser) {
    console.log('   ⚠️  User already exists — updating password');
    ownerUser.password = OWNER_PASSWORD;
    await ownerUser.save();
  } else {
    ownerUser = await User.create({
      name: OWNER_NAME, email: OWNER_EMAIL, phone: OWNER_PHONE,
      password: OWNER_PASSWORD, role: 'owner', loginId: OWNER_LOGIN_ID,
      locationCode: LOCATION_CODE, status: 'active', isActive: true
    });
  }
  console.log(`   ✅ User: ${OWNER_LOGIN_ID}`);

  // ── 2. OWNER PROFILE ─────────────────────────────────────────────────────
  console.log('🏢 Creating owner profile...');
  const hashedPwd = await bcrypt.hash(OWNER_PASSWORD, 10);
  let owner = await Owner.findOne({ loginId: OWNER_LOGIN_ID });
  if (owner) {
    console.log('   ⚠️  Owner profile exists — skipping');
  } else {
    owner = await Owner.create({
      loginId: OWNER_LOGIN_ID, name: OWNER_NAME, email: OWNER_EMAIL,
      phone: OWNER_PHONE, address: 'Sector 14, Gurgaon', locationCode: LOCATION_CODE,
      profile: {
        name: OWNER_NAME, email: OWNER_EMAIL, phone: OWNER_PHONE,
        address: 'Sector 14, Gurgaon', city: 'Gurgaon',
        bankName: 'HDFC Bank', accountNumber: '50100123456789',
        ifscCode: 'HDFC0001234', branchName: 'Gurgaon Main'
      },
      credentials: { password: hashedPwd, firstTime: false },
      checkinUpiId: 'harshdeep@upi',
      kyc: { status: 'verified' },
      isActive: true, roomCount: 8, bedCount: 16, vacantRooms: 2, occupiedRooms: 6
    });
  }
  console.log(`   ✅ Owner: ${owner.loginId}`);

  // ── 3. PROPERTY ──────────────────────────────────────────────────────────
  console.log('🏠 Creating property...');
  let property = await Property.findOne({ ownerLoginId: OWNER_LOGIN_ID, isDeleted: { $ne: true } });
  if (property) {
    console.log('   ⚠️  Property exists — using existing');
  } else {
    property = await Property.create({
      title: PROPERTY_TITLE, ownerLoginId: OWNER_LOGIN_ID, owner: owner._id,
      locationCode: LOCATION_CODE, address: 'Sector 14, Gurgaon, Haryana',
      city: 'Gurgaon', area: 'Sector 14', propertyType: 'pg', gender: 'co-ed',
      status: 'active', totalRooms: 8, totalBeds: 16,
      description: 'Premium PG with all amenities'
    });
  }
  console.log(`   ✅ Property: ${property.title} (${property._id})`);

  // ── 4. ROOMS ─────────────────────────────────────────────────────────────
  console.log('🚪 Creating rooms...');
  const roomDefs = [
    { title: '101', type: 'Single', beds: 1, rent: 12000, gender: 'male' },
    { title: '102', type: 'Double', beds: 2, rent: 9000, gender: 'male' },
    { title: '103', type: 'Double', beds: 2, rent: 9000, gender: 'male' },
    { title: '104', type: 'Triple', beds: 3, rent: 7500, gender: 'female' },
    { title: '201', type: 'Single', beds: 1, rent: 13000, gender: 'female' },
    { title: '202', type: 'Double', beds: 2, rent: 10000, gender: 'co-ed' },
    { title: '203', type: 'Double', beds: 2, rent: 10000, gender: 'co-ed' },
    { title: '204', type: 'Triple', beds: 3, rent: 8000, gender: 'male' },
  ];
  const rooms = {};
  for (const rd of roomDefs) {
    let room = await Room.findOne({ property: property._id, title: rd.title });
    if (!room) {
      room = await Room.create({ ...rd, property: property._id, status: 'available' });
    }
    rooms[rd.title] = room;
  }
  console.log(`   ✅ ${Object.keys(rooms).length} rooms ready`);

  // ── 5. TENANTS ───────────────────────────────────────────────────────────
  console.log('\n👥 Creating tenants...\n');

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  // 12 tenants: recent(3), 6mo(2), 10mo(3), 11mo(2), 11mo+3days(2)
  const tenantDefs = [
    // --- RECENT TENANTS (1-3 months) ---
    {
      name: 'Arjun Mehta', phone: '9811001001', email: 'arjun@gmail.com', gender: 'Male',
      roomNo: '101', bedNo: '1', rent: 12000, moveIn: monthsAgo(2), deposit: 24000,
      occupation: 'Software Engineer', company: 'TechCorp', tag: '2 months'
    },

    {
      name: 'Sneha Patel', phone: '9811001002', email: 'sneha@gmail.com', gender: 'Female',
      roomNo: '201', bedNo: '1', rent: 13000, moveIn: monthsAgo(1), deposit: 26000,
      occupation: 'Teacher', company: 'Delhi School', tag: '1 month'
    },

    {
      name: 'Rahul Gupta', phone: '9811001003', email: 'rahul@gmail.com', gender: 'Male',
      roomNo: '102', bedNo: '1', rent: 9000, moveIn: monthsAgo(3), deposit: 18000,
      occupation: 'MBA Student', company: 'MDI Gurgaon', tag: '3 months'
    },

    // --- 6 MONTH TENANTS ---
    {
      name: 'Priya Sharma', phone: '9811001004', email: 'priya@gmail.com', gender: 'Female',
      roomNo: '104', bedNo: '1', rent: 7500, moveIn: monthsAgo(6), deposit: 15000,
      occupation: 'Nurse', company: 'Medanta Hospital', tag: '6 months'
    },

    {
      name: 'Karan Singh', phone: '9811001005', email: 'karan@gmail.com', gender: 'Male',
      roomNo: '202', bedNo: '1', rent: 10000, moveIn: monthsAgo(6), deposit: 20000,
      occupation: 'CA', company: 'Deloitte', tag: '6 months'
    },

    // --- 10 MONTH TENANTS (renewal alert soon) ---
    {
      name: 'Amit Verma', phone: '9811001006', email: 'amit@gmail.com', gender: 'Male',
      roomNo: '102', bedNo: '2', rent: 9000, moveIn: monthsAgo(10), deposit: 18000,
      occupation: 'Banker', company: 'HDFC Bank', tag: '10 months — renewal alert'
    },

    {
      name: 'Rohit Kumar', phone: '9811001007', email: 'rohit@gmail.com', gender: 'Male',
      roomNo: '103', bedNo: '1', rent: 9000, moveIn: monthsAgo(10), deposit: 18000,
      occupation: 'Accountant', company: 'EY', tag: '10 months — renewal alert'
    },

    {
      name: 'Nisha Jain', phone: '9811001008', email: 'nisha@gmail.com', gender: 'Female',
      roomNo: '104', bedNo: '2', rent: 7500, moveIn: monthsAgo(10), deposit: 15000,
      occupation: 'HR Manager', company: 'Wipro', tag: '10 months — renewal alert'
    },

    // --- 11 MONTH TENANTS (renewal due) ---
    {
      name: 'Deepak Yadav', phone: '9811001009', email: 'deepak@gmail.com', gender: 'Male',
      roomNo: '103', bedNo: '2', rent: 9000, moveIn: monthsAgo(11), deposit: 18000,
      occupation: 'Developer', company: 'Infosys', tag: '11 months — renewal DUE'
    },

    {
      name: 'Kavya Reddy', phone: '9811001010', email: 'kavya@gmail.com', gender: 'Female',
      roomNo: '202', bedNo: '2', rent: 10000, moveIn: monthsAgo(11), deposit: 20000,
      occupation: 'Designer', company: 'HCL', tag: '11 months — renewal DUE'
    },

    // --- 11 MONTHS + 3 DAYS (OVERDUE — agreement expired) ---
    {
      name: 'Vikram Patil', phone: '9811001011', email: 'vikram@gmail.com', gender: 'Male',
      roomNo: '203', bedNo: '1', rent: 10000, moveIn: (() => { const d = monthsAgo(11); d.setDate(d.getDate() - 3); return d; })(),
      deposit: 20000, occupation: 'Sales Manager', company: 'Amazon', tag: '11 months 3 days — OVERDUE ⚠️'
    },

    {
      name: 'Rekha Pandey', phone: '9811001012', email: 'rekha@gmail.com', gender: 'Female',
      roomNo: '204', bedNo: '1', rent: 8000, moveIn: (() => { const d = monthsAgo(11); d.setDate(d.getDate() - 3); return d; })(),
      deposit: 16000, occupation: 'Lecturer', company: 'GU University', tag: '11 months 3 days — OVERDUE ⚠️'
    },
  ];

  const createdTenants = [];
  let idx = 1;

  for (const td of tenantDefs) {
    const loginId = `ROOMHYTNT${3800 + idx}`;
    const existing = await Tenant.findOne({ phone: td.phone, ownerLoginId: OWNER_LOGIN_ID });
    if (existing) {
      console.log(`   ⏭️  Tenant ${td.name} already exists — skipping`);
      createdTenants.push(existing);
      idx++;
      continue;
    }

    // Create User record for tenant
    let tUser = await User.findOne({ phone: td.phone, role: 'tenant' });
    if (!tUser) {
      tUser = await User.create({
        name: td.name, email: td.email, phone: td.phone,
        password: 'Tenant@123', role: 'tenant', loginId,
        locationCode: LOCATION_CODE, status: 'active', isActive: true,
        requirePasswordReset: true
      });
    }

    const room = rooms[td.roomNo];
    const tenant = await Tenant.create({
      name: td.name, phone: td.phone, email: td.email,
      gender: td.gender, occupation: td.occupation, company: td.company,
      property: property._id, room: room?._id, roomNo: td.roomNo, bedNo: td.bedNo,
      moveInDate: td.moveIn, agreedRent: td.rent, rentAgreementType: 'monthly',
      loginId, ownerLoginId: OWNER_LOGIN_ID, propertyTitle: PROPERTY_TITLE,
      securityDepositTotal: td.deposit, securityDepositPaid: td.deposit, securityDepositBalance: 0,
      electricityCharge: 500, maintenanceCharge: 200,
      user: tUser._id, kycStatus: 'verified', status: 'active',
      kyc: { aadhar: `XXXX-XXXX-${2000 + idx}`, idProof: 'Aadhaar Card' },
      agreementSigned: true, agreementSignedAt: td.moveIn,
      emergencyContact: { name: `${td.name.split(' ')[0]} Father`, phone: `98110${20000 + idx}`, relationship: 'Father' },
      digitalCheckin: {
        agreementDetails: {
          accommodationType: 'PG', minimumStayDuration: '11 Months',
          noticePeriodDays: 30, licenseFeeDueDate: 10, lateFee: 500,
          licenseDuration: '11 months', securityDeposit: td.deposit,
          propertyAddress: 'Sector 14, Gurgaon, Haryana'
        }
      }
    });

    console.log(`   ✅ [${td.tag}] ${td.name} → Room ${td.roomNo} Bed ${td.bedNo} | Move-in: ${td.moveIn.toLocaleDateString('en-IN')}`);
    createdTenants.push(tenant);
    idx++;
  }

  // ── 6. RENT RECORDS ──────────────────────────────────────────────────────
  console.log('\n💰 Creating rent records...\n');
  for (const tenant of createdTenants) {
    const existingRent = await Rent.findOne({ tenantLoginId: tenant.loginId, collectionMonth: currentMonth });
    if (existingRent) {
      console.log(`   ⏭️  Rent for ${tenant.name} already exists`);
      continue;
    }
    // Determine payment status based on move-in (older = more likely paid)
    const monthsIn = Math.floor((now - tenant.moveInDate) / (1000 * 60 * 60 * 24 * 30));
    const isPaid = monthsIn >= 11; // overdue tenants — mark as pending for drama
    const isPartial = monthsIn === 10;

    await Rent.create({
      propertyId: property._id, propertyName: PROPERTY_TITLE, ownerLoginId: OWNER_LOGIN_ID,
      tenantId: tenant._id, tenantLoginId: tenant.loginId,
      tenantName: tenant.name, tenantEmail: tenant.email, tenantPhone: tenant.phone,
      roomNumber: tenant.roomNo, rentAmount: tenant.agreedRent,
      totalDue: tenant.agreedRent + (tenant.electricityCharge || 0) + (tenant.maintenanceCharge || 0),
      collectionMonth: currentMonth,
      paymentStatus: isPaid ? 'overdue' : isPartial ? 'partially_paid' : 'pending',
      paidAmount: isPartial ? Math.floor(tenant.agreedRent / 2) : 0,
      moveInDate: tenant.moveInDate,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 10)
    });
    console.log(`   ✅ Rent: ${tenant.name} ₹${tenant.agreedRent} [${isPaid ? 'OVERDUE' : isPartial ? 'PARTIAL' : 'PENDING'}]`);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ SEED COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Owner Login ID : ${OWNER_LOGIN_ID}`);
  console.log(`  Owner Password : ${OWNER_PASSWORD}`);
  console.log(`  Property       : ${PROPERTY_TITLE}`);
  console.log(`  Rooms          : 8`);
  console.log(`  Tenants        : ${createdTenants.length}`);
  console.log('    📗 Recent (1-3 mo) : 3');
  console.log('    📘 6 months        : 2');
  console.log('    🟡 10 months       : 3 (renewal alert)');
  console.log('    🟠 11 months       : 2 (renewal due)');
  console.log('    🔴 11mo + 3 days   : 2 (OVERDUE / expired)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
