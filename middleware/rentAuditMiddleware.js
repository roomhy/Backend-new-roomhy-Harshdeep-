'use strict';
const RentAuditLog = require('../models/RentAuditLog');

// Attach req.logAudit() helper to every request on rent-collection routes
function rentAuditMiddleware(req, res, next) {
  req.logAudit = async (action, meta = {}) => {
    try {
      await RentAuditLog.create({
        action,
        invoiceId:  meta.invoiceId,
        tenantId:   meta.tenantId,
        ownerId:    meta.ownerId,
        propertyId: meta.propertyId,
        performedBy: req.user?.loginId || req.headers['x-owner-id'] || 'unknown',
        meta,
      });
    } catch (_) { /* best effort */ }
  };
  next();
}

// Standalone helper for use outside middleware context
async function logAudit(action, meta = {}, performedBy = 'system') {
  try {
    await RentAuditLog.create({
      action,
      invoiceId:  meta.invoiceId,
      tenantId:   meta.tenantId,
      ownerId:    meta.ownerId,
      propertyId: meta.propertyId,
      performedBy,
      meta,
    });
  } catch (_) { /* best effort */ }
}

module.exports = { rentAuditMiddleware, logAudit };
