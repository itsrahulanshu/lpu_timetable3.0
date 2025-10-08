const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const ac = require('@antiadmin/anticaptchaofficial');

// ============================================
// 🔧 CONFIGURATION
// ============================================

// Load environment variables
require('dotenv').config();

// Detect Vercel environment
const isVercel = process.env.VERCEL === '1';
const tempDir = isVercel ? '/tmp' : path.join(__dirname, '..', 'temp');
const dataDir = isVercel ? '/tmp' : path.join(__dirname, 'data');

// Configuration constants
const CONFIG = {
    antiCaptcha: {
        apiKey: process.env.ANTICAPTCHA_API_KEY || '',
        minBalance: parseFloat(process.env.ANTICAPTCHA_MIN_BALANCE) || 0.001
    },
    credentials: {
        username: process.env.UMS_USERNAME || '',
        password: process.env.UMS_PASSWORD || ''
    },
    requests: {
        timeout: parseInt(process.env.REQUEST_TIMEOUT) || 15000,
        maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.RETRY_DELAY) || 2000
    },
    debug: {
        saveCaptchaImage: process.env.SAVE_CAPTCHA_IMAGES === 'true',
        captchaImagePath: path.join(tempDir, 'captcha_debug.png')
    },
    cookies: {
        saveSessionCookies: process.env.SAVE_SESSION_COOKIES !== 'false',
        cookieFile: path.join(dataDir, 'session_cookies.json')
    },
    urls: {
        loginPage: 'https://ums.lpu.in/lpuums/LoginNew.aspx',
        captchaParams: 'https://ums.lpu.in/LpuUms/BotDetectCaptcha.ashx?get=p&c=c_loginnew_examplecaptcha',
        captchaImage: 'https://ums.lpu.in/LpuUms/BotDetectCaptcha.ashx?get=image&c=c_loginnew_examplecaptcha'
    }
};

// Validation function
function validateConfig() {
    const errors = [];
    
    if (!CONFIG.credentials.username || !CONFIG.credentials.password) {
        errors.push('UMS credentials not configured - Set UMS_USERNAME and UMS_PASSWORD environment variables');
    }
    
    if (!CONFIG.antiCaptcha.apiKey) {
        errors.push('Anti-Captcha API key not configured - Set ANTICAPTCHA_API_KEY environment variable');
    }
    
    if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(error => console.error(`   • ${error}`));
        console.error('\n📝 Please set the required environment variables:');
        console.error('   • UMS_USERNAME=your_username');
        console.error('   • UMS_PASSWORD=your_password');
        console.error('   • ANTICAPTCHA_API_KEY=your_api_key');
        return false;
    }
    
    console.log('✅ Configuration is valid');
    return true;
}

// ============================================
// 🚀 MAIN AUTOMATION CLASS
// ============================================

class LPUAutomatedLogin {
    constructor() {
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
        
        this.cookies = '';
        this.sessionCookies = '';
        this.scrapedData = null;
        
        // Validate configuration
        if (!validateConfig()) {
            throw new Error('Configuration validation failed');
        }
        
        // Initialize Anti-Captcha
        ac.setAPIKey(CONFIG.antiCaptcha.apiKey);
    }

    // ============================================
    // 📥 STEP 1: SCRAPE LOGIN PAGE DATA
    // ============================================
    async scrapeLoginPageData() {
        console.log('📥 Scraping login page...');
        
        try {
            const response = await axios.get(CONFIG.urls.loginPage, {
                headers: {
                    'Host': 'ums.lpu.in',
                    'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Accept-Language': 'en-GB,en;q=0.9',
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-User': '?1',
                    'Sec-Fetch-Dest': 'document',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Priority': 'u=0, i',
                    'Connection': 'keep-alive'
                },
                httpsAgent: this.httpsAgent,
                timeout: CONFIG.requests.timeout
            });

            // Extract cookies
            const setCookieHeader = response.headers['set-cookie'];
            if (setCookieHeader) {
                const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : setCookieHeader;
                const gaMatch = cookieString.match(/_ga_B0Z6G6GCD8=([^;]+)/);
                if (gaMatch) {
                    this.cookies = `_ga_B0Z6G6GCD8=${gaMatch[1]}`;
                }
            }

            // Parse HTML and extract form values
            const $ = cheerio.load(response.data);
            
            this.scrapedData = {
                BDC_VCID_c_loginnew_examplecaptcha: $('#BDC_VCID_c_loginnew_examplecaptcha').val(),
                BDC_BackWorkaround_c_loginnew_examplecaptcha: $('#BDC_BackWorkaround_c_loginnew_examplecaptcha').val(),
                BDC_Hs_c_loginnew_examplecaptcha: $('#BDC_Hs_c_loginnew_examplecaptcha').val(),
                BDC_SP_c_loginnew_examplecaptcha: $('#BDC_SP_c_loginnew_examplecaptcha').val(),
                __VIEWSTATEGENERATOR: $('#__VIEWSTATEGENERATOR').val(),
                __SCROLLPOSITIONX: $('#__SCROLLPOSITIONX').val() || '0',
                __SCROLLPOSITIONY: $('#__SCROLLPOSITIONY').val() || '0',
                __EVENTVALIDATION: $('#__EVENTVALIDATION').val(),
                __VIEWSTATE: $('#__VIEWSTATE').val()
            };

            console.log('✅ Page data scraped');
            
            return true;
        } catch (error) {
            console.error('❌ Error scraping login page:', error.message);
            throw error;
        }
    }

