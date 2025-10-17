const mongoose = require('mongoose');

const wardSchema = new mongoose.Schema({
  wardNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 50
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  population: {
    type: Number,
    default: 0
  },
  area: {
    type: String,
    trim: true
  },
  representative: {
    name: {
      type: String,
      trim: true
    },
    contact: {
      type: String,
      trim: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for active problems count
wardSchema.virtual('activeProblemsCount', {
  ref: 'Problem',
  localField: 'wardNumber',
  foreignField: 'wardNumber',
  count: true,
  match: { status: { $in: ['Open', 'In Progress'] } }
});

// Virtual for total problems count
wardSchema.virtual('totalProblemsCount', {
  ref: 'Problem',
  localField: 'wardNumber',
  foreignField: 'wardNumber',
  count: true
});

module.exports = mongoose.model('Ward', wardSchema);
