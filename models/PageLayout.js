const mongoose = require('mongoose');

const PageLayoutSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, unique: true, index: true }, // e.g. 'home', 'about', etc.
    sections: [
      {
        id: { type: String, required: true }, // e.g. 'hero', 'testimonials'
        name: { type: String, required: true }, // e.g. 'Hero Banner'
        type: { type: String, required: true }, // e.g. 'hero', 'testimonials', 'faq'
        visible: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        content: { type: mongoose.Schema.Types.Mixed, default: {} } // Content JSON data
      }
    ],
    updatedBy: { type: String, default: 'superadmin' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PageLayout', PageLayoutSchema);
