const fs = require('fs').promises;
const path = require('path');

class CacheManager {
    constructor() {
        // Use /tmp directory for Vercel serverless, local path for development
        const isVercel = process.env.VERCEL === '1';
        const baseDir = isVercel ? '/tmp' : './src/data';
        
        this.CACHE_FILE = path.join(baseDir, 'timetable_cache.json');
        this.PREVIOUS_TIMETABLE_FILE = path.join(baseDir, 'previous_timetable.json');
        this.lastCacheUpdate = null;
        this.lastTimetableData = null;
        this.verbose = process.env.VERBOSE_LOGS === 'true';
        
        // In-memory cache for Vercel
        this.memoryCache = null;
    }

    async saveTimetableCache(data, sessionCookies, isManualRefresh = false) {
        try {
            const cacheData = {
                data: data,
                timestamp: new Date().toISOString(),
                lastUpdate: Date.now(),
                classCount: data.length,
                hasSessionCookies: !!sessionCookies
            };
            
            // Save to memory cache for Vercel
            this.memoryCache = cacheData;
            
            // Try to save to file system (works in /tmp on Vercel)
            try {
                await fs.writeFile(this.CACHE_FILE, JSON.stringify(cacheData, null, 2));
                this.lastCacheUpdate = Date.now();
            } catch (fsError) {
                // File write failed, but we have memory cache
                if (this.verbose) console.log('⚠️ File cache unavailable, using memory cache');
            }
            
            if (this.verbose) console.log(`💾 Cached ${data.length} classes${isManualRefresh ? ' (manual refresh)' : ''}`);
        } catch (error) {
            console.error('❌ Error saving cache:', error.message);
        }
    }

    async loadTimetableCache() {
        try {
            // First try memory cache (for Vercel)
            if (this.memoryCache && this.memoryCache.data) {
                const timeSinceUpdate = Date.now() - this.memoryCache.lastUpdate;
                const minutesSinceUpdate = Math.floor(timeSinceUpdate / (1000 * 60));
                
                if (this.verbose) console.log(`📂 Memory cache loaded (${minutesSinceUpdate}m old, ${this.memoryCache.classCount} classes)`);
                
                return this.memoryCache;
            }
            
            // Try file cache
            const cacheContent = await fs.readFile(this.CACHE_FILE, 'utf8');
            const cacheData = JSON.parse(cacheContent);
            
            if (cacheData && cacheData.data) {
                this.lastCacheUpdate = cacheData.lastUpdate || 0;
                this.memoryCache = cacheData; // Update memory cache
                const timeSinceUpdate = Date.now() - this.lastCacheUpdate;
                const minutesSinceUpdate = Math.floor(timeSinceUpdate / (1000 * 60));
                
                if (this.verbose) console.log(`📂 Cache loaded (${minutesSinceUpdate}m old, ${cacheData.classCount || cacheData.data.length} classes)`);
                
                return cacheData; // Return full cache object with timestamp
            }
            
            return null;
        } catch (error) {
            if (this.verbose) console.log('📂 No cache found');
            return null;
        }
    }


    async savePreviousTimetableData(data) {
        try {
            const previousData = {
                data: data,
                timestamp: Date.now(),
                lastUpdate: Date.now()
            };
            await fs.writeFile(this.PREVIOUS_TIMETABLE_FILE, JSON.stringify(previousData, null, 2));
            if (this.verbose) console.log('💾 Previous timetable data saved');
        } catch (error) {
            console.error('❌ Error saving previous timetable data:', error.message);
        }
    }

    async loadPreviousTimetableData() {
        try {
            const previousContent = await fs.readFile(this.PREVIOUS_TIMETABLE_FILE, 'utf8');
            const previousData = JSON.parse(previousContent);
            
            if (previousData && previousData.data) {
                const timeSinceUpdate = Date.now() - previousData.lastUpdate;
                const hoursSinceUpdate = Math.floor(timeSinceUpdate / (1000 * 60 * 60));
                
                if (this.verbose) console.log(`📂 Previous timetable data loaded (${hoursSinceUpdate}h old, ${previousData.data.length} classes)`);
                return previousData.data;
            }
            
            return null;
        } catch (error) {
            if (this.verbose) console.log('📂 No previous timetable data found (first run)');
            return null;
        }
    }

