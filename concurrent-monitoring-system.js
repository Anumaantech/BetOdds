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
  maxConcurrentUrls: 10, // Increased for better performance
  batchProcessingInterval: 1000 // Process all URLs every 1 second
};

// URL Management Class with Concurrent Processing
class ConcurrentURLManager {
  constructor() {
    this.urls = new Map();
    this.isProcessing = false;
    this.batchTimer = null;
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

  // Start concurrent processing for all active URLs
  startConcurrentProcessing() {
    if (this.batchTimer) {
      console.log('🔄 Concurrent processing already running');
      return;
    }

    console.log('🚀 Starting concurrent processing for all URLs');
    
    this.batchTimer = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processBatch();
      }
    }, config.batchProcessingInterval);
  }

  // Stop concurrent processing
  stopConcurrentProcessing() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
      console.log('🛑 Stopped concurrent processing');
    }
  }

  // Process all active URLs concurrently
  async processBatch() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const activeUrls = this.getURLsByStatus('active');
    
    if (activeUrls.length === 0) {
      this.isProcessing = false;
      return;
    }

    const batchStartTime = new Date();
    console.log(`\n🔄 Processing ${activeUrls.length} URLs concurrently at ${batchStartTime.toLocaleTimeString()}`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Process all URLs concurrently using Promise.all
    const processPromises = activeUrls
      .filter(urlConfig => !urlConfig.isProcessing)
      .map(urlConfig => this.processURL(urlConfig));

    try {
      await Promise.all(processPromises);
      
      const batchEndTime = new Date();
      const batchDuration = ((batchEndTime - batchStartTime) / 1000).toFixed(1);
      
      console.log(`\n🏁 ═══════════════════════════════════════════════════════════════`);
      console.log(`   ⚡ CONCURRENT BATCH COMPLETED IN ${batchDuration} SECONDS`);
      console.log(`   📊 Processed ${processPromises.length} URL(s) simultaneously`);
      console.log(`   🕐 Next batch in ${config.batchProcessingInterval / 1000} second(s)...`);
      console.log(`   ═══════════════════════════════════════════════════════════════`);
      
    } catch (error) {
      console.error(`❌ Batch processing error:`, error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  // Process individual URL
  async processURL(urlConfig) {
    if (urlConfig.isProcessing) {
      return;
    }

    urlConfig.isProcessing = true;
    urlConfig.processCount++;
    
    const urlStartTime = new Date();
    console.log(`🔄 [${new URL(urlConfig.url).hostname}] Cycle #${urlConfig.processCount}`);

    try {
      const result = await this.runSingleProcess(urlConfig);
      
      if (result.success) {
        const hasChanges = result.eventCount !== urlConfig.lastEventCount;
        
        if (hasChanges) {
          const difference = result.eventCount - urlConfig.lastEventCount;
          console.log(`🔔 [${new URL(urlConfig.url).hostname}] Events: ${urlConfig.lastEventCount} → ${result.eventCount} (${difference > 0 ? '+' : ''}${difference})`);
          
          if (config.enableNotifications) {
            this.showNotification(`[${new URL(urlConfig.url).hostname}] Events changed by ${difference}`);
          }
        } else {
          console.log(`✨ [${new URL(urlConfig.url).hostname}] No changes (${result.eventCount} events)`);
        }
        
        urlConfig.lastEventCount = result.eventCount;
      } else {
        console.error(`❌ [${new URL(urlConfig.url).hostname}] Failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ [${new URL(urlConfig.url).hostname}] Exception:`, error.message);
    } finally {
      const urlEndTime = new Date();
      const urlDuration = ((urlEndTime - urlStartTime) / 1000).toFixed(1);
      console.log(`✅ [${new URL(urlConfig.url).hostname}] Completed in ${urlDuration}s`);
      
      urlConfig.isProcessing = false;
      this.saveConfig();
    }
  }

  // Run single process for URL
  runSingleProcess(urlConfig) {
    return new Promise((resolve, reject) => {
      try {
        const urlSpecificOutputDir = path.join(config.outputDir, 
          new URL(urlConfig.url).hostname.replace(/[^a-zA-Z0-9]/g, '_'));
        
        if (!fs.existsSync(urlSpecificOutputDir)) {
          fs.mkdirSync(urlSpecificOutputDir, { recursive: true });
        }

        const child = spawn('node', ['unified-process.js', urlConfig.url, urlSpecificOutputDir], {
          stdio: 'pipe',
          shell: true,
          env: process.env
        });

        let output = '';
        let errorOutput = '';

        // Set timeout to prevent hanging processes
        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            success: false,
            error: 'Process timeout after 2 minutes',
            eventCount: 0
          });
        }, 2 * 60 * 1000); // 2 minute timeout for faster processing

        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: `Spawn error: ${error.message}`,
            eventCount: 0
          });
        });

        child.on('close', (code, signal) => {
          clearTimeout(timeout);
          
          if (code === 0) {
            const marketsMatch = output.match(/Markets processed: (\d+)/);
            const eventsMatch = output.match(/Events generated: (\d+)/);
            
            const eventCount = eventsMatch ? parseInt(eventsMatch[1]) : 0;
            
            resolve({
              success: true,
              eventCount,
              data: { output, markets: marketsMatch ? parseInt(marketsMatch[1]) : 0 }
            });
          } else {
            resolve({
              success: false,
              error: errorOutput || `Process exited with code ${code}`,
              eventCount: 0
            });
          }
        });

      } catch (error) {
        resolve({
          success: false,
          error: `Exception: ${error.message}`,
          eventCount: 0
        });
      }
    });
  }

  // Show notification
  showNotification(message) {
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
const urlManager = new ConcurrentURLManager();

// Auto-start processing for active URLs
setTimeout(() => {
  const activeUrls = urlManager.getURLsByStatus('active');
  const readyUrls = urlManager.getURLsByStatus('ready');
  
  // Activate ready URLs that should start now
  readyUrls.forEach(urlConfig => {
    if (urlConfig.startTime === 'now') {
      urlConfig.status = 'active';
      urlManager.saveConfig();
    }
  });
  
  // Start concurrent processing if there are active URLs
  const allActiveUrls = urlManager.getURLsByStatus('active');
  if (allActiveUrls.length > 0) {
    console.log(`🚀 Auto-starting concurrent processing for ${allActiveUrls.length} active URLs`);
    urlManager.startConcurrentProcessing();
  }
}, 2000);

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
  
  // Start concurrent processing if this is the first active URL
  const activeUrls = urlManager.getURLsByStatus('active');
  if (activeUrls.length === 1 && !urlManager.batchTimer) {
    urlManager.startConcurrentProcessing();
  }
  
  res.json(result);
});

