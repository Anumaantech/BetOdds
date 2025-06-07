/**
 * Reset Enhanced Monitoring System State
 * 
 * This utility helps clean up the monitoring state when URLs get stuck
 * in processing state or when you need to reset the entire system.
 */

const fs = require('fs');
const path = require('path');

const configFile = 'urls-config.json';

console.log('🔧 Enhanced Monitoring State Reset Utility');
console.log('═══════════════════════════════════════════════════════════════');

function resetState() {
    try {
        if (!fs.existsSync(configFile)) {
            console.log('📄 No config file found. Nothing to reset.');
            return;
        }

        const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        let changes = 0;

        data.forEach(urlConfig => {
            if (urlConfig.isProcessing) {
                console.log(`🔧 Resetting processing state: ${urlConfig.url}`);
                urlConfig.isProcessing = false;
                changes++;
            }

            if (urlConfig.status === 'active') {
                console.log(`⏸️ Setting to ready state: ${urlConfig.url}`);
                urlConfig.status = 'ready';
                changes++;
            }

            if (urlConfig.status === 'preparing') {
                console.log(`🔄 Resetting preparing state: ${urlConfig.url}`);
                urlConfig.status = 'pending';
                changes++;
            }
        });

        if (changes > 0) {
            fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
            console.log(`✅ Reset ${changes} state changes and saved config`);
        } else {
            console.log('✨ No state changes needed. All URLs are in clean state.');
        }

        // Display current state
        console.log('\n📊 Current URL states:');
        data.forEach((urlConfig, index) => {
            console.log(`   ${index + 1}. ${urlConfig.url}`);
            console.log(`      Status: ${urlConfig.status}`);
            console.log(`      Processing: ${urlConfig.isProcessing}`);
            console.log(`      Process Count: ${urlConfig.processCount}`);
            console.log(`      Last Events: ${urlConfig.lastEventCount}`);
        });

    } catch (error) {
        console.error('❌ Error resetting state:', error.message);
    }
}

function clearAllUrls() {
    try {
        if (fs.existsSync(configFile)) {
            // Backup current config
            const backup = `${configFile}.backup.${Date.now()}`;
            fs.copyFileSync(configFile, backup);
            console.log(`💾 Backed up current config to: ${backup}`);

            // Clear all URLs
            fs.writeFileSync(configFile, JSON.stringify([], null, 2));
            console.log('🗑️ Cleared all URLs from config');
        } else {
            console.log('📄 No config file found. Nothing to clear.');
        }
    } catch (error) {
        console.error('❌ Error clearing URLs:', error.message);
    }
}

function showStatus() {
    try {
        if (!fs.existsSync(configFile)) {
            console.log('📄 No config file found.');
            return;
        }

        const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        
        console.log(`📊 Found ${data.length} URLs in config:`);
        
        const statusCounts = {};
        data.forEach(urlConfig => {
            const status = urlConfig.status;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`   ${status}: ${count}`);
        });

        const processingCount = data.filter(u => u.isProcessing).length;
        if (processingCount > 0) {
            console.log(`⚠️ ${processingCount} URLs are marked as processing`);
        }

        console.log('\n📋 Detailed status:');
        data.forEach((urlConfig, index) => {
            const processing = urlConfig.isProcessing ? ' [PROCESSING]' : '';
            console.log(`   ${index + 1}. [${urlConfig.status}${processing}] ${urlConfig.url}`);
        });

    } catch (error) {
        console.error('❌ Error reading status:', error.message);
    }
}

// Command line interface
const command = process.argv[2];

switch (command) {
    case 'reset':
        resetState();
        break;
    case 'clear':
        console.log('⚠️ This will remove ALL URLs from the config. Are you sure?');
        console.log('   Run with --force to proceed: node reset-monitoring-state.js clear --force');
        if (process.argv[3] === '--force') {
            clearAllUrls();
        }
        break;
    case 'status':
        showStatus();
        break;
    default:
        console.log('Usage:');
        console.log('  node reset-monitoring-state.js status  # Show current state');
        console.log('  node reset-monitoring-state.js reset   # Reset stuck processing states');
        console.log('  node reset-monitoring-state.js clear --force  # Clear all URLs');
        console.log('\n💡 Use "reset" if URLs are stuck in processing state');
        console.log('   Use "clear" to start fresh with no URLs');
        break;
} 