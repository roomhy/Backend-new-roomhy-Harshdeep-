// paymentController.js – Handles payment‑link generation and payment confirmation for owners
// No owner‑panel notifications are sent when a link is generated. Notifications are sent after payment is confirmed.

const Notification = require('../models/Notification');
const Room = require('../models/Room');
const User = require('../models/user');
const Tenant = require('../models/Tenant');

// Existing sendPaymentLink (unchanged) – generates a link for the tenant
exports.sendPaymentLink = async (req, res) => {
  try {
    const { roomId } = req.params;
    const owner = req.user;
    if (!owner) return res.status(401).json({ success: false, message: 'Auth required' });
    if (owner.role !== 'owner') return res.status(403).json({ success: false, message: 'Only owners can send payment links' });

    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (String(room.ownerLoginId).toUpperCase() !== String(owner.loginId || '').toUpperCase()) {
      return res.status(403).json({ success: false, message: 'You do not own this room' });
    }

    const tenantId = (room.bedAssignments && room.bedAssignments.find(b => b.tenantId))?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No tenant assigned to this room' });

    const baseUrl = process.env.PAYMENT_URL || process.env.APP_BASE_URL || 'https://app.roomhy.com';
    const paymentLink = `${baseUrl}/pay?roomId=${room._id}&tenantId=${tenantId}`;

    // Record a notification for superadmin(s) – link generated
    try {
      const superAdmins = await User.find({ role: 'superadmin' }).lean();
      const notifPromises = superAdmins.map(sa => Notification.create({
        toRole: 'superadmin',
        toLoginId: sa.loginId || '',
        from: String(owner.loginId || owner._id),
        type: 'payment_link_generated',
        meta: { roomId: room._id, tenantId, paymentLink }
      }));
      await Promise.all(notifPromises);
    } catch (notifErr) {
      console.warn('Failed to create superadmin notification for payment link:', notifErr.message);
    }

    return res.json({ success: true, paymentLink });
  } catch (err) {
    console.error('sendPaymentLink error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// New endpoint – owner confirms that tenant has paid. Creates notification for owner and schedules admin payment.
exports.confirmDepositPayment = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { moveInDate } = req.body; // optional ISO date string
    const owner = req.user;
    if (!owner) return res.status(401).json({ success: false, message: 'Auth required' });
    if (owner.role !== 'owner') return res.status(403).json({ success: false, message: 'Only owners can confirm payment' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (String(room.ownerLoginId).toUpperCase() !== String(owner.loginId || '').toUpperCase()) {
      return res.status(403).json({ success: false, message: 'You do not own this room' });
    }

    // Locate tenant assigned to this room (first occupied bed)
    const tenantId = (room.bedAssignments && room.bedAssignments.find(b => b.tenantId))?.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No tenant assigned to this room' });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    // Mark payment as received
    tenant.paymentStatus = 'received';
    if (moveInDate) tenant.moveInDate = new Date(moveInDate);
    await tenant.save();

    // Notification to owner – payment received, will be transferred to superadmin after move‑in
    await Notification.create({
      toRole: 'owner',
      toLoginId: String(owner.loginId),
      from: 'system',
      type: 'payment_received',
      meta: { roomId: room._id, tenantId: tenant._id, moveInDate: tenant.moveInDate }
    });

    // Notification to superadmin – pending transfer after move‑in date
    const superAdmins = await User.find({ role: 'superadmin' }).lean();
    const adminNotifs = superAdmins.map(sa => Notification.create({
      toRole: 'superadmin',
      toLoginId: sa.loginId || '',
      from: String(owner.loginId),
      type: 'owner_payment_pending',
      meta: { roomId: room._id, tenantId: tenant._id, moveInDate: tenant.moveInDate }
    }));
    await Promise.all(adminNotifs);
    // Notify admin that payment will be transferred after move‑in
    await Notification.create({
      toRole: 'admin',
      toLoginId: 'admin', // adjust if multiple admins exist
      from: String(owner.loginId),
      type: 'owner_payment_pending',
      meta: { roomId: room._id, tenantId: tenant._id, moveInDate: tenant.moveInDate }
    });

    return res.json({ success: true, tenant });
  } catch (err) {
    console.error('confirmDepositPayment error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