    detectScheduleChanges(newTimetableData) {
        if (!this.lastTimetableData) {
            // First time loading, no changes to detect
            this.lastTimetableData = newTimetableData;
            return { hasChanges: false, changes: [] };
        }

        const changes = [];
        const oldClasses = this.lastTimetableData;
        const newClasses = newTimetableData;

        // Create maps for easier comparison
        const oldClassMap = new Map();
        const newClassMap = new Map();

        oldClasses.forEach(cls => {
            const key = `${cls.CourseCode}-${cls.Day}-${cls.AttendanceTime}`;
            oldClassMap.set(key, cls);
        });

        newClasses.forEach(cls => {
            const key = `${cls.CourseCode}-${cls.Day}-${cls.AttendanceTime}`;
            newClassMap.set(key, cls);
        });

        // Find added classes
        for (const [key, newClass] of newClassMap) {
            if (!oldClassMap.has(key)) {
                changes.push({
                    type: 'added',
                    class: newClass,
                    message: `New class added: ${newClass.CourseCode} - ${newClass.CourseName} on ${newClass.Day} at ${newClass.AttendanceTime}`
                });
            }
        }

        // Find removed classes
        for (const [key, oldClass] of oldClassMap) {
            if (!newClassMap.has(key)) {
                changes.push({
                    type: 'removed',
                    class: oldClass,
                    message: `Class removed: ${oldClass.CourseCode} - ${oldClass.CourseName} on ${oldClass.Day} at ${oldClass.AttendanceTime}`
                });
            }
        }

        // Find modified classes (same key but different details)
        for (const [key, newClass] of newClassMap) {
            if (oldClassMap.has(key)) {
                const oldClass = oldClassMap.get(key);
                const differences = [];

                if (oldClass.Room !== newClass.Room) {
                    differences.push(`Room: ${oldClass.Room} → ${newClass.Room}`);
                }
                if (oldClass.Building !== newClass.Building) {
                    differences.push(`Building: ${oldClass.Building} → ${newClass.Building}`);
                }
                if (oldClass.Group !== newClass.Group) {
                    differences.push(`Group: ${oldClass.Group} → ${newClass.Group}`);
                }
                if (oldClass.Section !== newClass.Section) {
                    differences.push(`Section: ${oldClass.Section} → ${newClass.Section}`);
                }

                if (differences.length > 0) {
                    changes.push({
                        type: 'modified',
                        class: newClass,
                        oldClass: oldClass,
                        differences: differences,
                        message: `Class updated: ${newClass.CourseCode} - ${newClass.CourseName} (${differences.join(', ')})`
                    });
                }
            }
        }

        // Update the stored data
        this.lastTimetableData = newTimetableData;

        return {
            hasChanges: changes.length > 0,
            changes: changes
        };
    }

    async detectScheduleChangesWithPersistence(newTimetableData) {
        // First try to load previous data from memory
        let previousData = this.lastTimetableData;
        
        // If no data in memory, try to load from persistent storage
        if (!previousData) {
            previousData = await this.loadPreviousTimetableData();
        }
        
        // If still no previous data, this is the first run
        if (!previousData) {
            console.log('📊 First timetable load - no changes to detect');
            this.lastTimetableData = newTimetableData;
            await this.savePreviousTimetableData(newTimetableData);
            return { hasChanges: false, changes: [] };
        }
        
        // Use the existing change detection logic
        const changeDetection = this.detectScheduleChanges(newTimetableData);
        
        // Save the new data as previous for next time
        if (changeDetection.hasChanges) {
            await this.savePreviousTimetableData(newTimetableData);
        }
        
        return changeDetection;
    }


    getCacheTimestamp() {
        return this.lastCacheUpdate ? new Date(this.lastCacheUpdate).toISOString() : null;
    }
}

module.exports = CacheManager;
