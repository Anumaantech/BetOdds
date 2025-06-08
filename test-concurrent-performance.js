require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test URLs from your config
const testUrls = [
  "https://parimatchglobal.com/en/events/england-lions-india-a-13476745",
  "https://parimatchglobal.com/en/events/england-w-west-indies-w-12556356",
  "https://parimatchglobal.com/en/events/raigad-royals-puneri-bappa-13509428",
  "https://parimatchglobal.com/en/events/sobo-mumbai-falcons-eagle-thane-strikers-13509635"
];

// Function to run unified process for a single URL
function runSingleProcess(url, outputDir) {
  return new Promise((resolve) => {
    const startTime = new Date();
    console.log(`🔄 Processing: ${new URL(url).hostname}`);
    
    const child = spawn('node', ['unified-process.js', url, outputDir], {
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
      const endTime = new Date();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      
      if (code === 0) {
        const eventsMatch = output.match(/Events generated: (\d+)/);
        const eventCount = eventsMatch ? parseInt(eventsMatch[1]) : 0;
        
        console.log(`✅ [${new URL(url).hostname}] Completed in ${duration}s - ${eventCount} events`);
        resolve({ success: true, duration: parseFloat(duration), eventCount, url });
      } else {
        console.log(`❌ [${new URL(url).hostname}] Failed in ${duration}s`);
        resolve({ success: false, duration: parseFloat(duration), eventCount: 0, url });
      }
    });
  });
}

// Sequential processing test
async function testSequentialProcessing() {
  console.log('\n🔄 Testing Sequential Processing (Current Method)');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const startTime = new Date();
  const results = [];
  
  for (const url of testUrls) {
    const outputDir = path.join('test-output', 'sequential', new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '_'));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const result = await runSingleProcess(url, outputDir);
    results.push(result);
  }
  
  const endTime = new Date();
  const totalDuration = ((endTime - startTime) / 1000).toFixed(1);
  
  console.log(`\n📊 Sequential Processing Results:`);
  console.log(`   Total Time: ${totalDuration} seconds`);
  console.log(`   URLs Processed: ${results.length}`);
  console.log(`   Successful: ${results.filter(r => r.success).length}`);
  console.log(`   Total Events: ${results.reduce((sum, r) => sum + r.eventCount, 0)}`);
  
  return { totalDuration: parseFloat(totalDuration), results };
}

// Concurrent processing test
async function testConcurrentProcessing() {
  console.log('\n⚡ Testing Concurrent Processing (New Method)');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const startTime = new Date();
  
  // Process all URLs concurrently using Promise.all
  const processPromises = testUrls.map(url => {
    const outputDir = path.join('test-output', 'concurrent', new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '_'));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return runSingleProcess(url, outputDir);
  });
  
  const results = await Promise.all(processPromises);
  
  const endTime = new Date();
  const totalDuration = ((endTime - startTime) / 1000).toFixed(1);
  
  console.log(`\n📊 Concurrent Processing Results:`);
  console.log(`   Total Time: ${totalDuration} seconds`);
  console.log(`   URLs Processed: ${results.length}`);
  console.log(`   Successful: ${results.filter(r => r.success).length}`);
  console.log(`   Total Events: ${results.reduce((sum, r) => sum + r.eventCount, 0)}`);
  
  return { totalDuration: parseFloat(totalDuration), results };
}

// Main test function
async function runPerformanceTest() {
  console.log('🚀 Betting Data Processing Performance Test');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Testing with ${testUrls.length} URLs:`);
  testUrls.forEach((url, index) => {
    console.log(`   ${index + 1}. ${new URL(url).hostname}`);
  });
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Ensure test output directory exists
  if (!fs.existsSync('test-output')) {
    fs.mkdirSync('test-output', { recursive: true });
  }
  
  try {
    // Test sequential processing
    const sequentialResults = await testSequentialProcessing();
    
    // Wait a bit between tests
    console.log('\n⏳ Waiting 5 seconds before concurrent test...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test concurrent processing
    const concurrentResults = await testConcurrentProcessing();
    
    // Compare results
    console.log('\n🏆 Performance Comparison');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Sequential Processing: ${sequentialResults.totalDuration}s`);
    console.log(`Concurrent Processing: ${concurrentResults.totalDuration}s`);
    
    const improvement = ((sequentialResults.totalDuration - concurrentResults.totalDuration) / sequentialResults.totalDuration * 100).toFixed(1);
    const speedup = (sequentialResults.totalDuration / concurrentResults.totalDuration).toFixed(1);
    
    if (concurrentResults.totalDuration < sequentialResults.totalDuration) {
      console.log(`🚀 Improvement: ${improvement}% faster (${speedup}x speedup)`);
      console.log(`⏱️  Time Saved: ${(sequentialResults.totalDuration - concurrentResults.totalDuration).toFixed(1)} seconds`);
    } else {
      console.log(`⚠️  Concurrent processing was slower by ${Math.abs(improvement)}%`);
    }
    
    // Save detailed results
    const detailedResults = {
      testDate: new Date().toISOString(),
      urlCount: testUrls.length,
      sequential: sequentialResults,
      concurrent: concurrentResults,
      improvement: {
        percentageFaster: parseFloat(improvement),
        speedupFactor: parseFloat(speedup),
        timeSaved: sequentialResults.totalDuration - concurrentResults.totalDuration
      }
    };
    
    fs.writeFileSync('test-output/performance-comparison.json', JSON.stringify(detailedResults, null, 2));
    console.log('\n📁 Detailed results saved to: test-output/performance-comparison.json');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

// Run the test
console.log('Starting performance test in 3 seconds...');
setTimeout(runPerformanceTest, 3000); 