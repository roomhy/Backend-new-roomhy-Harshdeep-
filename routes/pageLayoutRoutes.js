const express = require('express');
const router = express.Router();
const pageLayoutController = require('../controllers/pageLayoutController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Get layout (Public - so website can load sections)
router.get('/:pageKey', pageLayoutController.getPageLayout);

// Update layout (Superadmin only)
router.put('/:pageKey', protect, authorize('superadmin'), pageLayoutController.updatePageLayout);

module.exports = router;
