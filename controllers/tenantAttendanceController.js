const TenantAttendance = require('../models/TenantAttendance');
const Tenant = require('../models/Tenant');

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
        
        let finalTenantId = tenantId;
        let finalTenantName = tenantName;
        let finalRoomNo = roomNo;
        
        // Find tenant document if missing info
        let tenantDoc = null;
        if (finalTenantId) {
            tenantDoc = await Tenant.findById(finalTenantId);
        } else if (tenantLoginId) {
            tenantDoc = await Tenant.findOne({ loginId: tenantLoginId });
        }
        
        if (tenantDoc) {
            finalTenantId = tenantDoc._id;
            finalTenantName = tenantDoc.name;
            finalRoomNo = tenantDoc.roomNo || 'N/A';
        }
        
        if (!finalTenantId) {
            return res.status(400).json({ success: false, message: 'Tenant identity not found' });
        }

        const finalDate = date || new Date().toISOString().split('T')[0];

        // Upsert the attendance record for the tenant on this specific date
        const attendance = await TenantAttendance.findOneAndUpdate(
            { tenantId: finalTenantId, date: finalDate },
            {
                ownerLoginId: String(ownerLoginId || tenantDoc?.ownerLoginId || '').toUpperCase(),
                tenantId: finalTenantId,
                tenantName: finalTenantName,
                roomNo: finalRoomNo || 'N/A',
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
            const exists = await TenantAttendance.findOne({ tenantId: t.id, date: todayStr });
            if (!exists) {
                await TenantAttendance.create({
                    ownerLoginId: String(ownerLoginId).toUpperCase(),
                    tenantId: t.id,
                    tenantName: t.name,
                    roomNo: t.room || 'N/A',
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
}
