#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the URL from command line arguments
const newUrl = process.argv[2];

if (!newUrl) {
  console.error('Error: No URL provided');
  console.log('Usage: node set-url.js <new-url>');
  console.log('Example: node set-url.js url');
  process.exit(1);
}

// Check if the URL looks valid
if (!newUrl.startsWith('https://') && !newUrl.startsWith('http://')) {
  console.error('Error: URL must start with http:// or https://');
  process.exit(1);
}

// Path to .env file
const envPath = path.join(__dirname, '.env');

try {
  let envContent = '';
  
  // Read existing .env file if it exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Update or add TARGET_URL
  const targetUrlPattern = /^TARGET_URL=.*$/m;
  const newTargetUrlLine = `TARGET_URL=${newUrl}`;
  
  if (targetUrlPattern.test(envContent)) {
    // Replace existing TARGET_URL
    envContent = envContent.replace(targetUrlPattern, newTargetUrlLine);
    console.log('Updated existing TARGET_URL in .env file');
  } else {
    // Add TARGET_URL to the file
    if (envContent && !envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += newTargetUrlLine + '\n';
    console.log('Added TARGET_URL to .env file');
  }
  
  // Ensure API configuration exists
  if (!envContent.includes('API_PORT=')) {
    envContent += 'API_PORT=3005\n';
  }
  if (!envContent.includes('API_URL=')) {
    envContent += 'API_URL=http://localhost:3005\n';
  }
  
  // Write updated content back to .env file
  fs.writeFileSync(envPath, envContent);
  
  console.log(`\nURL updated successfully in .env file: ${newUrl}`);
  console.log('All scripts will now use this URL automatically.');
  console.log('\nYou can now run any of the scripts:');
  console.log('- npm run start (scraper.js)');
  console.log('- npm run client (client.js)');
  console.log('- npm run extract-complete (extract-complete.js)');
  
} catch (error) {
  console.error(`Error updating .env file:`, error.message);
  process.exit(1);
} 