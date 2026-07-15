const express = require('express');
const router = express.Router();
const seoController = require('../controllers/seoController');

// Resolved metadata endpoint (used by client-side hooks, SSR, sitemaps, etc.)
router.get('/metadata', seoController.getSeoMetadata);

// Generic CRUD endpoints for pages (compatible with future SEO Editor Panel)
router.get('/pages', seoController.getPages);
router.post('/pages/register', seoController.registerPage);
router.put('/pages/:pageKey', seoController.updatePageByKey);
router.delete('/pages/:pageKey', seoController.deletePageByKey);

// Redirect configuration endpoint
router.post('/redirects', seoController.createRedirect);

module.exports = router;
