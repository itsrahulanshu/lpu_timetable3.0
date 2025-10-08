const axios = require('axios');

class NotificationManager {
    constructor() {
        this.appId = process.env.ONESIGNAL_APP_ID;
        this.apiKey = process.env.ONESIGNAL_API_KEY;
        this.appUrl = process.env.APP_URL || 'http://localhost:3000';
    }

    async sendOneSignalNotification(title, message, data = {}) {
        try {
            const notificationData = {
                app_id: this.appId,
                headings: { en: title },
                contents: { en: message },
                included_segments: ["All"],
                data: data,
                url: this.appUrl,
                chrome_web_icon: `${this.appUrl}/assets/icons/icon-192.png`,
                small_icon: `${this.appUrl}/assets/icons/icon-48.png`,
                large_icon: `${this.appUrl}/assets/icons/icon-512.png`,
                web_buttons: [
                    {
                        id: "open_app",
                        text: "Open App",
                        icon: `${this.appUrl}/assets/icons/icon-48.png`,
                        url: this.appUrl
                    }
                ]
            };

            const response = await axios.post('https://onesignal.com/api/v1/notifications', notificationData, {
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Accept': 'application/json'
                }
            });

            console.log('📱 OneSignal notification sent:', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Failed to send OneSignal notification:', error.message);
            return null;
        }
    }

    async sendScheduleChangeNotifications(changes) {
        if (!changes || changes.length === 0) {
            return;
        }

        console.log(`📊 Sending notifications for ${changes.length} schedule changes`);
        
        // Send notifications for each change
        for (const change of changes) {
            let title, message;
            
            switch (change.type) {
                case 'added':
                    title = '📚 New Class Added';
                    message = change.message;
                    break;
                case 'removed':
                    title = '❌ Class Removed';
                    message = change.message;
                    break;
                case 'modified':
                    title = '✏️ Class Updated';
                    message = change.message;
                    break;
            }
            
            // Send notification
            await this.sendOneSignalNotification(title, message, {
                changeType: change.type,
                courseCode: change.class.CourseCode,
                day: change.class.Day,
                time: change.class.AttendanceTime
            });
        }
    }

    async sendTestNotification() {
        return await this.sendOneSignalNotification(
            "🧪 Test Notification", 
            "This is a test notification to verify proper formatting!",
            { test: true, timestamp: Date.now() }
        );
    }

    isConfigured() {
        return !!(this.appId && this.apiKey);
    }
}

module.exports = NotificationManager;
