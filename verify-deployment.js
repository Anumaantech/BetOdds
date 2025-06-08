const https = require('https');
const http = require('http');

// Configuration - Update these URLs with your actual Render service URLs
const CONFIG = {
  monitoringService: process.env.MONITORING_URL || 'https://betting-monitor.onrender.com',
  cricketApi: process.env.CRICKET_API_URL || 'https://cricket-api.onrender.com',
  localTesting: process.env.LOCAL_TEST === 'true'
};

// For local testing
if (CONFIG.localTesting) {
  CONFIG.monitoringService = 'http://localhost:3000';
  CONFIG.cricketApi = 'http://localhost:3005';
}

console.log('🔍 Verifying Deployment...');
console.log(`📊 Monitoring Service: ${CONFIG.monitoringService}`);
console.log(`🏏 Cricket API: ${CONFIG.cricketApi}`);
console.log('─'.repeat(50));

// Helper function to make HTTP/HTTPS requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        resolve({
          statusCode: res.statusCode,
          data: data,
          responseTime: responseTime,
          headers: res.headers
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Test function
async function testEndpoint(name, url, expectedStatus = 200) {
  try {
    console.log(`🔄 Testing ${name}...`);
    const response = await makeRequest(url);
    
    if (response.statusCode === expectedStatus) {
      console.log(`✅ ${name}: OK (${response.responseTime}ms)`);
      
      // Try to parse JSON response
      try {
        const jsonData = JSON.parse(response.data);
        if (jsonData.success !== undefined) {
          console.log(`   Success: ${jsonData.success}`);
        }
        if (jsonData.status) {
          console.log(`   Status: ${jsonData.status}`);
        }
        if (jsonData.totalUrls !== undefined) {
          console.log(`   Total URLs: ${jsonData.totalUrls}`);
        }
        if (jsonData.data && jsonData.data.totalCollections !== undefined) {
          console.log(`   Cricket Collections: ${jsonData.data.totalCollections}`);
        }
      } catch (e) {
        // Not JSON, that's okay
        console.log(`   Response length: ${response.data.length} characters`);
      }
    } else {
      console.log(`❌ ${name}: HTTP ${response.statusCode}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return false;
  }
}

// Main verification function
async function verifyDeployment() {
  let allTestsPassed = true;
  
  console.log('🚀 Starting deployment verification...\n');
  
  // Test monitoring service
  console.log('📊 MONITORING SERVICE TESTS');
  console.log('─'.repeat(30));
  
  const monitoringTests = [
    ['Status Endpoint', `${CONFIG.monitoringService}/api/status`],
    ['URLs Endpoint', `${CONFIG.monitoringService}/api/urls`]
  ];
  
  for (const [name, url] of monitoringTests) {
    const result = await testEndpoint(name, url);
    if (!result) allTestsPassed = false;
  }
  
  console.log('\n🏏 CRICKET API TESTS');
  console.log('─'.repeat(20));
  
  // Test cricket API
  const cricketTests = [
    ['Health Check', `${CONFIG.cricketApi}/health`],
    ['Cricket Collections', `${CONFIG.cricketApi}/api/sport/cricket`]
  ];
  
  for (const [name, url] of cricketTests) {
    const result = await testEndpoint(name, url);
    if (!result) allTestsPassed = false;
  }
  
  // Final results
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('✅ Your deployment is working correctly!');
    console.log('\n📱 Service URLs:');
    console.log(`   Monitoring: ${CONFIG.monitoringService}`);
    console.log(`   Cricket API: ${CONFIG.cricketApi}`);
    
    if (!CONFIG.localTesting) {
      console.log('\n🔗 Quick Links:');
      console.log(`   Admin Interface: ${CONFIG.monitoringService}`);
      console.log(`   API Status: ${CONFIG.monitoringService}/api/status`);
      console.log(`   Cricket Data: ${CONFIG.cricketApi}/api/sport/cricket`);
    }
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('Please check the service logs and configuration.');
    process.exit(1);
  }
}

// Performance test
async function performanceTest() {
  if (CONFIG.localTesting) {
    console.log('\n⚡ PERFORMANCE TEST (Local)');
  } else {
    console.log('\n⚡ PERFORMANCE TEST');
  }
  console.log('─'.repeat(25));
  
  const testUrl = `${CONFIG.monitoringService}/api/status`;
  const testCount = 5;
  const times = [];
  
  for (let i = 1; i <= testCount; i++) {
    try {
      const startTime = Date.now();
      await makeRequest(testUrl);
      const responseTime = Date.now() - startTime;
      times.push(responseTime);
      console.log(`   Test ${i}: ${responseTime}ms`);
    } catch (error) {
      console.log(`   Test ${i}: Failed - ${error.message}`);
    }
  }
  
  if (times.length > 0) {
    const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    console.log(`   Average: ${avgTime}ms`);
    console.log(`   Min: ${minTime}ms, Max: ${maxTime}ms`);
    
    if (avgTime < 1000) {
      console.log('   ✅ Performance: Excellent');
    } else if (avgTime < 3000) {
      console.log('   ⚠️  Performance: Good');
    } else {
      console.log('   🐌 Performance: Slow (consider upgrading plan)');
    }
  }
}

// Run verification
async function main() {
  try {
    await verifyDeployment();
    await performanceTest();
  } catch (error) {
    console.error('💥 Verification failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--local')) {
  process.env.LOCAL_TEST = 'true';
  CONFIG.localTesting = true;
}

if (process.argv.includes('--help')) {
  console.log('Usage: node verify-deployment.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --local    Test local development environment');
  console.log('  --help     Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log('  MONITORING_URL  URL of monitoring service (default: https://betting-monitor.onrender.com)');
  console.log('  CRICKET_API_URL URL of cricket API service (default: https://cricket-api.onrender.com)');
  process.exit(0);
}

main(); 