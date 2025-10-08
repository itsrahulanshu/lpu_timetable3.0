# 🎓 LPU Timetable PWA

Progressive Web App for LPU students with offline support and smart notifications.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/itsrahulanshu/timelpu)

## ✨ Features

- 🔄 Smart Refresh (10-min cooldown + Auto 8 AM IST)
- 📱 Offline Support (IndexedDB + Service Worker)
- 🔔 Notifications (10-min alerts, room changes)
- �� Dark Mode
- ⚡ Fast & Lightweight

## 🚀 Quick Start

```bash
# Clone & Install
git clone https://github.com/itsrahulanshu/timelpu.git
cd timelpu
npm install

# Configure
cp .env.example .env
# Edit .env with: UMS_USERNAME, UMS_PASSWORD, ANTICAPTCHA_API_KEY

# Run
npm start
# Open http://localhost:3000
```

## ☁️ Deploy to Vercel

1. Push to GitHub
2. Import on [Vercel](https://vercel.com/new)
3. Add environment variables
4. Deploy!

## 📖 Usage

1. 🔄 Click Refresh to fetch timetable
2. 🔔 Enable Notifications for alerts
3. 🌙 Toggle Dark Mode
4. 📱 Install as PWA

## 🔧 Tech

Express.js • IndexedDB • Service Workers • Web Notifications • Vercel

---

Made with ❤️ for LPU students
