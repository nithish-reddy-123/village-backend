const express = require('express');
const { body, validationResult } = require('express-validator');
const Problem = require('../models/Problem');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/problems
// @desc    Report a new problem
// @access  Private
router.post('/', auth, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters'),
  body('category').isIn([
    'Water Supply', 'Electricity', 'Roads & Transportation', 'Waste Management',
    'Healthcare', 'Education', 'Security', 'Environment', 'Infrastructure', 'Other'
  ]).withMessage('Invalid category'),
  body('location').trim().isLength({ min: 5 }).withMessage('Location must be at least 5 characters'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid priority')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, category, location, priority, images } = req.body;

    const problem = new Problem({
      title,
      description,
      category,
      location,
      priority: priority || 'Medium',
      reportedBy: req.user._id,
      wardNumber: req.user.wardNumber,
      images: images || []
    });

    await problem.save();
    await problem.populate('reportedBy', 'name email');

    // Emit real-time notification for new problem
    const io = req.app.get('io');
    if (io) {
      io.to(`ward-${problem.wardNumber}`).emit('new-problem', {
        problem: {
          _id: problem._id,
          title: problem.title,
          wardNumber: problem.wardNumber
        },
        wardNumber: problem.wardNumber
      });
    }

    res.status(201).json({
      message: 'Problem reported successfully',
      problem
    });
  } catch (error) {
    console.error('Report problem error:', error);
    res.status(500).json({ message: 'Server error while reporting problem' });
  }
});

// @route   GET /api/problems
// @desc    Get problems (filtered by user role and ward)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, category, wardNumber, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    // If user is not admin, only show problems from their ward
    if (req.user.role !== 'admin') {
      query.wardNumber = req.user.wardNumber;
    } else if (wardNumber) {
      query.wardNumber = parseInt(wardNumber);
    }
    
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
    console.error('Get problems error:', error);
    res.status(500).json({ message: 'Server error while fetching problems' });
  }
});

// @route   GET /api/problems/:id
// @desc    Get single problem
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id)
      .populate('reportedBy', 'name email')
      .populate('assignedTo', 'name email');

    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Check if user can access this problem
    if (req.user.role !== 'admin' && problem.wardNumber !== req.user.wardNumber) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ problem });
  } catch (error) {
    console.error('Get problem error:', error);
    res.status(500).json({ message: 'Server error while fetching problem' });
  }
});

// @route   PUT /api/problems/:id/status
// @desc    Update problem status (Admin only)
// @access  Private (Admin)
router.put('/:id/status', adminAuth, [
  body('status').isIn(['Open', 'In Progress', 'Resolved', 'Closed']).withMessage('Invalid status'),
  body('adminNotes').optional().isLength({ max: 500 }).withMessage('Admin notes must be less than 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, adminNotes, assignedTo } = req.body;

    const problem = await Problem.findById(req.params.id);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Update problem status
    await problem.updateStatus(status, adminNotes);

    // Assign problem if provided
    if (assignedTo) {
      problem.assignedTo = assignedTo;
      await problem.save();
    }

    await problem.populate('reportedBy', 'name email');
    await problem.populate('assignedTo', 'name email');

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`ward-${problem.wardNumber}`).emit('problem-updated', {
        problem: {
          _id: problem._id,
          title: problem.title,
          status: problem.status,
          wardNumber: problem.wardNumber
        }
      });
    }

    res.json({
      message: 'Problem status updated successfully',
      problem
    });
  } catch (error) {
    console.error('Update problem status error:', error);
    res.status(500).json({ message: 'Server error while updating problem' });
  }
});

// @route   GET /api/problems/stats/summary
// @desc    Get problem statistics
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    let matchQuery = {};
    
    if (req.user.role !== 'admin') {
      matchQuery.wardNumber = req.user.wardNumber;
    }

    const stats = await Problem.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = await Problem.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const wardStats = await Problem.aggregate([
      { $match: req.user.role === 'admin' ? {} : { wardNumber: req.user.wardNumber } },
      {
        $group: {
          _id: '$wardNumber',
          count: { $sum: 1 },
          open: {
            $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
          },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      statusStats: stats,
      categoryStats,
      wardStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error while fetching statistics' });
  }
});

module.exports = router;
