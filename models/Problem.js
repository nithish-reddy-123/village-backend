const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Water Supply',
      'Electricity',
      'Roads & Transportation',
      'Waste Management',
      'Healthcare',
      'Education',
      'Security',
      'Environment',
      'Infrastructure',
      'Other'
    ]
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'Open'
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  wardNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  images: [{
    type: String, // URLs to uploaded images
    default: []
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  estimatedResolutionDate: {
    type: Date,
    default: null
  },
  isPublic: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
problemSchema.index({ wardNumber: 1, status: 1 });
problemSchema.index({ reportedBy: 1 });
problemSchema.index({ createdAt: -1 });

// Virtual for days since reported
problemSchema.virtual('daysSinceReported').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Method to update status
problemSchema.methods.updateStatus = function(newStatus, adminNotes = null) {
  this.status = newStatus;
  if (adminNotes) {
    this.adminNotes = adminNotes;
  }
  if (newStatus === 'Resolved' || newStatus === 'Closed') {
    this.resolvedAt = new Date();
  }
  return this.save();
};

module.exports = mongoose.model('Problem', problemSchema);
