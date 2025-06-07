require('dotenv').config();
const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Configuration
const config = {
  delayBetweenUpdates: 1000, // 1 second delay between updates
  url: process.argv[2] || process.env.TARGET_URL,
  outputDir: process.argv[3] || 'output',
  dashboardPort: process.env.DASHBOARD_PORT || 3006,
  enableAutoRefresh: true
};

// State tracking
let state = {
  lastEventCount: 0,
  lastMarketCount: 0,
  lastUpdateTime: null,
  isProcessing: false,
  processCount: 0,
  history: [],
  startTime: new Date(),
  lastError: null,
  changes: [],
  isPaused: false
};

// Express app setup
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve static dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Betting Data Monitor Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f0f0f;
            color: #ffffff;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        h1 {
            text-align: center;
            margin-bottom: 30px;
            color: #00ff88;
            font-size: 2.5em;
            text-shadow: 0 0 20px rgba(0, 255, 136, 0.5);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: #1a1a1a;
            border-radius: 10px;
            padding: 20px;
            border: 1px solid #333;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 255, 136, 0.2);
        }
        
        .stat-label {
            color: #888;
            font-size: 0.9em;
            margin-bottom: 5px;
        }
        
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #00ff88;
        }
        
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 10px;
            animation: pulse 2s infinite;
        }
        
        .status-active {
            background: #00ff88;
        }
        
        .status-processing {
            background: #ffaa00;
        }
        
        .status-error {
            background: #ff4444;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .history-section {
            background: #1a1a1a;
            border-radius: 10px;
            padding: 20px;
            border: 1px solid #333;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .history-item {
            padding: 10px;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .history-item:last-child {
            border-bottom: none;
        }
        
        .change-positive {
            color: #00ff88;
        }
        
        .change-negative {
            color: #ff4444;
        }
        
        .change-neutral {
            color: #888;
        }
        
        .control-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: center;
        }
        
        button {
            background: #00ff88;
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        button:hover {
            background: #00cc70;
        }
        
        button:disabled {
            background: #444;
            color: #888;
            cursor: not-allowed;
        }
        
        .progress-bar {
            width: 100%;
            height: 4px;
            background: #333;
            border-radius: 2px;
            margin-top: 20px;
            overflow: hidden;
        }
        
        .progress-fill {
            height: 100%;
            background: #00ff88;
            transition: width 1s linear;
        }
        
        .error-message {
            background: #ff4444;
            color: white;
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
        }
        
        .url-display {
            background: #2a2a2a;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-family: monospace;
            font-size: 0.9em;
            color: #00ff88;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 Betting Data Monitor</h1>
        
        <div class="url-display">
            Monitoring: <span id="url"></span>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Status</div>
                <div class="stat-value">
                    <span id="status-indicator" class="status-indicator"></span>
                    <span id="status-text">Initializing...</span>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">Total Updates</div>
                <div class="stat-value" id="total-updates">0</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">Current Events</div>
                <div class="stat-value" id="event-count">0</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">Current Markets</div>
                <div class="stat-value" id="market-count">0</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">Last Update</div>
                <div class="stat-value" id="last-update">Never</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-label">Uptime</div>
                <div class="stat-value" id="uptime">0s</div>
            </div>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progress"></div>
        </div>
        
        <div id="error-container"></div>
        
        <div class="control-buttons">
            <button id="force-update" onclick="forceUpdate()">Force Update Now</button>
            <button id="pause-resume" onclick="togglePause()">Pause</button>
            <button onclick="clearHistory()">Clear History</button>
            <button onclick="exportData()">Export Data</button>
        </div>
        
        <h2 style="margin-top: 30px; margin-bottom: 15px;">📊 Update History</h2>
        <div class="history-section" id="history">
            <div style="text-align: center; color: #888;">No updates yet...</div>
        </div>
    </div>
    
    <script>
        let isPaused = false;
        let ws = null;
        let reconnectInterval = null;
        
        function connectWebSocket() {
            ws = new WebSocket('ws://localhost:${config.dashboardPort}');
            
            ws.onopen = () => {
                console.log('Connected to dashboard');
                if (reconnectInterval) {
                    clearInterval(reconnectInterval);
                    reconnectInterval = null;
                }
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                updateDashboard(data);
            };
            
            ws.onclose = () => {
                console.log('Disconnected from dashboard');
                if (!reconnectInterval) {
                    reconnectInterval = setInterval(() => {
                        console.log('Attempting to reconnect...');
                        connectWebSocket();
                    }, 5000);
                }
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }
        
        function updateDashboard(data) {
            // Update URL
            document.getElementById('url').textContent = data.url || 'Not configured';
            
            // Update status
            const statusIndicator = document.getElementById('status-indicator');
            const statusText = document.getElementById('status-text');
            
            if (data.isProcessing) {
                statusIndicator.className = 'status-indicator status-processing';
                statusText.textContent = 'Processing...';
            } else if (data.lastError) {
                statusIndicator.className = 'status-indicator status-error';
                statusText.textContent = 'Error';
            } else {
                statusIndicator.className = 'status-indicator status-active';
                statusText.textContent = isPaused ? 'Paused' : 'Active';
            }
            
            // Update stats
            document.getElementById('total-updates').textContent = data.processCount;
            document.getElementById('event-count').textContent = data.lastEventCount;
            document.getElementById('market-count').textContent = data.lastMarketCount;
            
            // Update last update time
            if (data.lastUpdateTime) {
                const lastUpdate = new Date(data.lastUpdateTime);
                document.getElementById('last-update').textContent = lastUpdate.toLocaleTimeString();
            }
            
            // Update uptime
            updateUptime(data.startTime);
            
            // Update progress bar
            updateProgressBar(data.lastUpdateTime, data.delayBetweenUpdates);
            
            // Update error display
            const errorContainer = document.getElementById('error-container');
            if (data.lastError) {
                errorContainer.innerHTML = '<div class="error-message">' + data.lastError + '</div>';
            } else {
                errorContainer.innerHTML = '';
            }
            
            // Update history
            updateHistory(data.history);
        }
        
        function updateUptime(startTime) {
            const start = new Date(startTime);
            const now = new Date();
            const diff = now - start;
            
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 60000);
            
            let uptime = '';
            if (hours > 0) uptime += hours + 'h ';
            if (minutes > 0) uptime += minutes + 'm ';
            uptime += seconds + 's';
            
            document.getElementById('uptime').textContent = uptime;
        }
        
        function updateProgressBar(lastUpdateTime, interval) {
            if (!lastUpdateTime || isPaused) {
                document.getElementById('progress').style.width = '0%';
                return;
            }
            
            // For continuous mode, just show if processing
            const progress = document.querySelector('.progress-fill');
            progress.style.width = '100%';
            progress.style.background = '#00ff88';
            progress.style.transition = 'none';
        }
        
        function updateHistory(history) {
            const historyContainer = document.getElementById('history');
            
            if (!history || history.length === 0) {
                historyContainer.innerHTML = '<div style="text-align: center; color: #888;">No updates yet...</div>';
                return;
            }
            
            historyContainer.innerHTML = history.slice().reverse().map(item => {
                const time = new Date(item.time).toLocaleTimeString();
                let changeClass = 'change-neutral';
                let changeText = 'No change';
                
                if (item.change > 0) {
                    changeClass = 'change-positive';
                    changeText = '+' + item.change + ' events';
                } else if (item.change < 0) {
                    changeClass = 'change-negative';
                    changeText = item.change + ' events';
                }
                
                return '<div class="history-item">' +
                    '<span>' + time + '</span>' +
                    '<span>Events: ' + item.events + ' | Markets: ' + item.markets + '</span>' +
                    '<span class="' + changeClass + '">' + changeText + '</span>' +
                '</div>';
            }).join('');
        }
        
        function forceUpdate() {
            fetch('/api/force-update', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        document.getElementById('force-update').disabled = true;
                        setTimeout(() => {
                            document.getElementById('force-update').disabled = false;
                        }, 5000);
                    }
                });
        }
        
        function togglePause() {
            isPaused = !isPaused;
            fetch('/api/pause', { method: 'POST', body: JSON.stringify({ paused: isPaused }), headers: { 'Content-Type': 'application/json' } })
                .then(response => response.json())
                .then(data => {
                    document.getElementById('pause-resume').textContent = isPaused ? 'Resume' : 'Pause';
                });
        }
        
        function clearHistory() {
            if (confirm('Clear all history?')) {
                fetch('/api/clear-history', { method: 'POST' })
                    .then(() => updateHistory([]));
            }
        }
        
        function exportData() {
            window.open('/api/export', '_blank');
        }
        
        // Auto-update every second
        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send('update');
            }
        }, 60000);
        
        // Connect to WebSocket
        connectWebSocket();
    </script>
