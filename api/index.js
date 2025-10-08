/**
 * Main Express Application Entry Point
 * Handles all routes as a serverless Express app on Vercel
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// Import route handlers
const statusHandler = require('./status.js');
const timetableHandler = require('./timetable.js');
const refreshHandler = require('./refresh.js');

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// API Routes
app.get('/api/status', statusHandler);
app.get('/api/timetable', timetableHandler);
app.post('/api/refresh', refreshHandler);
app.get('/api/refresh', refreshHandler);

// Static file serving
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));
app.use(express.static(path.join(__dirname, '../public'), {
  extensions: ['html', 'htm']
}));

// Serve index.html for root and any non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  try {
    const indexPath = path.join(__dirname, '../public/index.html');
    
    if (!fs.existsSync(indexPath)) {
      return res.status(500).send('Application not properly configured');
    }
    
    const html = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('Server error: ' + error.message);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Export for Vercel serverless
module.exports = app;
