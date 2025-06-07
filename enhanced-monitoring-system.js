require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app for API
const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve admin interface

// Configuration
const config = {
  apiPort: process.env.API_PORT || 3000,
  delayBetweenUpdates: 1000,
  outputDir: 'output',
  configFile: 'urls-config.json',
  enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true',
  maxConcurrentUrls: 5 // Limit concurrent processing
};

// URL Management Class
class URLManager {
  constructor() {
    this.urls = new Map();
    this.loadConfig();
  }

  // Load URLs from persistent storage
  loadConfig() {
    try {
      if (fs.existsSync(config.configFile)) {
        const data = JSON.parse(fs.readFileSync(config.configFile, 'utf8'));
        let hasChanges = false;
        data.forEach(urlConfig => {
          // Reset processing state on startup to avoid conflicts
          if (urlConfig.isProcessing) {
            console.log(`🔧 Resetting processing state for: ${urlConfig.url}`);
            urlConfig.isProcessing = false;
            if (urlConfig.status === 'active') {
              urlConfig.status = 'ready'; // Reset to ready for clean restart
            }
            hasChanges = true;
          }
          this.urls.set(urlConfig.id, urlConfig);
        });
        console.log(`📂 Loaded ${this.urls.size} URLs from config`);
        
        // Save config if we made changes
        if (hasChanges) {
          this.saveConfig();
          console.log('💾 Updated config with reset processing states');
        }
      }
    } catch (error) {
      console.error('❌ Error loading config:', error.message);
    }
  }

  // Save URLs to persistent storage
  saveConfig() {
    try {
      const data = Array.from(this.urls.values());
      fs.writeFileSync(config.configFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error saving config:', error.message);
    }
  }

  // Add new URL
  addURL(url, startTime, options = {}) {
    const id = uuidv4();
    const urlConfig = {
      id,
      url,
      startTime: startTime || 'now',
      endTime: options.endTime || null,
      interval: options.interval || config.delayBetweenUpdates,
      priority: options.priority || 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      lastEventCount: 0,
      processCount: 0,
      initialData: null,
      isProcessing: false
    };

    this.urls.set(id, urlConfig);
    this.saveConfig();
    
    console.log(`✅ URL added: ${url} (ID: ${id})`);
    
    // Trigger initial fetch if startTime is 'now'
    if (startTime === 'now') {
      this.prepareURL(id);
    }
    
    return { success: true, id, urlConfig };
  }

  // Remove URL
  removeURL(id) {
    const urlConfig = this.urls.get(id);
    if (!urlConfig) {
      return { success: false, message: 'URL not found' };
    }

    this.urls.delete(id);
    this.saveConfig();
    
    console.log(`🗑️ URL removed: ${urlConfig.url} (ID: ${id})`);
    return { success: true, message: 'URL removed successfully' };
  }

  // Get URLs by status
  getURLsByStatus(status) {
    return Array.from(this.urls.values()).filter(url => url.status === status);
  }

  // Update URL status
  updateURLStatus(id, status) {
    const urlConfig = this.urls.get(id);
    if (urlConfig) {
      urlConfig.status = status;
      this.saveConfig();
    }
  }

  // Get all URLs
  getAllURLs() {
    return Array.from(this.urls.values());
  }

  // Get URL by ID
  getURL(id) {
    return this.urls.get(id);
  }

  // Prepare URL (initial fetch)
  async prepareURL(id) {
    const urlConfig = this.urls.get(id);
    if (!urlConfig || urlConfig.status !== 'pending') return;

    console.log(`🔄 Preparing URL: ${urlConfig.url}`);
    urlConfig.status = 'preparing';

    try {
      const result = await this.runSingleProcess(urlConfig);
      if (result.success) {
        urlConfig.initialData = result.data;
        urlConfig.lastEventCount = result.eventCount;
        urlConfig.status = urlConfig.startTime === 'now' ? 'active' : 'ready';
        console.log(`✅ URL prepared: ${urlConfig.url}`);
      } else {
        urlConfig.status = 'error';
        console.log(`❌ URL preparation failed: ${urlConfig.url}`);
      }
    } catch (error) {
      urlConfig.status = 'error';
      console.error(`❌ Error preparing URL ${urlConfig.url}:`, error.message);
    }

    this.saveConfig();
  }
}

// Scheduler Class
class Scheduler {
  constructor(urlManager) {
    this.urlManager = urlManager;
    this.activeTimers = new Map();
  }

  start() {
    // Check every 10 seconds for URLs that need activation
    setInterval(() => {
      this.checkScheduledActivations();
    }, 10000);

    // Start immediate URLs after a brief delay to allow system initialization
    setTimeout(() => {
      console.log('🔍 Checking for URLs to activate...');
      this.activateImmediateURLs();
    }, 2000); // 2 second delay
  }

