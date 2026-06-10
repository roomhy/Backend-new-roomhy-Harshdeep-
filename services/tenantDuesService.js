'use strict';
const RentInvoice = require('../models/RentInvoice');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const User = require('../models/user');
const { evaluateInvoice, generateMonthlyInvoices } = require('./invoiceService');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Live outstanding for a single invoice (rent + penalty + electricity − paid). */
function calcInvoiceOutstanding(inv) {
  const rentPaid = inv.rentPaidAmount ?? inv.paidAmount ?? 0;
  const rentDue  = Math.max(0, (inv.rentAmount || 0) - rentPaid);
  const penalty  = inv.totalPenalty || 0;
  const elec     = inv.electricityBill || 0;
  const totalDue = rentDue + penalty + elec;
  const paid     = inv.paidAmount || 0;
  return Math.max(0, totalDue - paid);
}

/**
 * Attach dueAmount / dues to tenant objects from pending rent invoices.
 */
async function enrichTenantsWithDues(tenants) {
  if (!tenants?.length) return tenants;

  const tenantIds = tenants.map(t => t._id);
  const invoices = await RentInvoice.find({
    tenantId: { $in: tenantIds },
    status: { $in: ['PENDING', 'PARTIAL'] },
  }).lean();

  const duesMap = {};
  for (const inv of invoices) {
    const tid = String(inv.tenantId);
    duesMap[tid] = (duesMap[tid] || 0) + calcInvoiceOutstanding(inv);
  }

  return tenants.map(t => {
    const due = Math.round(duesMap[String(t._id)] || 0);
    return { ...t, dueAmount: due, dues: due, balance: due };
  });
}

async function resolveOwnerUserId(tenant) {
  if (tenant.ownerLoginId) {
    const user = await User.findOne({ loginId: tenant.ownerLoginId, role: 'owner' }).select('_id').lean();
    if (user) return user._id;
  }
  if (tenant.property) {
    const prop = await Property.findById(tenant.property).select('ownerLoginId').lean();
    if (prop?.ownerLoginId) {
      const user = await User.findOne({ loginId: prop.ownerLoginId, role: 'owner' }).select('_id').lean();
      if (user) return user._id;
    }
  }
  return null;
}

/**
 * Find active tenant in a room (case-insensitive roomNo match).
 */
async function findTenantByRoom(propertyId, roomNo) {
  if (!propertyId || !roomNo) return null;
  return Tenant.findOne({
    property: propertyId,
    roomNo: { $regex: new RegExp(`^${escapeRegex(roomNo)}$`, 'i') },
    status: { $in: ['active', 'pending'] },
    isDeleted: { $ne: true },
  }).select('_id property room roomNo agreedRent ownerLoginId').lean();
}

/**
 * Ensure a rent invoice exists for tenant+billingMonth, then attach electricity bill.
 */
async function syncElectricityToInvoice(propertyId, roomNo, billingMonth, meterRecord) {
  const tenant = await findTenantByRoom(propertyId, roomNo);
  if (!tenant) return { synced: false, reason: 'no_tenant' };

  let invoice = await RentInvoice.findOne({
    tenantId: tenant._id,
    billingMonth,
    status: { $in: ['PENDING', 'PARTIAL'] },
  });

  if (!invoice) {
    const ownerUserId = await resolveOwnerUserId(tenant);
    if (!ownerUserId) return { synced: false, reason: 'no_owner' };

    await generateMonthlyInvoices(ownerUserId, billingMonth, [{
      tenantId:   tenant._id,
      propertyId: tenant.property,
      unitId:     tenant.room,
      rentAmount: tenant.agreedRent || 0,
    }]);

    invoice = await RentInvoice.findOne({
      tenantId: tenant._id,
      billingMonth,
      status: { $in: ['PENDING', 'PARTIAL'] },
    });
    if (!invoice) return { synced: false, reason: 'invoice_create_failed' };
  }

  invoice.electricityBill          = meterRecord.totalBill || 0;
  invoice.electricityUnitsConsumed = meterRecord.unitsConsumed || 0;
  invoice.electricityPrevReading   = meterRecord.previousReading || 0;
  invoice.electricityCurrReading   = meterRecord.currentReading || 0;
  invoice.electricityReadingAdded  = true;

  const { updates } = await evaluateInvoice(invoice);
  await RentInvoice.findByIdAndUpdate(invoice._id, { $set: updates });

  return { synced: true, invoiceId: invoice._id, tenantId: tenant._id };
}

module.exports = {
  calcInvoiceOutstanding,
  enrichTenantsWithDues,
  findTenantByRoom,
  syncElectricityToInvoice,
};
