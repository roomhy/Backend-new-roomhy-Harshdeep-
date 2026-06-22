/**
 * DEPRECATED: This service has been deprecated in favor of the provider-agnostic
 * aiModerationService.js (file:///d:/hello-roomhy/Roomhy-Backend/services/aiModerationService.js).
 * Please import and use aiModerationService instead.
 */

const aiModerationService = require('./aiModerationService');

module.exports = {
    moderateMessage: aiModerationService.moderateMessage
};