  checkScheduledActivations() {
    const readyUrls = this.urlManager.getURLsByStatus('ready');
    const now = new Date();

    readyUrls.forEach(urlConfig => {
      const startTime = new Date(urlConfig.startTime);
      if (startTime <= now) {
        this.activateURL(urlConfig.id);
      }
    });
  }

  activateImmediateURLs() {
    const nowUrls = this.urlManager.getAllURLs().filter(url => 
      url.startTime === 'now' && url.status === 'ready'
    );
    
    nowUrls.forEach(urlConfig => {
      this.activateURL(urlConfig.id);
    });
  }

  activateURL(id) {
    const urlConfig = this.urlManager.getURL(id);
    if (!urlConfig || urlConfig.status === 'active') return;

    console.log(`🚀 Activating URL: ${urlConfig.url}`);
    urlConfig.status = 'active';
    this.urlManager.saveConfig();

    // Start continuous monitoring
    const timer = setInterval(async () => {
      if (urlConfig.status === 'active' && !urlConfig.isProcessing) {
        await this.processURL(urlConfig);
      }
    }, urlConfig.interval);

    this.activeTimers.set(id, timer);
  }

  deactivateURL(id) {
    const urlConfig = this.urlManager.getURL(id);
    if (!urlConfig) return;

    console.log(`⏸️ Deactivating URL: ${urlConfig.url}`);
    urlConfig.status = 'paused';
    this.urlManager.saveConfig();

    // Clear timer
    const timer = this.activeTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(id);
    }
  }

  async processURL(urlConfig) {
    if (urlConfig.isProcessing) {
      console.log(`   ⏭️ Skipping ${urlConfig.url} - already processing`);
      return;
    }

    console.log(`\n🔄 [${urlConfig.url}] Starting processing cycle #${urlConfig.processCount + 1}`);
    urlConfig.isProcessing = true;
    urlConfig.processCount++;
    this.urlManager.saveConfig(); // Save state immediately

    try {
      const result = await this.urlManager.runSingleProcess(urlConfig);
      
      if (result.success) {
        const hasChanges = result.eventCount !== urlConfig.lastEventCount;
        
        if (hasChanges) {
          const difference = result.eventCount - urlConfig.lastEventCount;
          console.log(`🔔 [${urlConfig.url}] Events changed by ${difference} (${urlConfig.lastEventCount} → ${result.eventCount})`);
          
          if (config.enableNotifications) {
            this.showNotification(`Events changed by ${difference} for ${new URL(urlConfig.url).hostname}`);
          }
        } else {
          console.log(`✨ [${urlConfig.url}] No changes detected (${result.eventCount} events)`);
        }
        
        urlConfig.lastEventCount = result.eventCount;
      } else {
        console.error(`❌ [${urlConfig.url}] Processing failed: ${result.error}`);
        // Don't stop monitoring on failure, just log and continue
      }
    } catch (error) {
      console.error(`❌ [${urlConfig.url}] Exception during processing:`, error.message);
      console.error(`   Stack trace:`, error.stack);
    } finally {
      // Always reset processing state
      urlConfig.isProcessing = false;
      this.urlManager.saveConfig();
      console.log(`✅ [${urlConfig.url}] Processing cycle completed\n`);
    }
  }

  showNotification(message) {
    // Same notification logic as before
    const title = 'Betting Data Update';
    
    if (process.platform === 'win32') {
      spawn('powershell', [
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message}', '${title}')`
      ], { detached: true });
    }
  }
}

// Initialize system
const urlManager = new URLManager();
const scheduler = new Scheduler(urlManager);

// Add method to URLManager for running single process
URLManager.prototype.runSingleProcess = function(urlConfig) {
  return new Promise((resolve, reject) => {
    try {
      const urlSpecificOutputDir = path.join(config.outputDir, 
        new URL(urlConfig.url).hostname.replace(/[^a-zA-Z0-9]/g, '_'));
      
      console.log(`   📁 Creating output directory: ${urlSpecificOutputDir}`);
      if (!fs.existsSync(urlSpecificOutputDir)) {
        fs.mkdirSync(urlSpecificOutputDir, { recursive: true });
      }

      console.log(`   🚀 Spawning process for: ${urlConfig.url}`);
      const child = spawn('node', ['unified-process.js', urlConfig.url, urlSpecificOutputDir], {
        stdio: 'pipe',
        shell: true
      });

      let output = '';
      let errorOutput = '';

      // Set timeout to prevent hanging processes
      const timeout = setTimeout(() => {
        console.log(`   ⏰ Process timeout for ${urlConfig.url}`);
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Process timeout after 5 minutes',
          eventCount: 0
        });
      }, 5 * 60 * 1000); // 5 minute timeout

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log(`   ⚠️ Process stderr: ${data.toString().trim()}`);
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`   ❌ Process spawn error: ${error.message}`);
        resolve({
          success: false,
          error: `Spawn error: ${error.message}`,
          eventCount: 0
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        console.log(`   🏁 Process finished with code: ${code}, signal: ${signal}`);
        
        if (code === 0) {
          const marketsMatch = output.match(/Markets processed: (\d+)/);
          const eventsMatch = output.match(/Events generated: (\d+)/);
          
          const eventCount = eventsMatch ? parseInt(eventsMatch[1]) : 0;
          
          console.log(`   ✅ Process successful: ${eventCount} events generated`);
          resolve({
            success: true,
            eventCount,
            data: { output, markets: marketsMatch ? parseInt(marketsMatch[1]) : 0 }
          });
        } else {
          console.log(`   ❌ Process failed with code ${code}`);
          if (errorOutput) {
            console.log(`   📝 Error output: ${errorOutput.trim()}`);
          }
          resolve({
            success: false,
            error: errorOutput || `Process exited with code ${code}`,
            eventCount: 0
          });
        }
      });

    } catch (error) {
      console.error(`   ❌ Exception in runSingleProcess: ${error.message}`);
      resolve({
        success: false,
        error: `Exception: ${error.message}`,
        eventCount: 0
      });
    }
  });
};

