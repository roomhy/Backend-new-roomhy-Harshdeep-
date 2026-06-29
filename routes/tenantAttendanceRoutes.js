const express = require('express');
const router = express.Router();
const tenantAttendanceController = require('../controllers/tenantAttendanceController');
const { protect } = require('../middleware/authMiddleware');

// Add protection middleware
router.use(protect);

router.get('/', tenantAttendanceController.getOwnerTenantAttendance);
router.post('/', tenantAttendanceController.updateTenantStatus);
router.get('/owner/:ownerLoginId', tenantAttendanceController.getOwnerTenantAttendance);
router.post('/update', tenantAttendanceController.updateTenantStatus);
router.post('/sync', tenantAttendanceController.syncTenantAttendance);

module.exports = router;