    // ============================================
    // 🎯 STEP 2: GET CAPTCHA PARAMETERS
    // ============================================
    async getCaptchaParameters() {
        console.log('🎯 Getting captcha parameters...');
        
        const currentTime = Date.now();
        const vcid = this.scrapedData.BDC_VCID_c_loginnew_examplecaptcha;
        
        try {
            const response = await axios.get(`${CONFIG.urls.captchaParams}&t=${vcid}&d=${currentTime}`, {
                headers: {
                    'Host': 'ums.lpu.in',
                    'Cookie': this.cookies,
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Accept-Language': 'en-GB,en;q=0.9',
                    'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Accept': '*/*',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty',
                    'Referer': 'https://ums.lpu.in/lpuums/',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Priority': 'u=1, i',
                    'Connection': 'keep-alive'
                },
                httpsAgent: this.httpsAgent,
                timeout: CONFIG.requests.timeout
            });

            const captchaParams = response.data;
            console.log('✅ Parameters received');
            
            return {
                sp: captchaParams.sp,
                hs: captchaParams.hs,
                vcid: vcid,
                timestamp: currentTime
            };
        } catch (error) {
            console.error('❌ Error getting captcha parameters:', error.message);
            throw error;
        }
    }

    // ============================================
    // 🖼️ STEP 3: GET CAPTCHA IMAGE
    // ============================================
    async getCaptchaImage(captchaParams) {
        console.log('🖼️ Downloading captcha...');
        
        try {
            const response = await axios.get(`${CONFIG.urls.captchaImage}&t=${captchaParams.vcid}&d=${captchaParams.timestamp}`, {
                headers: {
                    'Host': 'ums.lpu.in',
                    'Cookie': this.cookies,
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Accept-Language': 'en-GB,en;q=0.9',
                    'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Dest': 'image',
                    'Referer': 'https://ums.lpu.in/lpuums/',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Priority': 'i',
                    'Connection': 'keep-alive'
                },
                httpsAgent: this.httpsAgent,
                responseType: 'arraybuffer',
                timeout: CONFIG.requests.timeout
            });

            // Optionally save image for debugging
            if (CONFIG.debug.saveCaptchaImage) {
                await fs.writeFile(CONFIG.debug.captchaImagePath, response.data);
            }
            
            // Convert to base64 for Anti-Captcha (keep in memory only)
            const base64Image = Buffer.from(response.data).toString('base64');
            console.log('✅ Captcha downloaded');
            return base64Image;
        } catch (error) {
            console.error('❌ Error downloading captcha image:', error.message);
            throw error;
        }
    }

    // ============================================
    // 🤖 STEP 4: SOLVE CAPTCHA USING ANTI-CAPTCHA
    // ============================================
    async solveCaptcha(base64Image) {
        console.log('🤖 Solving captcha...');
        
        try {
            // Check account balance
            const balance = await ac.getBalance();
            
            if (balance < CONFIG.antiCaptcha.minBalance) {
                throw new Error(`Insufficient balance in Anti-Captcha account. Minimum required: $${CONFIG.antiCaptcha.minBalance}`);
            }

            // Solve the captcha
            const captchaResult = await ac.solveImage(base64Image, true);
            console.log(`✅ Captcha solved: ${captchaResult}`);
            
            return captchaResult;
        } catch (error) {
            console.error('❌ Error solving captcha:', error.message);
            throw error;
        }
    }

