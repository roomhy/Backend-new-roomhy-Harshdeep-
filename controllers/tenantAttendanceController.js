const TenantAttendance = require('../models/TenantAttendance');
const Tenant = require('../models/Tenant');
const mongoose = require('mongoose');

// Helper to resolve tenant document by ID, Login ID, Email, or Phone
async function resolveTenant(identifier) {
    if (!identifier) return null;
    
    // Check if it is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(identifier)) {
        const tenant = await Tenant.findById(identifier);
        if (tenant) return tenant;
    }
    
    // Otherwise look up by loginId, email, or phone
    const tenant = await Tenant.findOne({
        $or: [
            { loginId: String(identifier).toUpperCase() },
            { email: identifier },
            { phone: identifier }
        ]
    });
    return tenant;
}

// Get current attendance status for all tenants of an owner
exports.getOwnerTenantAttendance = async (req, res) => {
    try {
        const ownerLoginId = req.params.ownerLoginId || req.query.ownerLoginId;
        const date = req.query.date;

        let query = {};
        if (ownerLoginId) {
            query.ownerLoginId = { $regex: new RegExp('^' + ownerLoginId + '$', 'i') };
        }
        if (date) {
            query.date = date;
        }

        const attendance = await TenantAttendance.find(query).lean();

        // For backward compatibility and frontend expectations, return both keys
        res.json({ success: true, data: attendance, attendance });
    } catch (err) {
        console.error("Get Tenant Attendance Error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update or create tenant attendance record
exports.updateTenantStatus = async (req, res) => {
    try {
        const { ownerLoginId, tenantLoginId, tenantId, tenantName, roomNo, status, date } = req.body;
        
        const tenantDoc = await resolveTenant(tenantId || tenantLoginId);
        if (!tenantDoc) {
            return res.status(400).json({ success: false, message: 'Tenant identity not found' });
        }
        
        const finalTenantId = tenantDoc._id;
        const finalTenantName = tenantDoc.name;
        const finalRoomNo = tenantDoc.roomNo || roomNo || 'N/A';
        const finalDate = date || new Date().toISOString().split('T')[0];

        // Upsert the attendance record for the tenant on this specific date
        const attendance = await TenantAttendance.findOneAndUpdate(
            { tenantId: finalTenantId, date: finalDate },
            {
                ownerLoginId: String(ownerLoginId || tenantDoc.ownerLoginId || '').toUpperCase(),
                tenantId: finalTenantId,
                tenantName: finalTenantName,
                roomNo: finalRoomNo,
                status,
                date: finalDate,
                lastScanTime: new Date()
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, attendance });
    } catch (err) {
        console.error("Update Tenant Status Error:", err);
        res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
};

// Sync attendance records with active tenants
exports.syncTenantAttendance = async (req, res) => {
    try {
        const { ownerLoginId } = req.body;
        const tenants = req.body.tenants || []; // Array of { id, name, room }

        let count = 0;
        const todayStr = new Date().toISOString().split('T')[0];
        
        for (const t of tenants) {
            const tenantDoc = await resolveTenant(t.id || t.tenantId);
            if (!tenantDoc) continue;

            const exists = await TenantAttendance.findOne({ tenantId: tenantDoc._id, date: todayStr });
            if (!exists) {
                await TenantAttendance.create({
                    ownerLoginId: String(ownerLoginId).toUpperCase(),
                    tenantId: tenantDoc._id,
                    tenantName: tenantDoc.name,
                    roomNo: tenantDoc.roomNo || t.room || 'N/A',
                    date: todayStr,
                    status: 'Inside' // Default state
                });
                count++;
            }
        }

        res.json({ success: true, message: `Synced ${count} new tenants.` });
    } catch (err) {
        console.error("Sync Tenant Attendance Error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Bulk update tenant attendance
exports.bulkUpdateTenantStatus = async (req, res) => {
    try {
        const { ownerLoginId, date, status, tenantIds, tenantDataList } = req.body;
        if (!ownerLoginId || !status || (!tenantIds && !tenantDataList)) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const finalDate = date || new Date().toISOString().split('T')[0];
        const bulkOps = [];

        // Support passing either an array of tenantIds or tenantDataList (objects with id, name, roomNo)
        const tenants = tenantDataList || (tenantIds ? tenantIds.map(id => ({ id })) : []);

        for (const t of tenants) {
            const tenantDoc = await resolveTenant(t.id || t.tenantId || t._id);
            if (!tenantDoc) continue;

            const finalTenantId = tenantDoc._id;
            const finalTenantName = tenantDoc.name;
            const finalRoomNo = tenantDoc.roomNo || t.roomNo || 'N/A';

            bulkOps.push({
                updateOne: {
                    filter: { tenantId: finalTenantId, date: finalDate },
                    update: {
                        $set: {
                            ownerLoginId: String(ownerLoginId).toUpperCase(),
                            tenantId: finalTenantId,
                            tenantName: finalTenantName,
                            roomNo: finalRoomNo,
                            status: status,
                            date: finalDate,
                            lastScanTime: new Date()
                        }
                    },
                    upsert: true
                }
            });
        }

        if (bulkOps.length > 0) {
            await TenantAttendance.bulkWrite(bulkOps);
        }

        res.json({ success: true, message: `Updated ${bulkOps.length} records to ${status}` });
    } catch (err) {
        console.error("Bulk Update Tenant Status Error:", err);
        res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
};
