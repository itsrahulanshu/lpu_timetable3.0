/**
 * IndexedDB Manager for Offline Timetable Storage
 * Provides persistent offline storage for timetable data
 */

class TimetableDB {
    constructor() {
        this.dbName = 'LPUTimetableDB';
        this.version = 2;
        this.db = null;
    }

    /**
     * Initialize the database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB failed to open:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores if they don't exist
                if (!db.objectStoreNames.contains('timetable')) {
                    const timetableStore = db.createObjectStore('timetable', { keyPath: 'id' });
                    timetableStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains('notifications')) {
                    const notifStore = db.createObjectStore('notifications', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    notifStore.createIndex('classTime', 'classTime', { unique: false });
                    notifStore.createIndex('notified', 'notified', { unique: false });
                }

                console.log('📦 IndexedDB schema created/upgraded');
            };
        });
    }

    /**
     * Save timetable data
     */
    async saveTimetable(data) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['timetable', 'metadata'], 'readwrite');
            const timetableStore = transaction.objectStore('timetable');
            const metadataStore = transaction.objectStore('metadata');

            // Clear existing data
            timetableStore.clear();

            // Save each class item
            data.forEach((item, index) => {
                timetableStore.add({
                    id: `class_${index}`,
                    ...item
                });
            });

            // Save metadata
            metadataStore.put({
                key: 'lastUpdate',
                timestamp: Date.now(),
                classCount: data.length,
                version: this.version
            });

            transaction.oncomplete = () => {
                console.log(`💾 Saved ${data.length} classes to IndexedDB`);
                resolve();
            };

            transaction.onerror = () => {
                console.error('Failed to save to IndexedDB:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Load timetable data
     */
    async loadTimetable() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['timetable', 'metadata'], 'readonly');
            const timetableStore = transaction.objectStore('timetable');
            const metadataStore = transaction.objectStore('metadata');

            const getAllRequest = timetableStore.getAll();
            const getMetadataRequest = metadataStore.get('lastUpdate');

            transaction.oncomplete = () => {
                const data = getAllRequest.result;
                const metadata = getMetadataRequest.result;

                if (data && data.length > 0) {
                    console.log(`📂 Loaded ${data.length} classes from IndexedDB`);
                    resolve({
                        data: data.map(item => {
                            const { id, ...classData } = item;
                            return classData;
                        }),
                        timestamp: metadata ? new Date(metadata.timestamp).toISOString() : null,
                        lastUpdate: metadata ? metadata.timestamp : null,
                        classCount: metadata ? metadata.classCount : data.length
                    });
                } else {
                    console.log('📂 No cached data in IndexedDB');
                    resolve(null);
                }
            };

            transaction.onerror = () => {
                console.error('Failed to load from IndexedDB:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Save notification schedule
     */
    async saveNotificationSchedule(classData) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notifications'], 'readwrite');
            const store = transaction.objectStore('notifications');

            // Clear old notifications
            store.clear();

            // Add new notification entries for each class
            classData.forEach(classItem => {
                if (classItem.timeRange && classItem.timeRange.start) {
                    store.add({
                        classTime: classItem.AttendanceTime,
                        day: classItem.Day,
                        courseName: classItem.parsedInfo.courseName,
                        courseCode: classItem.parsedInfo.course,
                        building: classItem.parsedInfo.building,
                        roomNumber: classItem.parsedInfo.roomNumber,
                        type: classItem.parsedInfo.type,
                        startMinutes: classItem.timeRange.start,
                        notified: false,
                        timestamp: Date.now()
                    });
                }
            });

            transaction.oncomplete = () => {
                console.log('🔔 Notification schedule saved');
                resolve();
            };

            transaction.onerror = () => {
                console.error('Failed to save notification schedule:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Get notifications that need to be sent
     */
    async getPendingNotifications() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notifications'], 'readonly');
            const store = transaction.objectStore('notifications');
            const request = store.getAll();

            request.onsuccess = () => {
                const now = new Date();
                const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
                const currentTime = now.getHours() * 60 + now.getMinutes();

                // Filter for classes happening today, 10 minutes from now, and not yet notified
                const pending = request.result.filter(notif => {
                    const timeDiff = notif.startMinutes - currentTime;
                    return !notif.notified && notif.day === currentDay && timeDiff > 0 && timeDiff <= 10;
                });

                resolve(pending);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Mark notification as sent
     */
    async markNotificationSent(notificationId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['notifications'], 'readwrite');
            const store = transaction.objectStore('notifications');
            const getRequest = store.get(notificationId);

            getRequest.onsuccess = () => {
                const notification = getRequest.result;
                if (notification) {
                    notification.notified = true;
                    store.put(notification);
                }
            };

            transaction.oncomplete = () => {
                resolve();
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    /**
     * Clear all data
     */
    async clearAll() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(
                ['timetable', 'metadata', 'notifications'], 
                'readwrite'
            );

            transaction.objectStore('timetable').clear();
            transaction.objectStore('metadata').clear();
            transaction.objectStore('notifications').clear();

            transaction.oncomplete = () => {
                console.log('🗑️ Cleared all IndexedDB data');
                resolve();
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    /**
     * Get storage info
     */
    async getStorageInfo() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const request = store.get('lastUpdate');

            request.onsuccess = () => {
                const metadata = request.result;
                resolve({
                    hasData: !!metadata,
                    lastUpdate: metadata ? metadata.timestamp : null,
                    classCount: metadata ? metadata.classCount : 0,
                    version: metadata ? metadata.version : null
                });
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Export singleton instance
window.TimetableDB = new TimetableDB();
