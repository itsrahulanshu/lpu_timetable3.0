// api/refresh.js - Serverless function for refreshing timetable
const AuthManager = require('../src/modules/auth.js');
const TimetableManager = require('../src/modules/timetable.js');
const CacheManager = require('../src/modules/cache.js');
const NotificationManager = require('../src/modules/notifications.js');

// Singleton instances (reused across warm function calls)
let authManager, timetableManager, cacheManager, notificationManager;

const getManagers = () => {
  if (!authManager) {
    authManager = new AuthManager();
    timetableManager = new TimetableManager(authManager);
    cacheManager = new CacheManager();
    notificationManager = new NotificationManager();
  }
  return { authManager, timetableManager, cacheManager, notificationManager };
};

const handler = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('🔄 Refresh requested at:', new Date().toISOString());
    
    const managers = getManagers();
    
    // Check rate limit: 10 minutes between refreshes
    const cacheData = await managers.cacheManager.loadTimetableCache();
    if (cacheData && (cacheData.lastUpdate || cacheData.timestamp)) {
      // Use lastUpdate (milliseconds) for accurate rate limiting, fallback to timestamp
      const lastUpdateMs = cacheData.lastUpdate || new Date(cacheData.timestamp).getTime();
      const now = Date.now();
      const diffMs = now - lastUpdateMs;
      const diffMinutes = Math.floor(diffMs / 60000);
      const RATE_LIMIT_MINUTES = 10;
      
      console.log(`📊 Last update was ${diffMinutes} minutes ago (${new Date(lastUpdateMs).toISOString()})`);
      
      if (diffMinutes < RATE_LIMIT_MINUTES) {
        const remainingMs = (RATE_LIMIT_MINUTES * 60000) - diffMs;
        const remainingMinutes = Math.floor(remainingMs / 60000);
        const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
        
        console.log(`⏱️ Rate limit: ${remainingMinutes} min ${remainingSeconds} sec remaining`);
        
        return res.status(429).json({
          success: false,
          rateLimited: true,
          message: `Please wait ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''} before refreshing again`,
          remainingTime: {
            minutes: remainingMinutes,
            seconds: remainingSeconds,
            totalSeconds: Math.floor(remainingMs / 1000)
          },
          lastUpdated: new Date(lastUpdateMs).toISOString(),
          nextRefreshAllowed: new Date(lastUpdateMs + (RATE_LIMIT_MINUTES * 60000)).toISOString()
        });
      }
    }
    
    // Fetch fresh data
    const freshData = await managers.timetableManager.fetchFreshTimetableData();
    console.log(`✅ Fetched ${freshData.length} classes`);

    // Detect changes
    const changes = await managers.cacheManager.detectScheduleChangesWithPersistence(freshData);
    if (changes.hasChanges) {
      console.log(`📊 Detected ${changes.changes.length} changes`);
      await managers.notificationManager.sendScheduleChangeNotifications(changes.changes);
    }

    // Save cache
    await managers.cacheManager.saveTimetableCache(
      freshData, 
      managers.authManager.getSessionCookies()
    );

    const processedData = freshData.map(item => 
      managers.timetableManager.processClassItem(item)
    );
    
    const timestamp = new Date().toISOString();
    
    res.status(200).json({ 
      success: true, 
      data: processedData, 
      cached: false,
      timestamp: timestamp,
      classCount: processedData.length,
      changes: changes.hasChanges ? changes.changes : null
    });
  } catch (error) {
    console.error('❌ Error refreshing timetable:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = handler;
