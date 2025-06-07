require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  delayBetweenUpdates: 1000, // 1 second delay between updates
  // Load URLs: prioritize command line args, then .env variables, then defaults
  urls: [
    process.argv[2] || process.env.TARGET_URL_1,   // CMD arg 1 or ENV 1
    process.argv[3] || process.env.TARGET_URL_2,   // CMD arg 2 or ENV 2
    process.argv[4] || process.env.TARGET_URL_3,   // CMD arg 3 or ENV 3
    process.argv[5] || process.env.TARGET_URL_4,   // CMD arg 4 or ENV 4
    process.argv[6] || process.env.TARGET_URL_5,   // CMD arg 5 or ENV 5
    process.argv[7] || process.env.TARGET_URL_6,   // CMD arg 6 or ENV 6
    process.argv[8] || process.env.TARGET_URL_7,   // CMD arg 7 or ENV 7
    process.argv[9] || process.env.TARGET_URL_8,   // CMD arg 8 or ENV 8
    process.argv[10] || process.env.TARGET_URL_9,  // CMD arg 9 or ENV 9
    process.argv[11] || process.env.TARGET_URL_10, // CMD arg 10 or ENV 10
    process.argv[12] || process.env.TARGET_URL_11, // CMD arg 11 or ENV 11
    process.argv[13] || process.env.TARGET_URL_12, // CMD arg 12 or ENV 12
    process.argv[14] || process.env.TARGET_URL_13, // CMD arg 13 or ENV 13
    process.argv[15] || process.env.TARGET_URL_14, // CMD arg 14 or ENV 14
    process.argv[16] || process.env.TARGET_URL_15  // CMD arg 15 or ENV 15
  ].filter(url => url), // Filter out any undefined values immediately
  
  // If no URLs from command line or .env, add default example URLs
  // This part is tricky because we don't want to add defaults if specific ones were intended but missing.
  // A better approach might be to ensure at least one TARGET_URL_N is set if no command-line URLs are given.

  outputDir: 'output', // Default output directory
  enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true'
};

// Determine outputDir: use the last command-line argument if it doesn't look like a URL,
// otherwise default to 'output'. This logic assumes URLs are passed before the outputDir.
if (process.argv.length > 2) {
    const lastArg = process.argv[process.argv.length - 1];
    // A simple check to see if the last arg is likely an output directory path rather than a URL
    if (lastArg && !lastArg.startsWith('http') && lastArg !== config.urls[config.urls.length -1]) {
        config.outputDir = lastArg;
    }
}

// If URLs array is still empty after trying command line and .env, add example URLs.
// This ensures the script can run with defaults if nothing is configured.
if (config.urls.length === 0) {
  console.log("No URLs provided via command line or .env. Using default example URLs.");
  config.urls = [
    "http://example.com/page1",
    "http://example.com/page2",
    "http://example.com/page3"
  ];
}

// Final filter for valid http/https URLs
config.urls = config.urls.filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));

if (config.urls.length === 0) {
  console.error("Error: No valid URLs provided. Please check your command line arguments or .env file for TARGET_URL_1, etc.");
  process.exit(1);
}

// State tracking for each URL
let urlStates = {}; // Example: { "http://example.com/page1": { lastEventCount: 0, lastUpdateTime: null, processCount: 0 } }

// State tracking
let lastEventCount = 0;
let lastUpdateTime = null;
let isProcessing = false;
let processCount = 0;
let shouldStop = false;

// Ensure output directory exists
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

console.log('🔄 Starting continuous betting data monitoring for multiple URLs...');
config.urls.forEach(url => {
  console.log(`📍 URL: ${url}`);
  // Initialize state for each URL
  urlStates[url] = { lastEventCount: 0, lastUpdateTime: null, processCount: 0, isProcessing: false };
});
console.log(`⏱️  Delay between updates: ${config.delayBetweenUpdates / 1000} second(s)`);
console.log(`📁 Output directory: ${config.outputDir}`);
console.log('');
console.log('ℹ️  Updates will run continuously for all URLs with minimal delay');
console.log('Press Ctrl+C to stop monitoring');
console.log('═══════════════════════════════════════════════════════════════\n');

