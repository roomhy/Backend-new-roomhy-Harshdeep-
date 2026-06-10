'use strict';
const Property = require('../models/Property');
const Tenant = require('../models/Tenant');
const Room = require('../models/Room');
const { enrichTenantsWithDues } = require('../services/tenantDuesService');

function normalizeOwnerId(ownerLoginId) {
  return String(ownerLoginId || '').trim().toUpperCase();
}

async function getOwnerProperties(ownerLoginId, propertyId = null) {
  const normalized = normalizeOwnerId(ownerLoginId);
  const filter = { ownerLoginId: normalized, isDeleted: { $ne: true } };
  if (propertyId) filter._id = propertyId;
  return Property.find(filter).select('_id title locationCode').lean();
}

function formatDate(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-IN');
}

function resolveAgreementStatus(t) {
  if (t.agreementSigned) return 'signed';
  if (t.agreementStatus) return t.agreementStatus;
  if (t.agreementSignedAt) return 'signed';
  return 'pending';
}

function formatTenantRow(t, propTitleMap = {}) {
  const propertyTitle =
    t.property?.title ||
    t.propertyTitle ||
    t.propertyName ||
    propTitleMap[String(t.property?._id || t.property)] ||
    'N/A';

  const roomLabel =
    t.room?.title ||
    t.roomNo ||
    (t.building && t.floor ? `${t.building} - ${t.floor}` : null) ||
    t.building ||
    'N/A';

  return {
    'Tenant Name': t.name || 'N/A',
    'Property': propertyTitle,
    'Room': roomLabel,
    'Phone': t.phone || 'N/A',
    'Move In Date': formatDate(t.moveInDate || t.joiningDate || t.createdAt),
    'Monthly Rent': t.agreedRent || t.rentAmount || t.rent || 0,
    'KYC Status': t.kycStatus || 'N/A',
    'Agreement Status': resolveAgreementStatus(t),
    'Status': t.status || 'N/A',
  };
}

async function buildTenantFilter(ownerLoginId, extra = {}) {
  const properties = await getOwnerProperties(ownerLoginId, extra.propertyId || null);
  const propertyIds = properties.map(p => p._id);
  const normalized = normalizeOwnerId(ownerLoginId);

  const orClause = [{ ownerLoginId: normalized }];
  if (propertyIds.length) orClause.push({ property: { $in: propertyIds } });

  const filter = {
    $or: orClause,
    isDeleted: { $ne: true },
  };

  if (extra.status) filter.status = extra.status;
  delete extra.propertyId;
  delete extra.status;
  return { filter: { ...filter, ...extra }, properties, propertyIds };
}

async function fetchTenantsForReport(ownerLoginId, options = {}) {
  const { filter, properties } = await buildTenantFilter(ownerLoginId, {
    propertyId: options.propertyId || null,
    status: options.status || null,
  });

  let tenants = await Tenant.find(filter)
    .populate('property', 'title ownerLoginId')
    .populate('room', 'title floor type sharingType')
    .sort({ createdAt: -1 })
    .limit(options.limit || 500)
    .lean();

  if (options.withDues) {
    tenants = await enrichTenantsWithDues(tenants);
  }

  const propTitleMap = Object.fromEntries(properties.map(p => [String(p._id), p.title]));
  return { tenants, propTitleMap };
}

function formatDuesRow(t, propTitleMap = {}) {
  const base = formatTenantRow(t, propTitleMap);
  return {
    'Tenant Name': base['Tenant Name'],
    'Property': base['Property'],
    'Room': base['Room'],
    'Monthly Rent': base['Monthly Rent'],
    'Pending Amount': t.dueAmount || t.dues || t.balance || 0,
    'Phone': base['Phone'],
    'Move In Date': base['Move In Date'],
  };
}

function formatOccupancyRow(room, propTitleMap = {}) {
  const totalBeds = Number(room.beds) || 1;
  const assignedBeds = (room.bedAssignments || []).filter(b => b.tenantId).length;
  const occupiedBeds = Math.max(assignedBeds, room.isAvailable === false ? totalBeds : assignedBeds);

  return {
    'Property': room.property?.title || propTitleMap[String(room.property?._id || room.property)] || 'N/A',
    'Room': room.title || 'N/A',
    'Floor': room.floor || 'N/A',
    'Type': room.type || room.sharingType || room.unitType || 'N/A',
    'Beds': totalBeds,
    'Occupied Beds': occupiedBeds,
    'Vacant Beds': Math.max(0, totalBeds - occupiedBeds),
    'Available': room.isAvailable && occupiedBeds === 0 ? 'Yes' : 'No',
    'Price': room.price ? `₹${room.price}` : 'N/A',
    'Status': room.status || 'N/A',
  };
}

async function fetchRoomsForReport(ownerLoginId, propertyId = null) {
  const properties = await getOwnerProperties(ownerLoginId, propertyId);
  const propertyIds = properties.map(p => p._id);
  if (!propertyIds.length) return { rooms: [], propTitleMap: {} };

  const rooms = await Room.find({
    property: { $in: propertyIds },
    isDeleted: { $ne: true },
  })
    .populate('property', 'title')
    .sort({ title: 1 })
    .limit(500)
    .lean();

  const propTitleMap = Object.fromEntries(properties.map(p => [String(p._id), p.title]));
  return { rooms, propTitleMap };
}

function calcOccupancyKpis(rooms) {
  let totalBeds = 0;
  let occupiedBeds = 0;
  for (const r of rooms) {
    const beds = Number(r.beds) || 1;
    const assigned = (r.bedAssignments || []).filter(b => b.tenantId).length;
    const occupied = Math.max(assigned, r.isAvailable === false ? beds : assigned);
    totalBeds += beds;
    occupiedBeds += occupied;
  }
  return {
    totalBeds,
    occupiedBeds,
    vacantBeds: Math.max(0, totalBeds - occupiedBeds),
    occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    totalRooms: rooms.length,
  };
}

module.exports = {
  normalizeOwnerId,
  getOwnerProperties,
  fetchTenantsForReport,
  fetchRoomsForReport,
  formatTenantRow,
  formatDuesRow,
  formatOccupancyRow,
  calcOccupancyKpis,
  buildTenantFilter,
};
