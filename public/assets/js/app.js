class TimetableApp {
    constructor() {
        this.timetableData = [];
        this.currentFilter = 'all';
        this.deferredPrompt = null;
        this.currentClassData = null;
        this.autoRefreshInterval = null;
        this.darkMode = this.getDarkModePreference();
        this.db = window.TimetableDB;
        this.notificationManager = window.NotificationManager;
        this.lastManualRefresh = 0;
        this.REFRESH_COOLDOWN = 10 * 60 * 1000; // 10 minutes in milliseconds
        
        // Wait for DOM to be ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.bindEvents();
        this.initializeDarkMode();
        
        this.initializeApp().catch(error => {
            console.error('❌ Fatal initialization error:', error);
            this.hideLoadingScreen();
            this.showErrorModal('Failed to initialize app. Please refresh the page.');
        });
    }

    async initializeApp() {
        try {
            this.showLoadingScreen();
            
            // Initialize IndexedDB
            await this.db.init();
            
            // Initialize notification system
            await this.notificationManager.init();
            
            // Update notification button state
            const notificationEnabled = this.notificationManager.isEnabled();
            this.updateNotificationButton(notificationEnabled);
            this.updateNotificationInfo(notificationEnabled);
            
            // Auto-hide notification info after 10 seconds if not enabled
            if (!notificationEnabled) {
                setTimeout(() => {
                    const info = document.getElementById('notificationInfo');
                    if (info && !this.notificationManager.isEnabled()) {
                        info.classList.add('hidden');
                    }
                }, 10000); // 10 seconds
            }
            
            // Load timetable data (from IndexedDB or API)
            await this.loadTimetableData();
            
            this.setupPWAInstall();
            this.setupServiceWorkerUpdates();
            this.updateLastUpdateTime();
            
            // Check current class every minute
            setInterval(() => this.checkCurrentClass(), 60000);
            
            // Update "last updated" time every minute
            setInterval(() => this.updateLastUpdateTime(), 60000);
            
            // Remove the old auto-refresh interval - data is now in IndexedDB
            // No need to constantly poll the API
        } catch (error) {
            console.error('❌ Error in initializeApp:', error);
            this.hideLoadingScreen();
            throw error; // Re-throw to be caught by constructor
        }
    }

    bindEvents() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshTimetable();
        });

        // Notification toggle button
        document.getElementById('notificationBtn').addEventListener('click', () => {
            this.toggleNotifications();
        });

        // Day filter buttons
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveFilter(e.target.dataset.day);
            });
        });

        // Dark mode toggle
        document.getElementById('darkModeBtn').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        // Welcome modal button
        document.getElementById('getStartedBtn').addEventListener('click', () => {
            this.hideWelcomeModal();
        });

        // Error modal
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideErrorModal();
        });

        document.getElementById('retryBtn').addEventListener('click', () => {
            this.hideErrorModal();
            this.refreshTimetable();
        });

        // Close modals on backdrop click
        document.getElementById('errorModal').addEventListener('click', (e) => {
            if (e.target.id === 'errorModal') {
                this.hideErrorModal();
            }
        });

        document.getElementById('welcomeModal').addEventListener('click', (e) => {
            if (e.target.id === 'welcomeModal') {
                this.hideWelcomeModal();
            }
        });

        // Notification modal buttons
        document.getElementById('enableNotificationBtn').addEventListener('click', () => {
            this.enableNotificationsFromModal();
        });

        document.getElementById('skipNotificationBtn').addEventListener('click', () => {
            this.hideNotificationModal();
        });

        // Close notification modal on backdrop click
        document.getElementById('notificationModal').addEventListener('click', (e) => {
            if (e.target.id === 'notificationModal') {
                this.hideNotificationModal();
            }
        });
    }

    async loadTimetableData(isAutoRefresh = false) {
        try {
            // First try to load from IndexedDB (offline support)
            const cachedData = await this.db.loadTimetable();
            
            if (cachedData && cachedData.data && cachedData.data.length > 0) {
                console.log(`📂 Loaded ${cachedData.data.length} classes from IndexedDB`);
                this.timetableData = cachedData.data;
                
                // Update last update time
                if (cachedData.timestamp) {
                    this.updateLastUpdateTimeFromTimestamp(cachedData.timestamp);
                }
                
                // Set today's filter on initial load
                if (!isAutoRefresh) {
                    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
                    const todayBtn = document.querySelector(`[data-day="${today}"]`);
                    if (todayBtn) {
                        this.currentFilter = today;
                        document.querySelectorAll('.day-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        todayBtn.classList.add('active');
                        
                        setTimeout(() => {
                            todayBtn.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'nearest', 
                                inline: 'center' 
                            });
                        }, 100);
                    }
                }
                
                this.renderTimetable();
                this.updateStats();
                this.hideLoadingScreen();
                this.checkCurrentClass();
                
                // Setup notifications for the loaded data
                await this.db.saveNotificationSchedule(this.timetableData);
                
                return;
            }
            
            // No cached data - try to fetch from API
            console.log('📂 No cached data - fetching from API');
            const response = await fetch('/api/timetable');
            
            if (response.status === 404) {
                console.log('📂 No data available - user needs to refresh');
                if (!isAutoRefresh) {
                    this.hideLoadingScreen();
                    this.timetableData = [];
                    this.renderTimetable();
                    this.updateStats();
                    
                    // Show welcome modal for first-time users
                    this.showWelcomeModal();
                }
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.timetableData = result.data;
                
                // Save to IndexedDB
                await this.db.saveTimetable(this.timetableData);
                
                // Setup notifications
                await this.db.saveNotificationSchedule(this.timetableData);
                
                if (result.timestamp) {
                    this.updateLastUpdateTimeFromTimestamp(result.timestamp);
                }
            } else {
                throw new Error(result.error || result.message || 'Invalid response format');
            }
            
            if (!isAutoRefresh) {
                const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
                const todayBtn = document.querySelector(`[data-day="${today}"]`);
                if (todayBtn) {
                    this.currentFilter = today;
                    document.querySelectorAll('.day-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    todayBtn.classList.add('active');
                    
                    setTimeout(() => {
                        todayBtn.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest', 
                            inline: 'center' 
                        });
                    }, 100);
                }
            }
            
            this.renderTimetable();
            this.updateStats();
            
            if (!isAutoRefresh) {
                this.hideLoadingScreen();
            }
            
            this.checkCurrentClass();
            
        } catch (error) {
            console.error('Error loading timetable:', error);
            
            // Always hide loading screen on error
            this.hideLoadingScreen();
            
            // Try to load any cached data as fallback
            const cachedData = await this.db.loadTimetable();
            if (cachedData && cachedData.data && cachedData.data.length > 0) {
                console.log('📂 Loading cached data after error');
                this.timetableData = cachedData.data;
                this.renderTimetable();
                this.updateStats();
                if (cachedData.timestamp) {
                    this.updateLastUpdateTimeFromTimestamp(cachedData.timestamp);
                }
            } else {
                // No cached data available
                this.timetableData = [];
                this.renderTimetable();
                this.updateStats();
            }
            
            if (!isAutoRefresh) {
                // Check if this is a first-time user (no cached data)
                const cachedDataCheck = await this.db.loadTimetable();
                if (!cachedDataCheck || !cachedDataCheck.data || cachedDataCheck.data.length === 0) {
                    // First-time user - show welcome modal instead of error
                    this.showWelcomeModal();
                } else {
                    // Returning user with cached data - show error modal
                    this.showErrorModal('Failed to load fresh data. Click refresh button to fetch latest timetable.');
                }
            }
        }
    }

    async refreshTimetable(isAutoRefresh = false) {
        const refreshBtn = document.getElementById('refreshBtn');
        
        // Check refresh cooldown (10 minutes) - only for manual refresh
        if (!isAutoRefresh) {
            const now = Date.now();
            const timeSinceLastRefresh = now - this.lastManualRefresh;
            
            if (timeSinceLastRefresh < this.REFRESH_COOLDOWN && this.lastManualRefresh > 0) {
                const remainingMs = this.REFRESH_COOLDOWN - timeSinceLastRefresh;
                const remainingMinutes = Math.floor(remainingMs / 60000);
                const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
                
                const timeMessage = remainingMinutes > 0 
                    ? `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')} minutes`
                    : `${remainingSeconds} seconds`;
                
                this.showRateLimitNotification(timeMessage, Math.floor(remainingMs / 1000));
                console.log(`⏱️ Refresh cooldown: ${timeMessage} remaining`);
                return;
            }
        }
        
        if (!isAutoRefresh) {
            refreshBtn.classList.add('loading');
        }
        
        try {
            if (isAutoRefresh) {
                // Auto refresh just reloads from IndexedDB
                await this.loadTimetableData(isAutoRefresh);
            } else {
                // Manual refresh forces fresh data from UMS API
                console.log('🔄 Manual refresh - fetching fresh data from UMS...');
                
                const response = await fetch('/api/refresh', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                
                // Handle rate limit (429 status) from API
                if (response.status === 429 && result.rateLimited) {
                    const { minutes, seconds } = result.remainingTime;
                    const timeMessage = minutes > 0 
                        ? `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`
                        : `${seconds} second${seconds !== 1 ? 's' : ''}`;
                    
                    this.showRateLimitNotification(timeMessage, result.remainingTime.totalSeconds);
                    console.log(`⏱️ Rate limited: ${timeMessage} remaining`);
                    return;
                }
                
                if (!response.ok) {
                    throw new Error(result.message || 'Failed to refresh timetable');
                }
                
                if (result.sessionExpired) {
                    this.showErrorModal('Session expired. Please check your credentials in .env file');
                    return;
                }
                
                this.timetableData = result.data;
                
                // Save to IndexedDB
                await this.db.saveTimetable(this.timetableData);
                
                // Setup notifications for new data
                await this.db.saveNotificationSchedule(this.timetableData);
                
                this.updateStats();
                this.renderTimetable();
                
                // Update last update time
                if (result.timestamp) {
                    this.updateLastUpdateTimeFromTimestamp(result.timestamp);
                }
                
                this.checkCurrentClass();
                
                // Update last manual refresh time
                this.lastManualRefresh = Date.now();
                
                // Show success message briefly
                const originalText = refreshBtn.innerHTML;
                refreshBtn.innerHTML = '✅';
                refreshBtn.style.background = '#10b981';
                setTimeout(() => {
                    refreshBtn.innerHTML = originalText;
                    refreshBtn.style.background = '';
                }, 2000);
                
                console.log('✅ Manual refresh completed successfully');
            }
        } catch (error) {
            console.error('❌ Refresh failed:', error.message);
            this.showErrorModal(`Failed to refresh timetable: ${error.message}`);
        } finally {
            if (!isAutoRefresh) {
                refreshBtn.classList.remove('loading');
            }
        }
    }

    renderTimetable() {
        const container = document.getElementById('timetableContainer');
        container.innerHTML = '';

        // Group classes by day
        const dayGroups = this.groupClassesByDay();
        
        // Render each day
        Object.keys(dayGroups).forEach(day => {
            if (this.currentFilter === 'all' || this.currentFilter === day) {
                const daySection = this.createDaySection(day, dayGroups[day]);
                container.appendChild(daySection);
            }
        });

        if (container.children.length === 0) {
            container.innerHTML = this.createEmptyState();
        }
    }

    groupClassesByDay() {
        const groups = {};
        
        this.timetableData.forEach(classItem => {
            let day = classItem.Day;
            
            // Convert date format (DD-MM-YYYY) to weekday name
            if (day && day.includes('-') && day.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [dayNum, month, year] = day.split('-');
                const date = new Date(year, month - 1, dayNum);
                day = date.toLocaleDateString('en-US', { weekday: 'long' });
            }
            
            if (!groups[day]) {
                groups[day] = [];
            }
            groups[day].push(classItem);
        });

        // Sort classes within each day by time
        Object.keys(groups).forEach(day => {
            groups[day].sort((a, b) => {
                return a.timeRange.start - b.timeRange.start;
            });
        });

        return groups;
    }

    createDaySection(day, classes) {
        const section = document.createElement('div');
        section.className = 'day-section';
        
        // Create day header
        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML = `
            <span>${day}</span>
            <span class="day-count">${classes.length} ${classes.length === 1 ? 'class' : 'classes'}</span>
        `;
        
        // Create classes container
        const classesContainer = document.createElement('div');
        classesContainer.className = 'class-list';
        
        classes.forEach(classItem => {
            const classElement = this.createClassElement(classItem);
            classesContainer.appendChild(classElement);
        });
        
        section.appendChild(header);
        section.appendChild(classesContainer);
        
        return section;
    }

    createClassElement(classItem) {
        const element = document.createElement('div');
        
        // Use pre-parsed data from API
        const classInfo = classItem.parsedInfo;
        const buildingDisplay = classInfo.building && classInfo.building.toLowerCase() === 'assignment' 
            ? 'Online' 
            : classInfo.building;
        
        // Add class type to CSS classes
        element.className = `class-item ${classInfo.type.toLowerCase()}`;
        
        element.innerHTML = `
            <div class="class-header">
                <div class="class-time-container">
                    <div class="class-time">${classItem.AttendanceTime}</div>
                    <span class="class-type ${classInfo.type.toLowerCase()}">${classInfo.type}</span>
                </div>
                <div class="class-info">
                    <div class="class-title">
                        <div class="course-code">${classInfo.course}</div>
                        <div class="course-name">${classInfo.courseName}</div>
                    </div>
                </div>
            </div>
            <div class="class-details">
                ${classInfo.building && classInfo.roomNumber ? `<div class="class-detail highlight location">
                    <div class="building-room-info">
                        <span class="building-inline-icon">🏢</span>
                        <div class="building-info">
                            <div class="building-number">${buildingDisplay}</div>
                            <div class="building-label">Building</div>
                        </div>
                        <div class="location-separator"></div>
                        <div class="room-info">
                            <div class="room-number">${classInfo.roomNumber}</div>
                            <div class="room-label">Room</div>
                        </div>
                        ${classInfo.group ? `<div class="location-separator"></div>
                        <div class="group-inline-info">
                            <div class="group-number">${classInfo.group === 'All' ? 'ALL' : classInfo.group}</div>
                            <div class="group-label">Group</div>
                        </div>` : ''}
                    </div>
                </div>` : classInfo.room ? `<div class="class-detail highlight location">
                    <span class="class-detail-icon">📍</span>
                    <div class="building-room-info">
                        <div class="room-info">
                            <div class="room-number">${classInfo.room}</div>
                            <div class="room-label">Location</div>
                        </div>
                        ${classInfo.group ? `<div class="location-separator"></div>
                        <div class="group-inline-info">
                            <div class="group-number">${classInfo.group === 'All' ? 'ALL' : classInfo.group}</div>
                            <div class="group-label">Group</div>
                        </div>` : ''}
                    </div>
                </div>` : ''}
            </div>
        `;
        
        return element;
    }

    // Course data and parsing now handled by API

    updateStats() {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        
        // Count today's classes (including date-based classes)
        const todayClasses = this.timetableData.filter(item => {
            let classDay = item.Day;
            
            // Convert date format (DD-MM-YYYY) to weekday name for comparison
            if (classDay && classDay.includes('-') && classDay.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [dayNum, month, year] = classDay.split('-');
                const date = new Date(year, month - 1, dayNum);
                classDay = date.toLocaleDateString('en-US', { weekday: 'long' });
            }
            
            return classDay === today;
        });
        
        document.getElementById('totalClasses').textContent = this.timetableData.length;
        document.getElementById('todayClasses').textContent = todayClasses.length;
    }

    setActiveFilter(day) {
        // Update active tab
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-day="${day}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            
            // Scroll to show the active button
            activeBtn.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'center' 
            });
        }
        
        // Update filter and re-render
        this.currentFilter = day;
        this.renderTimetable();
    }

    checkCurrentClass() {
        const now = new Date();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentTime = now.getHours() * 60 + now.getMinutes();

        console.log(`Checking upcoming classes - Day: ${currentDay}, Current time: ${Math.floor(currentTime/60)}:${String(currentTime%60).padStart(2,'0')} (${currentTime} mins)`);

        let upcomingClass = null;
        let upcomingClasses = [];

        // Get today's classes sorted by time (including date-based classes)
        const todayClasses = this.timetableData
            .filter(classItem => {
                let classDay = classItem.Day;
                
                // Convert date format (DD-MM-YYYY) to weekday name for comparison
                if (classDay && classDay.includes('-') && classDay.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    const [dayNum, month, year] = classDay.split('-');
                    const date = new Date(year, month - 1, dayNum);
                    classDay = date.toLocaleDateString('en-US', { weekday: 'long' });
                }
                
                return classDay === currentDay;
            })
            .sort((a, b) => a.timeRange.start - b.timeRange.start);

        console.log(`Found ${todayClasses.length} classes for ${currentDay}:`);

        // Find only upcoming classes (rest of the day)
        upcomingClasses = todayClasses.filter(classItem => {
            const timeDiff = classItem.timeRange.start - currentTime;
            return timeDiff > 0; // Any class later today
        });
        
        if (upcomingClasses.length > 0) {
            upcomingClass = upcomingClasses[0]; // Next class
            console.log(`Found upcoming class: ${upcomingClass.AttendanceTime}`);
        }

        console.log(`Result - Upcoming: ${upcomingClass ? upcomingClass.AttendanceTime : 'None'}`);

        this.autoScrollToUpcomingClass(upcomingClass);
    }

    // Time parsing now handled by API

    autoScrollToUpcomingClass(upcomingClass) {
        if (!upcomingClass) {
            this.currentClassData = null;
            return;
        }
        
        // Store upcoming class data
        this.currentClassData = upcomingClass;
        
        // First, make sure we're showing the current day
        const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        if (this.currentFilter !== currentDay) {
            this.setActiveFilter(currentDay);
        }
        
        // Wait for rendering, then auto-scroll to upcoming class
        setTimeout(() => {
            const classTime = upcomingClass.AttendanceTime;
            const classElements = document.querySelectorAll('.class-item');
            
            for (let element of classElements) {
                const timeElement = element.querySelector('.class-time');
                if (timeElement && timeElement.textContent === classTime) {
                    // Add upcoming class indicator styling
                    element.classList.add('upcoming-class-highlight');
                    
                    // Scroll to the upcoming class
                    element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                    
                    // After 10 seconds, scroll back to header
                    setTimeout(() => {
                        // Remove highlight
                        element.classList.remove('upcoming-class-highlight');
                        
                        // Scroll back to top (header) - handle both window and app container
                        const appContainer = document.getElementById('app');
                        const header = document.querySelector('.header');
                        
                        // Try scrolling the header into view first
                        if (header) {
                            header.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'start' 
                            });
                        }
                        
                        // Also scroll window to top
                        window.scrollTo({ 
                            top: 0, 
                            behavior: 'smooth' 
                        });
                        
                        // Scroll app container to top if it exists and is scrollable
                        if (appContainer && appContainer.scrollTop > 0) {
                            appContainer.scrollTo({ 
                                top: 0, 
                                behavior: 'smooth' 
                            });
                        }
                        
                        console.log('📜 Auto-scrolled back to header');
                    }, 10000); // 10 seconds
                    
                    console.log('📜 Auto-scrolled to upcoming class');
                    break;
                }
            }
        }, 500);
    }

    scrollToCurrentClass() {
        // This method is no longer needed but kept for compatibility
        if (!this.currentClassData) return;
        
        const classTime = this.currentClassData.AttendanceTime;
        const classElements = document.querySelectorAll('.class-item');
        
        for (let element of classElements) {
            const timeElement = element.querySelector('.class-time');
            if (timeElement && timeElement.textContent === classTime) {
                element.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                break;
            }
        }
    }

    createEmptyState() {
        // Check if there's any data at all
        if (!this.timetableData || this.timetableData.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">🎓</div>
                    <h3>No Timetable Data</h3>
                    <p>Click the refresh button (🔄) above to fetch your timetable.</p>
                    <p style="font-size: 0.9em; color: #666; margin-top: 10px;">
                        First load may take 15-20 seconds while we authenticate and fetch your schedule.
                    </p>
                </div>
            `;
        }
        
        return `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h3>No classes found</h3>
                <p>No classes scheduled for the selected day.</p>
            </div>
        `;
    }

    showLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'flex';
        document.getElementById('app').classList.add('hidden');
    }

    hideLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
    }

    showErrorModal(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.remove('hidden');
    }

    hideErrorModal() {
        document.getElementById('errorModal').classList.add('hidden');
    }

    showWelcomeModal() {
        document.getElementById('welcomeModal').classList.remove('hidden');
    }

    hideWelcomeModal() {
        document.getElementById('welcomeModal').classList.add('hidden');
    }

    // PWA Functions
    setupPWAInstall() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            // Could add install button here if needed
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            console.log('PWA installed successfully');
        });
    }

    async installPWA() {
        if (!this.deferredPrompt) return;

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('PWA installed');
        }
        
        this.deferredPrompt = null;
    }

    // Dark Mode Functions
    getDarkModePreference() {
        const stored = localStorage.getItem('darkMode');
        if (stored !== null) {
            return stored === 'true';
        }
        // Default to system preference
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    initializeDarkMode() {
        // Apply dark mode immediately
        this.applyDarkMode();
        
        // Update button state immediately - no delay to prevent flicker
        this.updateDarkModeButton();
        
        // Listen for system dark mode changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            const stored = localStorage.getItem('darkMode');
            if (stored === null) { // Only auto-switch if user hasn't manually set preference
                this.darkMode = e.matches;
                this.applyDarkMode();
                this.updateDarkModeButton();
            }
        });
    }

    applyDarkMode() {
        if (this.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        localStorage.setItem('darkMode', this.darkMode.toString());
        this.applyDarkMode();
        this.updateDarkModeButton();
    }

    async toggleNotifications() {
        try {
            const currentState = this.notificationManager.isEnabled();
            
            if (!currentState) {
                // Show informative modal before enabling
                this.showNotificationModal();
            } else {
                // Disable directly
                const isEnabled = await this.notificationManager.toggleNotifications();
                this.updateNotificationButton(isEnabled);
                this.updateNotificationInfo(isEnabled);
                this.showToast('🔕 Notifications disabled.');
            }
        } catch (error) {
            console.error('Error toggling notifications:', error);
            this.showErrorModal('Failed to toggle notifications. Please check browser permissions.');
        }
    }

    async enableNotificationsFromModal() {
        try {
            this.hideNotificationModal();
            const isEnabled = await this.notificationManager.toggleNotifications();
            this.updateNotificationButton(isEnabled);
            this.updateNotificationInfo(isEnabled);
            
            if (isEnabled) {
                this.showToast('🔔 Notifications enabled! You\'ll get alerts 10 minutes before any room or class changes.');
            }
        } catch (error) {
            console.error('Error enabling notifications:', error);
            this.showErrorModal('Failed to enable notifications. Please check browser permissions.');
        }
    }

    updateNotificationButton(isEnabled) {
        const btn = document.getElementById('notificationBtn');
        const icon = document.getElementById('notificationIcon');
        
        if (btn && icon) {
            if (isEnabled) {
                btn.classList.remove('disabled');
                btn.title = 'Notifications Enabled - Click to Disable';
                icon.textContent = '🔔';
            } else {
                btn.classList.add('disabled');
                btn.title = 'Notifications Disabled - Click to Enable';
                icon.textContent = '🔕';
            }
        }
    }

    updateNotificationInfo(isEnabled) {
        const info = document.getElementById('notificationInfo');
        if (info) {
            if (isEnabled) {
                info.classList.add('hidden');
            } else {
                info.classList.remove('hidden');
            }
        }
    }

    showNotificationModal() {
        const modal = document.getElementById('notificationModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideNotificationModal() {
        const modal = document.getElementById('notificationModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showToast(message) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Hide and remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    updateDarkModeButton() {
        const btn = document.getElementById('darkModeBtn');
        if (btn) {
            btn.textContent = this.darkMode ? '☀️' : '🌙';
            btn.title = this.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        } else {
            // If button not ready, try again after a short delay
            setTimeout(() => {
                const retryBtn = document.getElementById('darkModeBtn');
                if (retryBtn) {
                    retryBtn.textContent = this.darkMode ? '☀️' : '🌙';
                    retryBtn.title = this.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode';
                }
            }, 50);
        }
    }

    setupServiceWorkerUpdates() {
        if ('serviceWorker' in navigator) {
            // Check if this is first install
            const isFirstInstall = !localStorage.getItem('pwa-installed');
            
            // Listen for service worker updates (silent updates)
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SW_UPDATED') {
                    console.log('App updated silently');
                }
                
                // Handle auto-refresh trigger from service worker
                if (event.data && event.data.type === 'AUTO_REFRESH') {
                    console.log('🔄 Auto-refresh triggered by service worker at 8:00 AM IST');
                    this.refreshTimetable(false); // Manual refresh to get fresh data
                }
                
                // Handle notification check requests
                if (event.data && event.data.type === 'CHECK_NOTIFICATIONS') {
                    if (this.notificationManager) {
                        this.notificationManager.checkForUpcomingClasses();
                    }
                }
            });

            // Mark as installed after first load
            if (isFirstInstall) {
                localStorage.setItem('pwa-installed', 'true');
            }

            // Check for updates every 30 minutes (less frequent)
            setInterval(() => {
                navigator.serviceWorker.ready.then((registration) => {
                    registration.update();
                });
            }, 30 * 60 * 1000);
        }
    }

    // Remove setupOneSignal - we're using native notifications now

    showUpdateNotification(message) {
        // Remove any existing notifications first
        this.removeExistingNotifications();
        
        // Create update notification
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-content">
                <div class="update-icon">✅</div>
                <div class="update-text">
                    <div class="update-title">App Updated!</div>
                    <div class="update-message">${message}</div>
                </div>
                <button class="update-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }


    removeExistingNotifications() {
        // Remove any existing update notifications
        const existingNotifications = document.querySelectorAll('.update-notification');
        existingNotifications.forEach(notification => {
            notification.remove();
        });
    }

    showRateLimitNotification(timeMessage, totalSeconds) {
        // Remove any existing notifications
        this.removeExistingNotifications();
        
        const notification = document.createElement('div');
        notification.className = 'update-notification rate-limit-notification';
        notification.innerHTML = `
            <div class="update-content">
                <div class="update-icon">⏱️</div>
                <div class="update-text">
                    <div class="update-title">⚠️ Please Wait</div>
                    <div class="update-message">You can refresh again in <strong id="countdown">${timeMessage}</strong></div>
                </div>
                <button class="update-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Countdown timer
        let remainingSeconds = totalSeconds;
        const countdownInterval = setInterval(() => {
            remainingSeconds--;
            
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
                if (notification.parentElement) {
                    notification.remove();
                }
                return;
            }
            
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            
            // Format time nicely
            let timeText;
            if (minutes > 0) {
                timeText = `${minutes}:${seconds.toString().padStart(2, '0')} min`;
            } else {
                timeText = `${seconds} sec`;
            }
            
            const countdownElement = notification.querySelector('#countdown');
            if (countdownElement) {
                countdownElement.textContent = timeText;
            }
        }, 1000);
        
        // Auto remove after countdown + 2 seconds
        setTimeout(() => {
            clearInterval(countdownInterval);
            if (notification.parentElement) {
                notification.remove();
            }
        }, (totalSeconds + 2) * 1000);
    }

    updateLastUpdateTimeFromTimestamp(timestamp) {
        try {
            const lastUpdate = new Date(timestamp);
            
            // Format time as "8:00 AM" or "2:30 PM"
            const hours = lastUpdate.getHours();
            const minutes = lastUpdate.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12; // Convert 0 to 12 for midnight
            const displayMinutes = minutes.toString().padStart(2, '0');
            
            // Get today's date to check if it's today or another day
            const now = new Date();
            const isToday = lastUpdate.toDateString() === now.toDateString();
            
            let timeString;
            if (isToday) {
                timeString = `Today at ${displayHours}:${displayMinutes} ${ampm}`;
            } else {
                // Show date if not today
                const day = lastUpdate.getDate();
                const month = lastUpdate.toLocaleString('en-US', { month: 'short' });
                timeString = `${day} ${month} at ${displayHours}:${displayMinutes} ${ampm}`;
            }
            
            const lastUpdateElement = document.getElementById('lastUpdateTime');
            if (lastUpdateElement) {
                lastUpdateElement.textContent = timeString;
                lastUpdateElement.style.color = ''; // Reset to default color
            }
        } catch (error) {
            console.error('Error updating last update time:', error);
        }
    }

    async updateLastUpdateTime() {
        try {
            // Get storage info from IndexedDB
            const storageInfo = await this.db.getStorageInfo();
            
            if (storageInfo && storageInfo.lastUpdate) {
                this.updateLastUpdateTimeFromTimestamp(new Date(storageInfo.lastUpdate).toISOString());
            } else {
                const lastUpdateElement = document.getElementById('lastUpdateTime');
                if (lastUpdateElement) {
                    lastUpdateElement.textContent = 'Click refresh to load data';
                    lastUpdateElement.style.color = '#f59e0b'; // Orange color to catch attention
                }
            }
        } catch (error) {
            console.error('Error updating last update time:', error);
            const lastUpdateElement = document.getElementById('lastUpdateTime');
            if (lastUpdateElement) {
                lastUpdateElement.textContent = 'Click refresh to load data';
            }
        }
    }

}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TimetableApp();
});

// Handle PWA display mode
if (window.matchMedia('(display-mode: standalone)').matches) {
    document.body.classList.add('pwa-installed');
}