// Function to run the unified process for a single URL
async function runProcessForUrl(url, urlProcessCount) {
  if (shouldStop) {
    return;
  }

  urlStates[url].isProcessing = true;
  
  const startTime = new Date();
  console.log(`\n🔄 [${url}] Update #${urlProcessCount} started at ${startTime.toLocaleTimeString()}`);
  console.log(`[${url}] ───────────────────────────────────────────────────────────────`);

  return new Promise((resolve) => {
    // Create a dedicated output subdirectory for each URL to avoid file overwrites if unified-process.js writes files.
    const urlSpecificOutputDir = path.join(config.outputDir, new URL(url).hostname + new URL(url).pathname.replace(/\//g, '_'));
    if (!fs.existsSync(urlSpecificOutputDir)) {
      fs.mkdirSync(urlSpecificOutputDir, { recursive: true });
    }

    const child = spawn('node', ['unified-process.js', url, urlSpecificOutputDir], {
      stdio: 'pipe',
      shell: true
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      // Show progress indicators - might need adjustment if output is interleaved
      if (data.toString().includes('✓')) {
        process.stdout.write(`[${url}].`);
      }
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      urlStates[url].isProcessing = false;
      
      if (code === 0) {
        const marketsMatch = output.match(/Markets processed: (\d+)/);
        const eventsMatch = output.match(/Events generated: (\d+)/);
        
        const marketsCount = marketsMatch ? parseInt(marketsMatch[1]) : 0;
        const eventsCount = eventsMatch ? parseInt(eventsMatch[1]) : 0;
        
        const hasChanges = eventsCount !== urlStates[url].lastEventCount;
        
        console.log(`\n✅ [${url}] Update #${urlProcessCount} completed successfully!`);
        console.log(`   [${url}] 📊 Markets: ${marketsCount}`);
        console.log(`   [${url}] 🎯 Events: ${eventsCount}`);
        
        if (hasChanges) {
          const difference = eventsCount - urlStates[url].lastEventCount;
          const changeType = difference > 0 ? '📈 increased' : '📉 decreased';
          console.log(`   [${url}] 🔔 CHANGE DETECTED: Events ${changeType} by ${Math.abs(difference)}`);
          
          logChanges(url, eventsCount, urlStates[url].lastEventCount, urlSpecificOutputDir);
          
          if (config.enableNotifications) {
            showNotification(`[${new URL(url).hostname}] Events ${changeType} from ${urlStates[url].lastEventCount} to ${eventsCount}`);
          }
        } else {
          console.log(`   [${url}] ✨ No changes detected`);
        }
        
        urlStates[url].lastEventCount = eventsCount;
        urlStates[url].lastUpdateTime = new Date();
        
      } else {
        console.log(`\n❌ [${url}] Update #${urlProcessCount} failed with exit code ${code}`);
        if (errorOutput) {
          console.log(`   [${url}] Error: ${errorOutput.trim()}`);
        }
      }
      
      // Calculate and display timing for both success and failure cases
      const endTime = new Date();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      const statusText = code === 0 ? '✅ COMPLETED' : '❌ FAILED';
      console.log(`   [${url}] ⏱️  PROCESSING TIME: ${duration}s (${statusText})`);
      
      resolve();
    });
  });
}

// Main processing loop for all URLs
async function runAllProcesses() {
  if (shouldStop) return;

  isProcessing = true; // Global processing flag
  processCount++; // Overall cycle count
  const currentCycleStartTime = new Date();
  console.log(`\n🔄 Cycle #${processCount} for all URLs started at ${currentCycleStartTime.toLocaleTimeString()}`);
  console.log('═══════════════════════════════════════════════════════════════');


  const processPromises = config.urls.map(url => {
    urlStates[url].processCount = (urlStates[url].processCount || 0) + 1;
    return runProcessForUrl(url, urlStates[url].processCount);
  });

  await Promise.all(processPromises);

  isProcessing = false; // Reset global processing flag
  const cycleEndTime = new Date();
  const cycleDuration = ((cycleEndTime - currentCycleStartTime) / 1000).toFixed(1);
  
  // Enhanced cycle completion display
  console.log(`\n🏁 ═══════════════════════════════════════════════════════════════`);
  console.log(`   ⏱️  CYCLE #${processCount} COMPLETED IN ${cycleDuration} SECONDS`);
  console.log(`   📊 Processed ${config.urls.length} URL(s) successfully`);
  console.log(`   🕐 Next cycle starting in ${config.delayBetweenUpdates / 1000} second(s)...`);
  console.log(`   ═══════════════════════════════════════════════════════════════`);
  
  lastUpdateTime = new Date(); // Global last update time
}

// Function to log changes for a specific URL
function logChanges(url, newCount, oldCount, urlSpecificOutputDir) {
  const changeLog = path.join(urlSpecificOutputDir, 'changes.log');
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} | [${url}] Events changed from ${oldCount} to ${newCount} (${newCount - oldCount > 0 ? '+' : ''}${newCount - oldCount})\n`;
  
  fs.appendFileSync(changeLog, logEntry);
}

// Function to show desktop notification (Windows/Mac/Linux)
function showNotification(message) {
  const title = 'Betting Data Update';
  
  if (process.platform === 'win32') {
    spawn('powershell', [
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message}', '${title}')`
    ], { detached: true });
  } else if (process.platform === 'darwin') {
    spawn('osascript', ['-e', `display notification "${message}" with title "${title}"`]);
  } else if (process.platform === 'linux') {
    spawn('notify-send', [title, message]);
  }
}

