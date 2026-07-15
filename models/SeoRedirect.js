const mongoose = require('mongoose');

const SeoRedirectSchema = new mongoose.Schema(
    {
        oldUrl: { type: String, required: true, unique: true, trim: true, index: true },
        newUrl: { type: String, required: true, trim: true },
        statusCode: { type: Number, default: 301 } // 301 (Permanent), 302 (Temporary)
    },
    { 
        timestamps: true 
    }
);

module.exports = mongoose.model('SeoRedirect', SeoRedirectSchema);
