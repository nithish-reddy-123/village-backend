const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const problemRoutes = require('./routes/problems');
const wardRoutes = require('./routes/wards');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/swatch_village')
.then(() => {
  console.log('Connected to MongoDB');
  
  // Initialize default data
  initializeDefaultData();
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/wards', wardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join ward-specific room
  socket.on('join-ward', (wardNumber) => {
    socket.join(`ward-${wardNumber}`);
    console.log(`User ${socket.id} joined ward ${wardNumber}`);
  });

  // Handle problem status updates
  socket.on('problem-status-update', (data) => {
    // Broadcast to all users in the ward
    io.to(`ward-${data.wardNumber}`).emit('problem-updated', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Initialize default data
async function initializeDefaultData() {
  const Ward = require('./models/Ward');
  
  try {
    // Create default wards if they don't exist
    const wardCount = await Ward.countDocuments();
    if (wardCount === 0) {
      const defaultWards = [];
      
      for (let i = 1; i <= 10; i++) {
        defaultWards.push({
          wardNumber: i,
          name: `Ward ${i}`,
          description: `Area ${i} of Swatch Village`,
          population: Math.floor(Math.random() * 1000) + 500,
          area: `${Math.floor(Math.random() * 5) + 2} sq km`,
          representative: {
            name: `Representative ${i}`,
            contact: `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`
          }
        });
      }
      
      await Ward.insertMany(defaultWards);
      console.log('Default wards created successfully');
    }

    // Create admin user if it doesn't exist
    const User = require('./models/User');
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const adminUser = new User({
        name: 'Admin User',
        email: 'admin@swatchvillage.com',
        password: 'admin123', // This will be hashed automatically
        wardNumber: 1,
        phone: '9999999999',
        address: 'Administrative Office',
        role: 'admin'
      });
      
      await adminUser.save();
      console.log('Admin user created successfully');
      console.log('Admin credentials: admin@swatchvillage.com / admin123');
    }
  } catch (error) {
    console.error('Error initializing default data:', error);
  }
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