// Function to display summary
function displaySummary() {
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(' MONITORING SUMMARY (ALL URLs)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total cycles: ${processCount}`); // Renamed from total updates
  // Aggregate or display per-URL stats here
  Object.entries(urlStates).forEach(([url, state]) => {
    console.log(`  [${url}]:`);
    console.log(`    Total updates: ${state.processCount}`);
    console.log(`    Last event count: ${state.lastEventCount}`);
    console.log(`    Last update: ${state.lastUpdateTime ? state.lastUpdateTime.toLocaleString() : 'Never'}`);
  });
  console.log(`Last cycle completion time: ${lastUpdateTime ? lastUpdateTime.toLocaleString() : 'Never'}`); // Global last update
  console.log(`Uptime: ${getUptime()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Function to calculate uptime
const startTime = new Date();
function getUptime() {
  const now = new Date();
  const diff = now - startTime;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// Continuous update loop
async function continuousUpdate() {
  while (!shouldStop) {
    await runAllProcesses(); // Changed from runProcess to runAllProcesses
    
    if (!shouldStop) {
      // Wait for the specified delay before next update
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenUpdates));
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping continuous monitoring...');
  shouldStop = true;
  
  // Check if any URL is still processing
  const anyProcessing = Object.values(urlStates).some(state => state.isProcessing);

  if (!anyProcessing) {
    displaySummary();
    
    // Save final state for each URL or aggregate
    const stateFile = path.join(config.outputDir, 'monitoring-state.json');
    const overallState = {
      overallProcessCycles: processCount,
      overallLastUpdateTime: lastUpdateTime,
      endTime: new Date().toISOString(),
      urlDetails: urlStates
    };
    fs.writeFileSync(stateFile, JSON.stringify(overallState, null, 2));
    
    console.log(`State saved to: ${stateFile}`);
    console.log('Goodbye! 👋\n');
    process.exit(0);
  } else {
    console.log('Waiting for current updates for all URLs to complete...');
  }
});

// Display summary every 10 cycles
setInterval(() => {
  if (processCount > 0 && processCount % 10 === 0) {
    displaySummary();
  }
}, 1000);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled rejection:', error);
  process.exit(1);
});

// Start the continuous update loop
continuousUpdate(); 