app.delete('/api/urls/:id', (req, res) => {
  const result = urlManager.removeURL(req.params.id);
  
  // Stop concurrent processing if no active URLs remain
  const activeUrls = urlManager.getURLsByStatus('active');
  if (activeUrls.length === 0) {
    urlManager.stopConcurrentProcessing();
  }
  
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
  
  urlConfig.status = 'active';
  urlManager.saveConfig();
  
  // Start concurrent processing if not already running
  if (!urlManager.batchTimer) {
    urlManager.startConcurrentProcessing();
  }
  
  res.json({ success: true, message: 'URL activated' });
});

app.post('/api/urls/:id/deactivate', (req, res) => {
  const urlConfig = urlManager.getURL(req.params.id);
  if (!urlConfig) {
    return res.status(404).json({ success: false, message: 'URL not found' });
  }
  
  urlConfig.status = 'paused';
  urlManager.saveConfig();
  
  // Stop concurrent processing if no active URLs remain
  const activeUrls = urlManager.getURLsByStatus('active');
  if (activeUrls.length === 0) {
    urlManager.stopConcurrentProcessing();
  }
  
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
    concurrentProcessing: !!urlManager.batchTimer,
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
  
  if (!fs.existsSync('unified-process.js')) {
    console.error('❌ unified-process.js not found! Please ensure it exists in the current directory.');
    process.exit(1);
  } else {
    console.log('✅ unified-process.js found');
  }
  
  if (!fs.existsSync('node_modules')) {
    console.error('❌ node_modules not found! Please run "npm install" first.');
    process.exit(1);
  } else {
    console.log('✅ node_modules found');
  }
  
  console.log('✅ System requirements validated');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down concurrent monitoring system...');
  urlManager.stopConcurrentProcessing();
  
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
});

// Start the system
validateSystemRequirements();

console.log('🚀 Concurrent Betting Data Monitoring System');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`📡 API Server starting on port ${config.apiPort}`);
console.log(`⚡ Concurrent processing enabled`);
console.log(`📁 Output directory: ${config.outputDir}`);
console.log('═══════════════════════════════════════════════════════════════\n');

// Start API server
app.listen(config.apiPort, () => {
  console.log(`✅ API server running on http://localhost:${config.apiPort}`);
  console.log(`🌐 Admin interface: http://localhost:${config.apiPort}`);
  console.log('Ready for concurrent URL processing! 🚀\n');
}); 