    // ============================================
    // 🔄 STEP 5: CONVERT CAPTCHA TEXT
    // ============================================
    convertCaptchaText(text, sp, hs, vcid) {
        console.log('🔄 Converting captcha...');
        
        // Find pattern by solving hash puzzle
        let currentPos = parseInt(sp);
        const targetHash = hs;
        
        while (true) {
            const testString = currentPos.toString() + vcid;
            const hash = crypto.createHash('sha1').update(testString).digest('hex');
            
            if (hash === targetHash) {
                break;
            }
            currentPos++;
        }
        
        // Convert pattern to binary
        const caseModifier = currentPos % 65533 + 1;
        const binaryPattern = (caseModifier >>> 0).toString(2);
        
        // Apply case conversion
        const binaryArray = binaryPattern.split("");
        const binaryLength = binaryArray.length;
        const textArray = text.split("");
        let result = "";
        
        for (let i = text.length - 1; i >= 0; i--) {
            const binaryIndex = binaryLength - (text.length - i);
            const binaryDigit = binaryArray[binaryIndex];
            
            if (binaryDigit !== undefined && binaryDigit === "1") {
                result = textArray[i].toUpperCase() + result;
            } else {
                result = textArray[i].toLowerCase() + result;
            }
        }
        
        console.log(`✅ Converted: ${text} → ${result}`);
        return result;
    }

    // ============================================
    // 📤 STEP 6: SUBMIT LOGIN FORM
    // ============================================
    async submitLoginForm(convertedCaptcha) {
        console.log('📤 Submitting login...');
        
        // Prepare form data
        const formData = new URLSearchParams();
        formData.append('__LASTFOCUS', '');
        formData.append('__EVENTTARGET', '');
        formData.append('__EVENTARGUMENT', '');
        formData.append('__VIEWSTATE', this.scrapedData.__VIEWSTATE);
        formData.append('__VIEWSTATEGENERATOR', this.scrapedData.__VIEWSTATEGENERATOR);
        formData.append('__SCROLLPOSITIONX', this.scrapedData.__SCROLLPOSITIONX);
        formData.append('__SCROLLPOSITIONY', this.scrapedData.__SCROLLPOSITIONY);
        formData.append('__EVENTVALIDATION', this.scrapedData.__EVENTVALIDATION);
        formData.append('DropDownList1', '1');
        formData.append('txtU', CONFIG.credentials.username);
        formData.append('TxtpwdAutoId_8767', CONFIG.credentials.password);
        formData.append('CaptchaCodeTextBox', convertedCaptcha);
        formData.append('BDC_VCID_c_loginnew_examplecaptcha', this.scrapedData.BDC_VCID_c_loginnew_examplecaptcha);
        formData.append('BDC_BackWorkaround_c_loginnew_examplecaptcha', this.scrapedData.BDC_BackWorkaround_c_loginnew_examplecaptcha || '1');
        formData.append('BDC_Hs_c_loginnew_examplecaptcha', this.scrapedData.BDC_Hs_c_loginnew_examplecaptcha);
        formData.append('BDC_SP_c_loginnew_examplecaptcha', this.scrapedData.BDC_SP_c_loginnew_examplecaptcha);
        formData.append('iBtnLogins150203125', 'Login');

        try {
            const response = await axios.post(CONFIG.urls.loginPage, formData.toString(), {
                headers: {
                    'Host': 'ums.lpu.in',
                    'Cookie': this.cookies,
                    'Content-Length': formData.toString().length,
                    'Cache-Control': 'max-age=0',
                    'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Accept-Language': 'en-GB,en;q=0.9',
                    'Origin': 'https://ums.lpu.in',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-User': '?1',
                    'Sec-Fetch-Dest': 'document',
                    'Referer': 'https://ums.lpu.in/lpuums/LoginNew.aspx',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Priority': 'u=0, i',
                    'Connection': 'keep-alive'
                },
                httpsAgent: this.httpsAgent,
                timeout: CONFIG.requests.timeout,
                maxRedirects: 0,
                validateStatus: function (status) {
                    return status < 400; // Accept redirects as success
                }
            });

            // Check if login was successful
            if (response.status === 302 || response.headers.location) {
                console.log('🎉 Login successful!');
                
                // Save session cookies after successful login
                await this.extractAndSaveCookies(response);
                
                return {
                    success: true,
                    redirectUrl: response.headers.location,
                    response: response,
                    cookies: this.sessionCookies
                };
            } else if (response.data.includes('Invalid') || response.data.includes('Error')) {
                console.log('❌ Login failed - Invalid credentials or captcha');
                return {
                    success: false,
                    error: 'Invalid credentials or captcha',
                    response: response
                };
            } else {
                console.log('✅ Login successful');
                
                // Save session cookies after successful login
                await this.extractAndSaveCookies(response);
                
                return {
                    success: true,
                    response: response,
                    cookies: this.sessionCookies
                };
            }
        } catch (error) {
            if (error.response && error.response.status === 302) {
                console.log('🎉 Login successful!');
                
                // Save session cookies after successful login
                await this.extractAndSaveCookies(error.response);
                
                return {
                    success: true,
                    redirectUrl: error.response.headers.location,
                    response: error.response,
                    cookies: this.sessionCookies
                };
            } else {
                console.error('❌ Error submitting form:', error.message);
                throw error;
            }
        }
    }

