const mongoose = require('mongoose');

/**
 * ProcessedWebhookEvent
 * Stores processed Razorpay webhook event IDs to prevent duplicate processing.
 */
const processedWebhookEventSchema = new mongoose.Schema({
    eventId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    processedAt: { 
        type: Date, 
        default: Date.now,
        expires: '7d' // Automatically clean up event records after 7 days
    }
}, { collection: 'processed_webhook_events' });

module.exports = mongoose.model('ProcessedWebhookEvent', processedWebhookEventSchema);
