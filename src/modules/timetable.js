const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');

class TimetableManager {
    constructor(authManager) {
        this.authManager = authManager;
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
        
        // Course data
        this.COURSE_DATA = [
            {"CourseCode": "CAP100M", "CourseName": "PROGRAMME ORIENTATION"},
            {"CourseCode": "CAP443", "CourseName": "LINUX AND SHELL SCRIPTING - LAB"},
            {"CourseCode": "CAP455", "CourseName": "OBJECT ORIENTED PROGRAMMING USING C++"},
            {"CourseCode": "CAP476", "CourseName": "DATA COMMUNICATION AND NETWORKING"},
            {"CourseCode": "CAP478", "CourseName": "DATA COMMUNICATION AND NETWORKING-LABORATORY"},
            {"CourseCode": "CAP570", "CourseName": "ADVANCED DATABASE TECHNIQUES"},
            {"CourseCode": "CAP598", "CourseName": "SOFTWARE ENGINEERING AND PROJECT MANAGEMENT"},
            {"CourseCode": "PEA515", "CourseName": "ANALYTICAL SKILLS-I"},
            {"CourseCode": "PEL544", "CourseName": "CORPORATE COMMUNICATION SKILLS"},
            {"CourseCode": "PETV67", "CourseName": "BUILDING WEALTH"}
        ];
    }

    getCourseName(courseCode) {
        const course = this.COURSE_DATA.find(c => c.CourseCode === courseCode);
        return course ? course.CourseName : courseCode;
    }

    parseClassDescription(description) {
        const info = {
            type: 'Lecture',
            course: 'Unknown',
            courseName: 'Unknown Course',
            room: null,
            building: null,
            roomNumber: null,
            group: null,
            section: null
        };

        // Extract type (Lecture/Practical/Tutorial)
        if (description.includes('Practical')) {
            info.type = 'Practical';
        } else if (description.includes('Tutorial')) {
            info.type = 'Tutorial';
        }

        // Extract course code
        const courseMatch = description.match(/C:([A-Z0-9]+)/);
        if (courseMatch) {
            info.course = courseMatch[1];
            info.courseName = this.getCourseName(courseMatch[1]);
        }

        // Extract room and parse building/room number
        const roomMatch = description.match(/R:\s*([^\\r\\/]+)/);
        if (roomMatch) {
            info.room = roomMatch[1].trim();
            
            // Parse building and room number (e.g., "26-602D" or "26-602 D")
            // Capture optional trailing letter after room number with optional space
            const buildingRoomMatch = info.room.match(/(\d+)-(\d+)\s*([A-Za-z])?/);
            if (buildingRoomMatch) {
                info.building = buildingRoomMatch[1];
                info.roomNumber = buildingRoomMatch[2] + (buildingRoomMatch[3] ? buildingRoomMatch[3].toUpperCase() : '');
            } else {
                // Handle special cases like "Assignment-1" or other formats
                if (info.room.includes('-')) {
                    const parts = info.room.split('-');
                    info.building = parts[0];
                    info.roomNumber = parts[1].replace(/\s+/g, '');
                } else {
                    info.building = '';
                    info.roomNumber = info.room;
                }
            }
        }

        // Extract group (number or "All")
        const groupMatch = description.match(/G:(\d+|All)/i);
        if (groupMatch) {
            info.group = groupMatch[1];
        }

        // Extract section
        const sectionMatch = description.match(/S:([A-Z0-9]+)/);
        if (sectionMatch) {
            info.section = sectionMatch[1];
        }

        return info;
    }

    parseTimeRange(timeStr) {
        // Parse "09-10 AM" or "12-01 PM" format
        const [timeRange, period] = timeStr.split(' ');
        const [startHour, endHour] = timeRange.split('-').map(h => parseInt(h));
        
        let start = startHour;
        let end = endHour;
        
        // Convert to 24-hour format
        if (period === 'PM') {
            // For PM times, add 12 unless it's 12 PM (noon)
            if (start !== 12) {
                start += 12;
            }
            // For end time in PM
            if (end !== 12) {
                end += 12;
            }
            // Handle special case where end hour is smaller (like 12-01 PM)
            if (end <= start) {
                end = start + 1;
            }
        } else if (period === 'AM') {
            // For AM times, 12 AM becomes 0 (midnight)
            if (start === 12) {
                start = 0;
            }
            if (end === 12) {
                end = 12; // 12 noon
            } else if (end < start) {
                end += 12; // Next day or wrap around
            }
        }
        
        return {
            start: start * 60,
            end: end * 60
        };
    }

    processClassItem(classItem) {
        const parsedInfo = this.parseClassDescription(classItem.Description);
        const timeRange = this.parseTimeRange(classItem.AttendanceTime);
        
        // Override building/room fields with parsed values to ensure consistency
        return {
            ...classItem,
            Building: parsedInfo.building,
            RoomNumber: parsedInfo.roomNumber,
            Room: parsedInfo.room,
            parsedInfo,
            timeRange
        };
    }