</body>
</html>
  `);
});

// API endpoints
app.post('/api/force-update', (req, res) => {
  if (!state.isProcessing) {
    runProcess();
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Update already in progress' });
  }
});

app.post('/api/pause', (req, res) => {
  state.isPaused = req.body.paused;
  res.json({ success: true });
});

app.post('/api/clear-history', (req, res) => {
  state.history = [];
  state.changes = [];
  res.json({ success: true });
});

app.get('/api/export', (req, res) => {
  const exportData = {
    state: state,
    currentEvents: null,
    timestamp: new Date().toISOString()
  };
  
  try {
    const eventsFile = path.join(config.outputDir, 'betting_events.json');
    if (fs.existsSync(eventsFile)) {
      exportData.currentEvents = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading events file:', error);
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="betting-monitor-export.json"');
  res.send(JSON.stringify(exportData, null, 2));
});

// WebSocket setup for real-time updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Dashboard client connected');
  
  // Send initial state
  ws.send(JSON.stringify({
    ...state,
    url: config.url,
    delayBetweenUpdates: config.delayBetweenUpdates
  }));
  
  ws.on('message', (message) => {
    if (message.toString() === 'update') {
      ws.send(JSON.stringify({
        ...state,
        url: config.url,
        delayBetweenUpdates: config.delayBetweenUpdates
      }));
    }
  });
});

// Broadcast updates to all connected clients
function broadcastUpdate() {
  const data = JSON.stringify({
    ...state,
    url: config.url,
    delayBetweenUpdates: config.delayBetweenUpdates
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Main process function
async function runProcess() {
  if (state.isProcessing || state.isPaused) {
    return;
  }

  state.isProcessing = true;
  state.processCount++;
  
  const startTime = new Date();
  console.log(`\n🔄 Update #${state.processCount} started at ${startTime.toLocaleTimeString()}`);

  return new Promise((resolve) => {
    const child = spawn('node', ['unified-process.js', config.url, config.outputDir], {
      stdio: 'pipe',
      shell: true
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      state.isProcessing = false;
      
      if (code === 0) {
        // Parse the output to get statistics
        const marketsMatch = output.match(/Markets processed: (\d+)/);
        const eventsMatch = output.match(/Events generated: (\d+)/);
        
        const marketsCount = marketsMatch ? parseInt(marketsMatch[1]) : 0;
        const eventsCount = eventsMatch ? parseInt(eventsMatch[1]) : 0;
        
        // Calculate change
        const change = eventsCount - state.lastEventCount;
        
        // Update state
        state.lastMarketCount = marketsCount;
        state.lastEventCount = eventsCount;
        state.lastUpdateTime = new Date();
        state.lastError = null;
        
        // Add to history
        state.history.push({
          time: state.lastUpdateTime,
          events: eventsCount,
          markets: marketsCount,
          change: change
        });
        
        // Keep only last 50 history items
        if (state.history.length > 50) {
          state.history = state.history.slice(-50);
        }
        
        // Log change if any
        if (change !== 0) {
          state.changes.push({
            time: state.lastUpdateTime,
            from: state.lastEventCount - change,
            to: eventsCount,
            change: change
          });
          
          const changeLog = path.join(config.outputDir, 'changes.log');
          const logEntry = `${state.lastUpdateTime.toISOString()} | Events changed from ${state.lastEventCount - change} to ${eventsCount} (${change > 0 ? '+' : ''}${change})\n`;
          fs.appendFileSync(changeLog, logEntry);
        }
        
        const duration = ((new Date() - startTime) / 1000).toFixed(1);
        console.log(`✅ Update completed: ${marketsCount} markets, ${eventsCount} events${change !== 0 ? ` (${change > 0 ? '+' : ''}${change})` : ''} - Duration: ${duration}s`);
        
      } else {
        state.lastError = errorOutput || `Process exited with code ${code}`;
        console.log(`❌ Update failed: ${state.lastError}`);
      }
      
      // Broadcast update to dashboard
      broadcastUpdate();
      
      resolve();
    });
  });
}

// Continuous update loop
async function continuousUpdate() {
  while (true) {
    if (!state.isPaused) {
      await runProcess();
    }
    
    // Wait for the specified delay before next update
    await new Promise(resolve => setTimeout(resolve, config.delayBetweenUpdates));
  }
}

// Start the server
server.listen(config.dashboardPort, () => {
  console.log('🌐 Dashboard running at http://localhost:' + config.dashboardPort);
  console.log('📍 Monitoring URL: ' + config.url);
  console.log('⏱️  Running in continuous mode (1 second delay between updates)');
  console.log('\nPress Ctrl+C to stop\n');
  
  // Start the continuous update loop
  continuousUpdate();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping monitor...');
  
  // Save final state
  const stateFile = path.join(config.outputDir, 'monitoring-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({
    ...state,
    endTime: new Date().toISOString()
  }, null, 2));
  
  server.close(() => {
    console.log('Dashboard stopped');
    process.exit(0);
  });
}); 