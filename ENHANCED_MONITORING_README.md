# Enhanced Monitoring System

## 🚀 Overview

The Enhanced Monitoring System is a comprehensive backend service that provides scheduled URL monitoring with dynamic management capabilities. It extends the basic continuous monitoring with advanced features like scheduled starts, REST API management, and a web-based admin interface.

## ✨ Key Features

### 🎯 **Scheduled Monitoring**
- **Immediate Start**: URLs can start monitoring immediately upon addition
- **Custom Start Time**: Schedule URLs to begin monitoring at specific dates/times
- **Dynamic Control**: Start, pause, and resume monitoring for individual URLs
- **Priority Levels**: Set priority levels (low, medium, high) for URL processing

### 🌐 **REST API Management**
- Complete CRUD operations for URL management
- Real-time status monitoring
- System health endpoints
- JSON-based configuration

### 💻 **Web Admin Interface**
- Modern, responsive web interface
- Real-time status updates
- Easy URL addition and removal
- Visual status indicators

### 📊 **Enhanced Monitoring**
- **Initial Data Caching**: Fetch baseline data before continuous monitoring
- **Change Detection**: Accurate comparison with cached baseline
- **Persistent Storage**: Configuration stored in `urls-config.json`
- **State Management**: Track URL states (pending, ready, active, paused, error)

## 🏗️ System Architecture

```
Enhanced Monitoring System
├── URLManager (URL CRUD operations)
├── Scheduler (Time-based activation)
├── REST API (External interface)
├── Web Interface (Admin UI)
└── Data Persistence (JSON storage)
```

## 📋 URL States Workflow

```
1. PENDING → URL added, waiting for initial fetch
2. PREPARING → Performing initial data fetch
3. READY → Initial fetch complete, waiting for start time
4. ACTIVE → Continuous monitoring in progress  
5. PAUSED → Monitoring temporarily stopped
6. ERROR → An error occurred during processing
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- NPM (included with Node.js)

### Installation
```bash
# Install dependencies
npm install

# Start the enhanced monitoring system
npm run enhanced-monitor
```

### Environment Configuration
Create a `.env` file with optional configuration:
```env
API_PORT=3000
ENABLE_NOTIFICATIONS=true
TARGET_URL_1=https://example1.com
TARGET_URL_2=https://example2.com
# ... up to TARGET_URL_15
```

## 🌐 Web Admin Interface

Access the admin interface at: `http://localhost:3000`

### Features:
- **Add URLs**: Enter URL, set start time, interval, and priority
- **Manage URLs**: Start, pause, or remove URLs
- **Real-time Status**: Live updates every 5 seconds
- **Responsive Design**: Works on desktop and mobile

### Adding URLs via Web Interface:
1. Enter the URL (required)
2. Choose start time:
   - **Start Now**: Begin monitoring immediately
   - **Custom Time**: Schedule for a specific date/time
3. Set monitoring interval (milliseconds)
4. Choose priority level
5. Click "Add URL"

## 📡 REST API Endpoints

### Base URL: `http://localhost:3000/api`

### **Get All URLs**
```http
GET /api/urls
```
**Response:**
```json
{
  "success": true,
  "urls": [...],
  "count": 5
}
```

### **Add New URL**
```http
POST /api/urls
Content-Type: application/json

{
  "url": "https://example.com/api",
  "startTime": "now", // or "2024-01-15T14:30:00Z"
  "interval": 1000,
  "priority": "medium"
}
```

### **Remove URL**
```http
DELETE /api/urls/{id}
```

### **Activate URL**
```http
POST /api/urls/{id}/activate
```

### **Deactivate URL**
```http
POST /api/urls/{id}/deactivate
```

### **Get Single URL**
```http
GET /api/urls/{id}
```

### **System Status**
```http
GET /api/status
```
**Response:**
```json
{
  "success": true,
  "totalUrls": 5,
  "statusCounts": {
    "active": 3,
    "ready": 1,
    "pending": 1
  },
  "activeUrls": 3,
  "system": {
    "uptime": 3600,
    "memory": {...},
    "platform": "win32"
  }
}
```

## 💡 Usage Examples

### **1. Add URL for Immediate Start**
```bash
curl -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://betting-site.com/api",
    "startTime": "now",
    "interval": 2000,
    "priority": "high"
  }'
```

### **2. Schedule URL for Later**
```bash
curl -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://betting-site.com/api",
    "startTime": "2024-01-15T14:30:00Z",
    "interval": 1000,
    "priority": "medium"
  }'
```

### **3. Get System Status**
```bash
curl http://localhost:3000/api/status
```

### **4. Pause Active URL**
```bash
curl -X POST http://localhost:3000/api/urls/{url-id}/deactivate
```

## 📂 File Structure

```
├── enhanced-monitoring-system.js  # Main system file
├── public/
│   └── index.html                # Web admin interface
├── urls-config.json              # Persistent URL storage (auto-generated)
├── output/                       # Processing output directory
│   └── {hostname}/               # URL-specific output folders
└── package.json                  # Dependencies and scripts
```

## 🔄 Integration with Existing System

The enhanced system works alongside your existing monitoring tools:

- **Unified Process**: Still uses `unified-process.js` for data processing
- **Output Compatibility**: Maintains same output format and structure
- **Environment Variables**: Supports existing `TARGET_URL_*` variables
- **Notifications**: Integrates with existing notification system

## 🛡️ Production Considerations

### **Security**
- Add authentication for API endpoints
- Use HTTPS in production
- Validate and sanitize all inputs
- Implement rate limiting

### **Scalability**
- Consider database storage instead of JSON files
- Implement clustering for multiple instances
- Add load balancing for high availability
- Monitor system resources

### **Monitoring**
- Add logging framework (Winston, Bunyan)
- Implement health checks
- Set up error alerting
- Monitor API response times

## 🔧 Configuration Options

### **System Configuration**
```javascript
const config = {
  apiPort: 3000,              // API server port
  delayBetweenUpdates: 1000,  // Default update interval
  outputDir: 'output',        // Output directory
  configFile: 'urls-config.json', // Config storage file
  enableNotifications: true,   // Desktop notifications
  maxConcurrentUrls: 5        // Max concurrent processing
};
```

### **URL Configuration**
```javascript
{
  id: "uuid",                 // Unique identifier
  url: "https://...",         // Target URL
  startTime: "now|ISO-date",  // When to start
  interval: 1000,             // Update interval (ms)
  priority: "low|medium|high", // Processing priority
  status: "pending|ready|active|paused|error",
  createdAt: "ISO-date",      // Creation timestamp
  lastEventCount: 0,          // Last processed event count
  processCount: 0             // Total processing cycles
}
```

## 🚨 Troubleshooting

### **Common Issues**

**Port Already in Use**
```bash
Error: listen EADDRINUSE :::3000
```
Solution: Change `API_PORT` in .env or kill process using port 3000

**URLs Not Starting**
- Check URL format (must start with http:// or https://)
- Verify start time is in future for scheduled URLs
- Check system logs for error messages

**Web Interface Not Loading**
- Ensure API server is running on correct port
- Check browser console for JavaScript errors
- Verify `public/index.html` exists

### **Logs & Debugging**
- System logs appear in console output
- URL-specific outputs in `output/{hostname}/` directories
- Check `urls-config.json` for current URL states

## 📞 Support

For issues and questions:
1. Check this README for common solutions
2. Review console logs for error messages
3. Verify API endpoints with curl/Postman
4. Check file permissions for config and output directories

---

**🎉 The Enhanced Monitoring System provides powerful, flexible URL monitoring with modern management capabilities. Perfect for production betting data monitoring!** 