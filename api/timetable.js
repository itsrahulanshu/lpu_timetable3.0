// api/timetable.js - Serverless function for fetching cached timetable
const CacheManager = require('../src/modules/cache.js');

// Singleton cache manager instance (reused across warm function calls)
let cacheManager;

const getCacheManager = () => {
  if (!cacheManager) {
    cacheManager = new CacheManager();
  }
  return cacheManager;
};

const handler = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const cache = getCacheManager();
    const cacheData = await cache.loadTimetableCache();
    
    if (!cacheData || !cacheData.data) {
      return res.status(404).json({ 
        success: false, 
        error: 'No timetable data. Please refresh first.',
        hint: 'Click the refresh button (🔄) to fetch your timetable.'
      });
    }

    // Import TimetableManager for processing
    const TimetableManager = require('../src/modules/timetable.js');
    const AuthManager = require('../src/modules/auth.js');
    
    const authManager = new AuthManager();
    const timetableManager = new TimetableManager(authManager);
    
    const processedData = cacheData.data.map(classItem => 
      timetableManager.processClassItem(classItem)
    );
    
    // Use the original cache timestamp, don't create a new one!
    const cacheTimestamp = cacheData.timestamp || new Date(cacheData.lastUpdate || Date.now()).toISOString();
    
    res.status(200).json({ 
      success: true, 
      data: processedData, 
      cached: true,
      timestamp: cacheTimestamp,
      classCount: processedData.length
    });
  } catch (error) {
    console.error('❌ Error fetching timetable:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = handler;
