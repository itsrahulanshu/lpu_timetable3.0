# LPU Timetable PWA 📚

A modern Progressive Web App for LPU students to access their timetables with offline support, smart notifications, and automatic updates.

## ✨ Features

- **📱 Progressive Web App** - Install on any device, works like a native app
- **🔄 Smart Auto-Refresh** - Automatically updates timetable data
- **📴 Offline Support** - Access your timetable even without internet
- **🔔 Smart Notifications** - Get notified about upcoming classes
- **🌙 Dark Mode** - Easy on the eyes with automatic theme switching
- **⚡ Fast & Responsive** - Optimized for all screen sizes

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- LPU UMS credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/itsrahulanshu/timelpu.git
   cd timelpu
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open your browser**
   ```
   http://localhost:3001
   ```

## 🌐 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/itsrahulanshu/timelpu)

1. Click the deploy button above
2. Connect your GitHub account
3. Add environment variables in Vercel dashboard
4. Deploy!

## 📱 Usage

1. **First Visit**: Enter your LPU registration number
2. **Install PWA**: Click "Add to Home Screen" when prompted
3. **Enable Notifications**: Allow notifications for class reminders
4. **Enjoy**: Your timetable updates automatically!

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript, CSS3, HTML5
- **Backend**: Node.js, Express.js
- **Deployment**: Vercel (Serverless)
- **APIs**: LPU UMS Integration
- **PWA**: Service Worker, Web App Manifest

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⭐ Support

If this project helped you, please give it a ⭐ on GitHub!

---

Made with ❤️ for LPU students by [@itsrahulanshu](https://github.com/itsrahulanshu)