    parseTimetableHTML(htmlContent) {
        const $ = cheerio.load(htmlContent);
        const timetableData = [];
        
        // Extract data from each day's schedule
        $('.w-schedule__day').each((dayIndex, dayElement) => {
            const dayName = $(dayElement).find('.w-schedule__col-label').text().trim();
            
            $(dayElement).find('.w-schedule__event-wrapper').each((eventIndex, eventElement) => {
                const $event = $(eventElement);
                const title = $event.attr('title');
                const $link = $event.find('a');
                const onclick = $link.attr('onclick');
                
                if (title && onclick) {
                    // Extract time from onclick function - look for time pattern like "09:00-10:00"
                    const timeMatch = onclick.match(/"(\d{2}:\d{2}-\d{2}:\d{2})"/);
                    const timeStr = timeMatch ? timeMatch[1] : '';
                    
                    
                    // Parse the title to extract class information
                    const classInfo = this.parseClassDescription(title);
                    
                    // Convert time format (e.g., "09:00-10:00" to "09-10 AM")
                    let attendanceTime = '';
                    if (timeStr && timeStr.includes('-')) {
                        const [startTime, endTime] = timeStr.split('-');
                        const startHour = parseInt(startTime.split(':')[0]);
                        const endHour = parseInt(endTime.split(':')[0]);
                        
                        if (!isNaN(startHour) && !isNaN(endHour)) {
                            if (startHour < 12) {
                                attendanceTime = `${startHour}-${endHour} AM`;
                            } else if (startHour === 12) {
                                attendanceTime = `${startHour}-${endHour} PM`;
                            } else {
                                attendanceTime = `${startHour - 12}-${endHour - 12} PM`;
                            }
                        } else {
                            attendanceTime = '09-10 AM'; // Default time slot
                        }
                    } else {
                        // Fallback: try to extract time from the title or use a default
                        attendanceTime = '09-10 AM'; // Default time slot
                    }
                    
                    timetableData.push({
                        Description: title,
                        AttendanceTime: attendanceTime,
                        Day: dayName,
                        // Add other fields that might be needed
                        CourseCode: classInfo.course,
                        CourseName: classInfo.courseName,
                        Room: classInfo.room,
                        Building: classInfo.building,
                        RoomNumber: classInfo.roomNumber,
                        Group: classInfo.group,
                        Section: classInfo.section,
                        Type: classInfo.type
                    });
                }
            });
        });
        
        return timetableData;
    }

    async fetchFreshTimetableData(retryCount = 0) {
        const MAX_RETRIES = 2;
        
        try {
            // Only authenticate if we don't have a valid session
            if (!this.authManager.hasValidSession()) {
                console.log('🔐 No session, authenticating...');
                const sessionCookies = await this.authManager.authenticateWithUMS();
                if (!sessionCookies) {
                    throw new Error('Authentication failed');
                }
            }

            console.log('📅 Fetching timetable from new API...');
            
            // Use the new timetable API endpoint
            let response;
            try {
                response = await axios.post(
                'https://ums.lpu.in/lpuums/frmMyCurrentTimeTable.aspx/GetTimeTable',
                {
                    TermId: "25261"
                },
                {
                    httpsAgent: this.httpsAgent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'Accept-Encoding': 'gzip, deflate, br, zstd',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Origin': 'https://ums.lpu.in',
                        'Referer': 'https://ums.lpu.in/lpuums/frmMyCurrentTimeTable.aspx',
                        'Cookie': this.authManager.getSessionCookies()
                    }
                }
            );
            } catch (axiosError) {
                // Handle axios errors (network errors, HTTP errors, etc.)
                if (axiosError.response && axiosError.response.status >= 400 && retryCount < MAX_RETRIES) {
                    console.log(`⚠️ Authentication failed (${axiosError.response.status}) - re-authenticating... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                    await this.authManager.clearSessionData();
                    const sessionCookies = await this.authManager.authenticateWithUMS(true); // Force refresh
                    if (!sessionCookies) {
                        throw new Error('Re-authentication failed');
                    }
                    
                    // Retry the request with new session
                    console.log('🔄 Retrying request with new session...');
                    try {
                        response = await axios.post(
                            'https://ums.lpu.in/lpuums/frmMyCurrentTimeTable.aspx/GetTimeTable',
                            {
                                TermId: "25261"
                            },
                            {
                                httpsAgent: this.httpsAgent,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                                    'Content-Type': 'application/json',
                                    'X-Requested-With': 'XMLHttpRequest',
                                    'Content-Type': 'application/json; charset=UTF-8',
                                    'Origin': 'https://ums.lpu.in',
                                    'Referer': 'https://ums.lpu.in/lpuums/frmMyCurrentTimeTable.aspx',
                                    'Cookie': this.authManager.getSessionCookies()
                                }
                            }
                        );
                    } catch (retryError) {
                        // If retry fails, try recursive call with incremented retry count
                        if (retryCount + 1 < MAX_RETRIES) {
                            console.log(`🔄 Recursive retry (${retryCount + 2}/${MAX_RETRIES})...`);
                            return await this.fetchFreshTimetableData(retryCount + 1);
                        } else {
                            throw new Error(`Re-authentication retry failed after ${MAX_RETRIES} attempts: ${retryError.message}`);
                        }
                    }
                } else {
                    throw new Error(`Request failed: ${axiosError.message}`);
                }
            }

            if (!response.data || !response.data.d) {
                console.log('⚠️ Empty response - session expired');
                await this.authManager.clearSessionData();
                throw new Error('Session expired - empty timetable data');
            }

            // Parse the HTML response to extract timetable data
            const timetableData = this.parseTimetableHTML(response.data.d);
            console.log(`✅ Fetched ${timetableData.length} classes`);
            
            return timetableData;
        } catch (error) {
            console.error('❌ Error fetching fresh timetable:', error.message);
            
            // If session expired, try re-authentication once
            if (error.message.includes('Session expired') && this.authManager.hasValidSession()) {
                console.log('🔄 Re-authenticating...');
                await this.authManager.clearSessionData();
                return await this.fetchFreshTimetableData();
            }
            
            throw error;
        }
    }
}

module.exports = TimetableManager;
