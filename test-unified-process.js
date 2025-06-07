/**
 * Test script to verify unified-process.js is working correctly
 * This helps isolate issues with the enhanced monitoring system
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const testUrl = 'https://parimatchglobal.com/en/events/england-west-indies-13348760';
const testOutputDir = 'test-output';

console.log('🧪 Testing unified-process.js...');
console.log(`📍 Test URL: ${testUrl}`);
console.log(`📁 Test output directory: ${testOutputDir}`);

// Create test output directory
if (!fs.existsSync(testOutputDir)) {
    fs.mkdirSync(testOutputDir, { recursive: true });
    console.log('✅ Test output directory created');
}

// Check if unified-process.js exists
if (!fs.existsSync('unified-process.js')) {
    console.error('❌ unified-process.js not found!');
    process.exit(1);
}

console.log('🚀 Starting test process...');

const child = spawn('node', ['unified-process.js', testUrl, testOutputDir], {
    stdio: 'inherit', // Show output directly in console
    shell: true
});

const timeout = setTimeout(() => {
    console.log('⏰ Test timeout after 2 minutes');
    child.kill('SIGTERM');
}, 2 * 60 * 1000); // 2 minute timeout

child.on('error', (error) => {
    clearTimeout(timeout);
    console.error('❌ Process spawn error:', error.message);
    process.exit(1);
});

child.on('close', (code, signal) => {
    clearTimeout(timeout);
    console.log(`\n🏁 Test process finished with code: ${code}, signal: ${signal}`);
    
    if (code === 0) {
        console.log('✅ Test successful! unified-process.js is working correctly.');
        
        // Check if output files were created
        const files = fs.readdirSync(testOutputDir);
        console.log(`📁 Output files created: ${files.length}`);
        files.forEach(file => {
            console.log(`   - ${file}`);
        });
    } else {
        console.log('❌ Test failed! unified-process.js encountered an error.');
        console.log(`Exit code: ${code}`);
        if (signal) {
            console.log(`Signal: ${signal}`);
        }
    }
    
    console.log('\n💡 If the test failed, this explains why the enhanced monitoring system is stopping.');
    console.log('   Check for missing dependencies, incorrect URL format, or system configuration issues.');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted');
    clearTimeout(timeout);
    child.kill('SIGTERM');
    process.exit(0);
}); 