    // ============================================
    // 🍪 COOKIE MANAGEMENT METHOD
    // ============================================
    async extractAndSaveCookies(response) {
        if (!CONFIG.cookies.saveSessionCookies) {
            return;
        }
        
        console.log('🍪 Saving cookies...');
        
        try {
            // Ensure the directory exists
            const cookieDir = path.dirname(CONFIG.cookies.cookieFile);
            if (!fsSync.existsSync(cookieDir)) {
                await fs.mkdir(cookieDir, { recursive: true });
                console.log('📁 Created cookie directory:', cookieDir);
            }
            // Extract cookies from Set-Cookie header
            const setCookieHeader = response.headers['set-cookie'];
            let allCookies = [];
            
            if (setCookieHeader && Array.isArray(setCookieHeader)) {
                setCookieHeader.forEach(cookieString => {
                    // Extract the cookie name=value part (before the first semicolon)
                    const cookiePart = cookieString.split(';')[0];
                    if (cookiePart && cookiePart.includes('=')) {
                        allCookies.push(cookiePart);
                    }
                });
            }
            
            // Combine with existing cookies, avoiding duplicates
            const existingCookies = this.cookies.split('; ').filter(c => c.length > 0);
            const combinedCookies = [...existingCookies];
            
            allCookies.forEach(newCookie => {
                const cookieName = newCookie.split('=')[0];
                // Remove any existing cookie with the same name
                const filteredCookies = combinedCookies.filter(c => !c.startsWith(cookieName + '='));
                combinedCookies.splice(0, combinedCookies.length, ...filteredCookies, newCookie);
            });
            
            this.sessionCookies = combinedCookies.join('; ');
            
            // Save cookies to file for reuse
            const cookieData = {
                timestamp: new Date().toISOString(),
                username: CONFIG.credentials.username,
                cookies: this.sessionCookies,
                cookieArray: combinedCookies,
                loginSuccess: true
            };
            
            await fs.writeFile(CONFIG.cookies.cookieFile, JSON.stringify(cookieData, null, 2), 'utf8');
            
            console.log('✅ Cookies saved');
            
        } catch (error) {
            console.error('❌ Error extracting cookies:', error.message);
        }
    }

    // ============================================
    // 🚀 MAIN AUTOMATION METHOD
    // ============================================
    async runAutomation() {
        console.log('🚀 Starting LPU Login Automation\n');
        
        try {
            await this.scrapeLoginPageData();
            const captchaParams = await this.getCaptchaParameters();
            const base64Image = await this.getCaptchaImage(captchaParams);
            const solvedCaptcha = await this.solveCaptcha(base64Image);
            const convertedCaptcha = this.convertCaptchaText(
                solvedCaptcha, 
                captchaParams.sp, 
                captchaParams.hs, 
                captchaParams.vcid
            );
            const result = await this.submitLoginForm(convertedCaptcha);
            
            console.log('\n' + (result.success ? '✅ LOGIN SUCCESSFUL' : '❌ LOGIN FAILED'));
            
            return result;
            
        } catch (error) {
            console.error('\n💥 AUTOMATION FAILED:', error.message);
            throw error;
        }
    }
}

// ============================================
// 🎯 EXPORT AND EXECUTION
// ============================================

// Export for use in other modules
module.exports = { LPUAutomatedLogin };

// Run if this file is executed directly
if (require.main === module) {
    const automation = new LPUAutomatedLogin();
    automation.runAutomation()
        .then(result => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}
