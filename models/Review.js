const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // ─── BOOKING ELIGIBILITY FIELDS (Core Business Rule) ─────────────────────
  // A review can only exist if booking is Confirmed AND move-in is Completed
  bookingId: {
    type: String,
    required: [true, 'Booking ID is required for verified stay reviews'],
    index: true
  },
  tenantId: {
    type: String,
    required: [true, 'Tenant ID is required'],
    index: true
  },
  ownerId: {
    type: String,
    required: [true, 'Owner ID is required'],
    index: true
  },
  moveInDate: {
    type: Date,
    default: null
  },
  reviewDate: {
    type: Date,
    default: Date.now
  },

  // ─── PROPERTY REFERENCE ──────────────────────────────────────────────────
  propertyId: {
    type: String,
    required: [true, 'Property ID is required'],
    index: true
  },
  propertyName: {
    type: String,
    required: true
  },
  propertyLocation: {
    type: String,
    default: ''
  },

  // ─── REVIEWER DETAILS ────────────────────────────────────────────────────
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  avatar: {
    type: String,
    default: null
  },

  // ─── REVIEW CONTENT ──────────────────────────────────────────────────────
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  review: {
    type: String,
    required: [true, 'Review text is required'],
    trim: true,
    maxlength: [1000, 'Review cannot exceed 1000 characters']
  },
  designation: {
    type: String,
    default: 'Tenant',
    trim: true
  },
  location: {
    type: String,
    default: '',
    trim: true
  },

  // ─── VERIFICATION ────────────────────────────────────────────────────────
  isVerifiedStay: {
    // TRUE only when booking.status=Confirmed AND move_in_status=Completed
    type: Boolean,
    default: false
  },
  isVerified: {
    // Legacy field kept for backward compat
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },

  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Hidden', 'Active', 'Inactive', 'Pending Review'],
    default: 'Pending'
  },
  moderationStatus: {
    type: String,
    enum: ['pending', 'flagged', 'approved', 'rejected', 'hidden', null],
    default: 'pending'
  },
  moderationNotes: {
    type: String,
    default: ''
  },
  moderatedBy: {
    type: String,
    default: null
  },
  moderatedAt: {
    type: Date,
    default: null
  },

  // Automatic violation detection results
  flaggedViolations: [{
    type: String,
    enum: ['spam', 'duplicate', 'abuse', 'fake', 'suspicious']
  }],
  flagSeverity: {
    type: String,
    enum: ['low', 'medium', 'high', null],
    default: null
  },

  // ─── TIMESTAMPS ──────────────────────────────────────────────────────────
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ─── INDEXES ─────────────────────────────────────────────────────────────────
reviewSchema.index({ propertyId: 1, tenantId: 1 }); // one review per booking enforced at API level
reviewSchema.index({ moderationStatus: 1, createdAt: -1 });
reviewSchema.index({ isVerifiedStay: 1, rating: -1 });
reviewSchema.index({ createdAt: -1 });

// ─── HOOKS ───────────────────────────────────────────────────────────────────
reviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Sync legacy field
  if (this.isVerifiedStay) this.isVerified = true;
  next();
});

// ─── STATIC METHODS ──────────────────────────────────────────────────────────
const PUBLIC_REVIEW_FIELDS = '-email -userId';

reviewSchema.statics.getFeaturedReviews = function(limit = 6) {
  return this.find({ isFeatured: true, status: { $in: ['Approved', 'Active'] }, isVerifiedStay: true })
    .select(PUBLIC_REVIEW_FIELDS)
    .sort({ createdAt: -1 })
    .limit(limit);
};

reviewSchema.statics.getRecentReviews = function(limit = 10) {
  return this.find({ status: { $in: ['Approved', 'Active'] } })
    .select(PUBLIC_REVIEW_FIELDS)
    .sort({ createdAt: -1 })
    .limit(limit);
};

reviewSchema.statics.getReviewsByRating = function(minRating = 4, limit = 10) {
  return this.find({ rating: { $gte: minRating }, status: { $in: ['Approved', 'Active'] } })
    .select(PUBLIC_REVIEW_FIELDS)
    .sort({ rating: -1, createdAt: -1 })
    .limit(limit);
};

reviewSchema.statics.getAverageRating = function() {
  return this.aggregate([
    { $match: { status: { $in: ['Approved', 'Active'] }, rating: { $gt: 0 } } },
    { $group: { _id: null, avgRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
  ]);
};

reviewSchema.statics.getPropertyReviews = function(propertyId, limit = 50) {
  return this.find({ propertyId, status: { $in: ['Approved', 'Active'] } })
    .select(PUBLIC_REVIEW_FIELDS)
    .sort({ createdAt: -1 })
    .limit(limit);
};

reviewSchema.statics.getPropertyAverageRating = function(propertyId) {
  return this.aggregate([
    { $match: { propertyId, status: { $in: ['Approved', 'Active'] }, rating: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
      }
    }
  ]);
};

reviewSchema.statics.hasUserReviewed = function(propertyId, userId) {
  return this.findOne({ propertyId, userId, status: { $in: ['Approved', 'Pending', 'Active'] } });
};

// NEW: Check if tenant is eligible to review (booking confirmed + moved in)
reviewSchema.statics.checkEligibility = async function(tenantId, bookingId) {
  const BookingRequest = require('./BookingRequest');
  const booking = await BookingRequest.findOne({ _id: bookingId });
  if (!booking) return { eligible: false, reason: 'Booking not found' };
  if (booking.user_id !== tenantId && booking.userId !== tenantId) return { eligible: false, reason: 'Tenant does not match booking' };
  if (!['confirmed', 'active', 'completed'].includes(booking.booking_status?.toLowerCase())) return { eligible: false, reason: 'Booking is not confirmed' };
  const existing = await this.findOne({ bookingId, tenantId });
  if (existing) return { eligible: false, reason: 'Review already submitted for this booking' };
  return { eligible: true };
};

module.exports = mongoose.model('Review', reviewSchema);
