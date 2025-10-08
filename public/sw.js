// Enhanced PWA Service Worker with Offline Support and Background Notifications
const VERSION = '3.1.0';
const CACHE_NAME = `lpu-timetable-v${VERSION}`;
const DATA_CACHE_NAME = `lpu-data-v${VERSION}`;

// Files to cache immediately (with version for cache busting)
const STATIC_FILES = [
  '/',
  '/index.html',
  `/assets/css/main.css?v=${VERSION}`,
  `/assets/js/app.js?v=${VERSION}`,
  `/assets/js/db.js?v=${VERSION}`,
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new version:', VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static files...');
        return cache.addAll(STATIC_FILES.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static files:', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new version:', VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches that don't match current version
            if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME && 
                (cacheName.startsWith('lpu-timetable-') || cacheName.startsWith('lpu-data-'))) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Notify all clients about the update
        return self.clients.matchAll();
      })
      .then((clients) => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: VERSION,
            message: 'App updated successfully!'
          });
        });
      })
  );
  
  // Take control of all pages immediately
  self.clients.claim();
  
  // Setup notification check interval (every minute)
  setupNotificationCheck();
  
  // Setup daily auto-refresh (8:00 AM IST, excluding Sundays)
  setupDailyRefresh();
});

// Fetch event - serve cached files or fetch from network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle different types of requests
  if (request.method === 'GET') {
    if (request.url.includes('.html') || request.url === url.origin + '/') {
      // HTML files - always network first to get updates
      event.respondWith(networkFirst(request));
    } else if (request.url.includes('/api/')) {
      // API endpoints - always network first (no caching)
      event.respondWith(networkFirst(request));
    } else if (isStaticFile(request.url)) {
      // Static files - cache first strategy
      event.respondWith(cacheFirst(request));
    } else if (url.origin === location.origin) {
      // Same origin - cache first strategy
      event.respondWith(cacheFirst(request));
    } else {
      // External resources - network first strategy
      event.respondWith(networkFirst(request));
    }
  }
});

// Cache first strategy - good for static files
async function cacheFirst(request) {
  try {
    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
      return cacheResponse;
    }
    
    const networkResponse = await fetch(request);
    
    // Cache the response for future use
    if (networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    
    // Return offline fallback for HTML pages
    if (request.destination === 'document') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('/index.html');
    }
    
    throw error;
  }
}

// Network first strategy - good for dynamic content
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses (but NOT for API endpoints)
    if (networkResponse.status === 200 && !request.url.includes('/api/')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network request failed, trying cache:', request.url);
    
    // For API requests, don't fall back to cache - return offline error
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({
          error: 'Offline',
          message: 'You are currently offline. Please check your connection and try again.',
          cached: false
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    // For non-API requests, try cache fallback
    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
      return cacheResponse;
    }
    
    throw error;
  }
}

// Helper function to identify static files
function isStaticFile(url) {
  return STATIC_FILES.some(file => url.includes(file)) ||
         url.includes('.css') ||
         url.includes('.js') ||
         url.includes('.png') ||
         url.includes('.jpg') ||
         url.includes('.jpeg') ||
         url.includes('.gif') ||
         url.includes('.svg') ||
         url.includes('.ico') ||
         url.includes('.woff') ||
         url.includes('.woff2') ||
         url.includes('.ttf');
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_NOTIFICATIONS') {
    checkAndSendNotifications();
  }
});

// Error handling
self.addEventListener('error', (event) => {
  console.error('[SW] Error occurred:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

// ==================== NOTIFICATION SYSTEM ====================

let notificationCheckInterval = null;

function setupNotificationCheck() {
  // Clear existing interval
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
  }
  
  // Check for notifications every minute
  notificationCheckInterval = setInterval(() => {
    checkAndSendNotifications();
  }, 60000); // 1 minute
  
  // Also check immediately
  checkAndSendNotifications();
}

async function checkAndSendNotifications() {
  try {
    // Get notification permission status
    const permission = await self.registration.pushManager.permissionState({
      userVisibleOnly: true
    });
    
    if (permission !== 'granted') {
      return;
    }
    
    // Notify clients to check for pending notifications
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      client.postMessage({
        type: 'CHECK_NOTIFICATIONS'
      });
    });
    
  } catch (error) {
    console.error('[SW] Notification check error:', error);
  }
}

// ==================== AUTO-REFRESH SYSTEM ====================

let autoRefreshInterval = null;
let lastAutoRefresh = null;

function setupDailyRefresh() {
  // Clear existing interval
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  // Check every 5 minutes if we need to auto-refresh
  autoRefreshInterval = setInterval(() => {
    checkAndAutoRefresh();
  }, 5 * 60000); // 5 minutes
  
  // Also check immediately
  checkAndAutoRefresh();
}

async function checkAndAutoRefresh() {
  try {
    const now = new Date();
    
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const day = istTime.getUTCDay(); // 0 = Sunday
    
    // Check if it's Sunday
    if (day === 0) {
      return; // Skip Sundays
    }
    
    // Check if it's 8:00 AM IST (within a 5-minute window)
    if (hours === 8 && minutes < 5) {
      // Check if we already refreshed today
      const today = istTime.toISOString().split('T')[0];
      const lastRefreshDate = lastAutoRefresh ? new Date(lastAutoRefresh).toISOString().split('T')[0] : null;
      
      if (lastRefreshDate !== today) {
        console.log('[SW] Triggering daily auto-refresh at 8:00 AM IST');
        await triggerAutoRefresh();
        lastAutoRefresh = Date.now();
      }
    }
  } catch (error) {
    console.error('[SW] Auto-refresh check error:', error);
  }
}

async function triggerAutoRefresh() {
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    
    if (clients.length > 0) {
      // If app is open, notify it to refresh
      clients.forEach(client => {
        client.postMessage({
          type: 'AUTO_REFRESH',
          timestamp: Date.now()
        });
      });
    } else {
      // App is not open, show a notification
      await self.registration.showNotification('LPU Timetable Updated', {
        body: 'Your timetable has been automatically refreshed. Open the app to see the latest schedule.',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-96.png',
        tag: 'auto-refresh',
        requireInteraction: false,
        actions: [
          { action: 'open', title: 'Open App' }
        ]
      });
    }
  } catch (error) {
    console.error('[SW] Auto-refresh trigger error:', error);
  }
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// ==================== END OF SERVICE WORKER ====================