// REST API Endpoints
app.get('/api/urls', (req, res) => {
  res.json({
    success: true,
    urls: urlManager.getAllURLs(),
    count: urlManager.getAllURLs().length
  });
});

app.post('/api/urls', async (req, res) => {
  const { url, startTime, endTime, interval, priority } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }

  const options = { endTime, interval, priority };
  const result = urlManager.addURL(url, startTime, options);
  
  res.json(result);
});

app.delete('/api/urls/:id', (req, res) => {
  const result = urlManager.removeURL(req.params.id);
  res.json(result);
});

app.post('/api/urls/:id/activate', async (req, res) => {
  const urlConfig = urlManager.getURL(req.params.id);
  if (!urlConfig) {
    return res.status(404).json({ success: false, message: 'URL not found' });
  }

  if (urlConfig.status === 'pending') {
    await urlManager.prepareURL(req.params.id);
  }
  
  scheduler.activateURL(req.params.id);
  
  res.json({ success: true, message: 'URL activated' });
});

app.post('/api/urls/:id/deactivate', (req, res) => {
  scheduler.deactivateURL(req.params.id);
  res.json({ success: true, message: 'URL deactivated' });
});

app.get('/api/urls/:id', (req, res) => {
  const urlConfig = urlManager.getURL(req.params.id);
  if (!urlConfig) {
    return res.status(404).json({ success: false, message: 'URL not found' });
  }
  
  res.json({ success: true, url: urlConfig });
});

// System status endpoint
app.get('/api/status', (req, res) => {
  const urls = urlManager.getAllURLs();
  const statusCounts = urls.reduce((acc, url) => {
    acc[url.status] = (acc[url.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    success: true,
    totalUrls: urls.length,
    statusCounts,
    activeUrls: urls.filter(u => u.status === 'active').length,
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform
    }
  });
});

// Ensure output directory exists
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

// Startup validation
function validateSystemRequirements() {
  console.log('🔍 Validating system requirements...');
  
  // Check if unified-process.js exists
  if (!fs.existsSync('unified-process.js')) {
    console.error('❌ unified-process.js not found! Please ensure it exists in the current directory.');
    process.exit(1);
  } else {
    console.log('✅ unified-process.js found');
  }
  
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    console.error('❌ node_modules not found! Please run "npm install" first.');
    process.exit(1);
  } else {
    console.log('✅ node_modules found');
  }
  
  console.log('✅ System requirements validated');
}

// Start system
console.log('🚀 Starting Enhanced Monitoring System...');
validateSystemRequirements();
console.log(`📡 API Server starting on port ${config.apiPort}`);
console.log(`📁 Output directory: ${config.outputDir}`);
console.log(`📋 Config file: ${config.configFile}`);

// Start scheduler
scheduler.start();

// Start API server
app.listen(config.apiPort, () => {
  console.log(`\n✅ Enhanced Monitoring System Ready!`);
  console.log(`🌐 Admin Interface: http://localhost:${config.apiPort}`);
  console.log(`📊 API Base URL: http://localhost:${config.apiPort}/api`);
  console.log(`📝 Loaded ${urlManager.getAllURLs().length} URLs from config`);
  console.log('\n═══════════════════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Enhanced Monitoring System...');
  
  // Clear all active timers
  scheduler.activeTimers.forEach(timer => clearInterval(timer));
  
  // Save final state
  urlManager.saveConfig();
  
  console.log('✅ System shutdown complete. Goodbye! 👋');
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  urlManager.saveConfig();
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled rejection:', error);
  urlManager.saveConfig();
  process.exit(1);
}); 