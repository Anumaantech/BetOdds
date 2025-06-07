# Continuous Betting Data Monitoring

This system provides two ways to continuously monitor betting data and keep events up to date:

1. **Console Monitor** - Simple command-line monitoring
2. **Dashboard Monitor** - Web-based real-time dashboard

## 🚀 Quick Start

### Option 1: Console Monitor (Simple)

```bash
npm run monitor
```

This runs a simple console-based monitor that:
- Updates every 60 seconds (configurable)
- Shows progress in the terminal
- Logs changes to `output/changes.log`
- Can show desktop notifications (if enabled)

### Option 2: Dashboard Monitor (Advanced)

```bash
npm run monitor-dashboard
```

Then open http://localhost:3006 in your browser to see:
- Real-time status updates
- Update history with changes
- Control buttons (pause/resume, force update)
- Export functionality
- Beautiful dark-themed UI

## ⚙️ Configuration

Add these to your `.env` file:

```env
# Update interval in milliseconds (default: 60000 = 1 minute)
UPDATE_INTERVAL=60000

# Enable desktop notifications for changes (true/false)
ENABLE_NOTIFICATIONS=false

# Port for the monitoring dashboard
DASHBOARD_PORT=3006

# Target URL (if not passing as argument)
TARGET_URL=https://your-betting-url-here
```

## 📋 Features

### Console Monitor Features
- ✅ Automatic updates at configured intervals
- ✅ Change detection and logging
- ✅ Desktop notifications (Windows/Mac/Linux)
- ✅ Graceful shutdown with state saving
- ✅ Summary statistics every 10 updates
- ✅ Prevents overlapping updates

### Dashboard Monitor Features
- ✅ Real-time web dashboard
- ✅ Live update progress bar
- ✅ Update history with change tracking
- ✅ Pause/Resume functionality
- ✅ Force update button
- ✅ Export current data
- ✅ WebSocket for real-time updates
- ✅ Responsive dark theme UI

## 🎯 Usage Examples

### Basic Monitoring
```bash
# Use URL from .env file
npm run monitor

# With custom URL
npm run monitor -- "https://betting-site.com/event/12345"

# With custom URL and output directory
npm run monitor -- "https://betting-site.com/event/12345" "my-output"
```

### Dashboard Monitoring
```bash
# Start dashboard with default settings
npm run monitor-dashboard

# With custom URL
npm run monitor-dashboard -- "https://betting-site.com/event/12345"
```

### Custom Update Interval
Set in `.env` file:
```env
UPDATE_INTERVAL=60000  # 30 seconds
UPDATE_INTERVAL=120000  # 2 minutes
UPDATE_INTERVAL=600000  # 5 minutes
```

## 📁 Output Files

All monitoring creates these files in the output directory:

- `betting_events.json` - Latest betting events
- `complete_data.json` - Raw extracted data
- `parsed_data.json` - Parsed market data
- `formatted_output.txt` - Human-readable summary
- `formatted_output_summary.json` - JSON summary
- `changes.log` - Log of all changes detected
- `monitoring-state.json` - Saved state on shutdown

## 🔔 Change Detection

The monitor tracks changes in:
- Number of events
- Number of markets
- Event odds/coefficients

When changes are detected:
1. Logs to `changes.log` with timestamp
2. Shows in console/dashboard
3. Optionally shows desktop notification

## 🛑 Stopping the Monitor

- **Console Monitor**: Press `Ctrl+C` to stop gracefully
- **Dashboard Monitor**: Press `Ctrl+C` or use the dashboard controls

The monitor saves its state when stopped, including:
- Last event count
- Total updates performed
- Runtime duration
- Last update time

## 🖥️ Dashboard Interface

The web dashboard shows:

1. **Status Panel**
   - Current status (Active/Processing/Error/Paused)
   - Total updates performed
   - Current event/market counts
   - Last update time
   - Uptime

2. **Progress Bar**
   - Visual indicator of time until next update

3. **Control Buttons**
   - Force Update Now
   - Pause/Resume
   - Clear History
   - Export Data

4. **Update History**
   - Last 50 updates with timestamps
   - Change indicators (+/- events)
   - Color-coded changes (green/red/gray)

## 🚨 Error Handling

The monitor handles:
- Network failures
- Page loading errors
- Parsing errors
- Browser crashes

Errors are:
- Logged to console
- Shown in dashboard
- Don't stop the monitoring

## 💡 Tips

1. **Production Use**: Set a reasonable update interval (5-10 minutes) to avoid overloading the server

2. **Resource Usage**: Each update launches a headless browser, so monitor system resources

3. **Multiple Monitors**: You can run multiple monitors for different URLs by using different output directories

4. **Notifications**: Enable desktop notifications to be alerted of changes without watching the console

5. **Dashboard Access**: The dashboard can be accessed from any device on the same network

## 🔧 Troubleshooting

### Monitor not starting
- Check if the URL is valid
- Ensure all dependencies are installed: `npm install`
- Check if the port is available (for dashboard)

### No updates detected
- Verify the page is loading correctly
- Check if markets are available at the URL
- Look at the complete_data.json for raw data

### High CPU usage
- Increase the update interval
- Check for memory leaks in long-running sessions
- Restart the monitor periodically

### Dashboard not loading
- Check if port 3006 is available
- Try a different port in .env
- Check firewall settings

## 📊 Example Output

### Console Monitor
```
🔄 Starting continuous betting data monitoring...
📍 URL: https://betting-site.com/event/12345
⏱️  Update interval: 60 seconds
📁 Output directory: output

Press Ctrl+C to stop monitoring
═══════════════════════════════════════════════════════════════

🔄 Update #1 started at 10:15:32 AM
───────────────────────────────────────────────────────────────
.....
✅ Update #1 completed successfully!
   📊 Markets: 141
   🎯 Events: 149
   ✨ No changes detected
   ⏱️  Duration: 15.2s
   🕐 Next update in 60 seconds...
```

### Changes Log
```
2024-05-28T10:15:32.123Z | Events changed from 149 to 152 (+3)
2024-05-28T10:16:35.456Z | Events changed from 152 to 150 (-2)
2024-05-28T10:17:38.789Z | Events changed from 150 to 151 (+1)
``` 