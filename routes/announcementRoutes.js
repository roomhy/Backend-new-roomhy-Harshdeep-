const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/owner/:ownerLoginId', protect, authorize('tenant', 'owner', 'superadmin', 'areamanager', 'employee', 'manager'), announcementController.getAnnouncementsByOwner);
router.post('/', protect, authorize('superadmin', 'areamanager'), announcementController.createAnnouncement);
router.delete('/:id', protect, authorize('superadmin', 'areamanager'), announcementController.deleteAnnouncement);

module.exports = router;
