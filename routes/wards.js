const express = require('express');
const { body, validationResult } = require('express-validator');
const Ward = require('../models/Ward');
const Problem = require('../models/Problem');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/wards
// @desc    Get all wards
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const wards = await Ward.find({ isActive: true }).sort({ wardNumber: 1 });
    
    // Add problem counts for each ward
    const wardsWithStats = await Promise.all(
      wards.map(async (ward) => {
        const activeProblems = await Problem.countDocuments({
          wardNumber: ward.wardNumber,
          status: { $in: ['Open', 'In Progress'] }
        });
        
        const totalProblems = await Problem.countDocuments({
          wardNumber: ward.wardNumber
        });

        return {
          ...ward.toObject(),
          activeProblems,
          totalProblems
        };
      })
    );

    res.json({ wards: wardsWithStats });
  } catch (error) {
    console.error('Get wards error:', error);
    res.status(500).json({ message: 'Server error while fetching wards' });
  }
});

// @route   GET /api/wards/:wardNumber
// @desc    Get specific ward details
// @access  Private
router.get('/:wardNumber', auth, async (req, res) => {
  try {
    const wardNumber = parseInt(req.params.wardNumber);
    
    const ward = await Ward.findOne({ wardNumber, isActive: true });
    if (!ward) {
      return res.status(404).json({ message: 'Ward not found' });
    }

    // Get recent problems for this ward
    const recentProblems = await Problem.find({ wardNumber })
      .populate('reportedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get problem statistics
    const stats = await Problem.aggregate([
      { $match: { wardNumber } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      ward,
      recentProblems,
      stats
    });
  } catch (error) {
    console.error('Get ward details error:', error);
    res.status(500).json({ message: 'Server error while fetching ward details' });
  }
});

// @route   POST /api/wards
// @desc    Create a new ward (Admin only)
// @access  Private (Admin)
router.post('/', adminAuth, [
  body('wardNumber').isInt({ min: 1, max: 50 }).withMessage('Ward number must be between 1 and 50'),
  body('name').trim().isLength({ min: 2 }).withMessage('Ward name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('population').optional().isInt({ min: 0 }).withMessage('Population must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { wardNumber, name, description, population, area, representative } = req.body;

    // Check if ward already exists
    const existingWard = await Ward.findOne({ wardNumber });
    if (existingWard) {
      return res.status(400).json({ message: 'Ward with this number already exists' });
    }

    const ward = new Ward({
      wardNumber,
      name,
      description,
      population,
      area,
      representative
    });

    await ward.save();

    res.status(201).json({
      message: 'Ward created successfully',
      ward
    });
  } catch (error) {
    console.error('Create ward error:', error);
    res.status(500).json({ message: 'Server error while creating ward' });
  }
});

// @route   PUT /api/wards/:wardNumber
// @desc    Update ward details (Admin only)
// @access  Private (Admin)
router.put('/:wardNumber', adminAuth, [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Ward name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('population').optional().isInt({ min: 0 }).withMessage('Population must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const wardNumber = parseInt(req.params.wardNumber);
    const updates = req.body;

    const ward = await Ward.findOneAndUpdate(
      { wardNumber },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!ward) {
      return res.status(404).json({ message: 'Ward not found' });
    }

    res.json({
      message: 'Ward updated successfully',
      ward
    });
  } catch (error) {
    console.error('Update ward error:', error);
    res.status(500).json({ message: 'Server error while updating ward' });
  }
});

// @route   GET /api/wards/:wardNumber/problems
// @desc    Get problems for a specific ward
// @access  Private
router.get('/:wardNumber/problems', auth, async (req, res) => {
  try {
    const wardNumber = parseInt(req.params.wardNumber);
    
    // Check if user can access this ward's problems
    if (req.user.role !== 'admin' && wardNumber !== req.user.wardNumber) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { status, category, page = 1, limit = 10 } = req.query;
    
    let query = { wardNumber };
    
    if (status) {
      query.status = status;
    }
    
    if (category) {
      query.category = category;
    }

    const problems = await Problem.find(query)
      .populate('reportedBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Problem.countDocuments(query);

    res.json({
      problems,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get ward problems error:', error);
    res.status(500).json({ message: 'Server error while fetching ward problems' });
  }
});

module.exports = router;
