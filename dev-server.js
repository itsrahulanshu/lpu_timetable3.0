#!/usr/bin/env node

/**
 * Local Development Server
 * Runs the Express app locally for testing
 */

require('dotenv').config();

const app = require('./api/index.js');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  🚀 LPU Timetable - Development Server Running        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`📍 Local:     http://localhost:${PORT}`);
  console.log(`📍 Network:   http://0.0.0.0:${PORT}`);
  console.log('\n📚 API Endpoints:');
  console.log(`   GET  /api/status      - Server status`);
  console.log(`   GET  /api/timetable   - Get cached timetable`);
  console.log(`   POST /api/refresh     - Refresh timetable\n`);
  console.log('Press Ctrl+C to stop\n');
});
