/**
 * Client-Side Notification Manager
 * Handles class notifications 10 minutes before start time
 */

class NotificationManager {
    constructor() {
        this.permission = 'default';
        this.notificationCheckInterval = null;
        this.sentNotifications = new Set();
        this.db = window.TimetableDB;
    }

    /**
     * Initialize notification system
     */
    async init() {
        // Check if notifications are supported
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return false;
        }

        // Check current permission
        this.permission = Notification.permission;

        // Request permission if not granted
        if (this.permission === 'default') {
            this.permission = await Notification.requestPermission();
        }

        if (this.permission === 'granted') {
            console.log('✅ Notification permission granted');
            this.startNotificationCheck();
            return true;
        } else {
            console.warn('⚠️ Notification permission denied');
            return false;
        }
    }

    /**
     * Request notification permission
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            return false;
        }

        this.permission = await Notification.requestPermission();
        
        if (this.permission === 'granted') {
            console.log('✅ Notification permission granted');
            this.startNotificationCheck();
            return true;
        }

        return false;
    }

    /**
     * Start checking for notifications every minute
     */
    startNotificationCheck() {
        // Clear existing interval
        if (this.notificationCheckInterval) {
            clearInterval(this.notificationCheckInterval);
        }

        // Check immediately
        this.checkForUpcomingClasses();

        // Then check every minute
        this.notificationCheckInterval = setInterval(() => {
            this.checkForUpcomingClasses();
        }, 60000); // 1 minute

        // Also listen for service worker messages
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'CHECK_NOTIFICATIONS') {
                    this.checkForUpcomingClasses();
                }
            });
        }
    }

    /**
     * Stop notification checks
     */
    stopNotificationCheck() {
        if (this.notificationCheckInterval) {
            clearInterval(this.notificationCheckInterval);
            this.notificationCheckInterval = null;
        }
    }

    /**
     * Check for classes that need notifications
     */
    async checkForUpcomingClasses() {
        // Check if notifications are enabled
        if (!this.isEnabled()) {
            return;
        }

        if (this.permission !== 'granted') {
            return;
        }

        try {
            // Get pending notifications from IndexedDB
            const pending = await this.db.getPendingNotifications();

            if (pending && pending.length > 0) {
                for (const notif of pending) {
                    // Create unique key for this notification
                    const notifKey = `${notif.day}_${notif.classTime}`;

                    // Check if we already sent this notification
                    if (!this.sentNotifications.has(notifKey)) {
                        await this.sendClassNotification(notif);
                        this.sentNotifications.add(notifKey);
                        
                        // Mark as sent in database
                        await this.db.markNotificationSent(notif.id);
                    }
                }
            }

            // Clean up old sent notifications (older than 1 day)
            this.cleanupSentNotifications();

        } catch (error) {
            console.error('Error checking for notifications:', error);
        }
    }

    /**
     * Send a class notification
     */
    async sendClassNotification(classData) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const timeDiff = classData.startMinutes - currentTime;
        
        const title = `📚 Class Starting in ${timeDiff} minutes`;
        const body = `${classData.courseName} - ${classData.type}`;
        
        const options = {
            body: body,
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-96.png',
            tag: `class-${classData.classTime}`,
            requireInteraction: false,
            vibrate: [200, 100, 200],
            data: {
                classTime: classData.classTime,
                courseCode: classData.courseCode,
                building: classData.building,
                roomNumber: classData.roomNumber
            }
        };

        // Add location info to body if available
        if (classData.building && classData.roomNumber) {
            const buildingDisplay = classData.building.toLowerCase() === 'assignment' 
                ? 'Online' 
                : classData.building;
            options.body += `\n📍 ${buildingDisplay} - Room ${classData.roomNumber}`;
        }

        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                // Use service worker for background notifications
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, options);
            } else {
                // Fallback to regular notification
                new Notification(title, options);
            }
            
            console.log(`🔔 Notification sent: ${classData.courseName} at ${classData.classTime}`);
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    }

    /**
     * Send a test notification
     */
    async sendTestNotification() {
        if (this.permission !== 'granted') {
            const granted = await this.requestPermission();
            if (!granted) {
                return false;
            }
        }

        const title = '🧪 Test Notification';
        const body = 'Notifications are working! You\'ll receive alerts 10 minutes before each class.';
        
        const options = {
            body: body,
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-96.png',
            tag: 'test-notification',
            requireInteraction: false,
            vibrate: [200, 100, 200]
        };

        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, options);
            } else {
                new Notification(title, options);
            }
            
            console.log('🔔 Test notification sent');
            return true;
        } catch (error) {
            console.error('Error sending test notification:', error);
            return false;
        }
    }

    /**
     * Clean up old sent notifications
     */
    cleanupSentNotifications() {
        // Keep only notifications from today
        const now = new Date();
        const today = now.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Filter out notifications not from today
        const toRemove = [];
        this.sentNotifications.forEach(key => {
            if (!key.startsWith(today)) {
                toRemove.push(key);
            }
        });
        
        toRemove.forEach(key => this.sentNotifications.delete(key));
    }

    /**
     * Reset notification tracking (for new day)
     */
    resetNotifications() {
        this.sentNotifications.clear();
        console.log('🔄 Notification tracking reset');
    }

    /**
     * Get notification permission status
     */
    getPermissionStatus() {
        return this.permission;
    }

    /**
     * Check if notifications are enabled
     */
    isEnabled() {
        const enabled = localStorage.getItem('notificationsEnabled');
        return enabled !== 'false' && this.permission === 'granted';
    }

    /**
     * Toggle notifications on/off
     */
    async toggleNotifications() {
        const currentState = this.isEnabled();
        
        if (!currentState) {
            // User wants to enable - check permission first
            if (this.permission !== 'granted') {
                const granted = await this.requestPermission();
                if (!granted) {
                    throw new Error('Notification permission denied');
                }
            }
            
            // Enable notifications
            localStorage.setItem('notificationsEnabled', 'true');
            this.startNotificationCheck();
            console.log('🔔 Notifications enabled');
            return true;
        } else {
            // Disable notifications
            localStorage.setItem('notificationsEnabled', 'false');
            if (this.notificationCheckInterval) {
                clearInterval(this.notificationCheckInterval);
                this.notificationCheckInterval = null;
            }
            console.log('🔕 Notifications disabled');
            return false;
        }
    }
}

// Export singleton instance
window.NotificationManager = new NotificationManager();
