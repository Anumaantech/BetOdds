require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Default configuration
const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3005',
  targetUrl: process.env.TARGET_URL ,
  outputFile: 'extracted_data.json',
  verbose: false,
  jsonOutput: false,
  extractComplete: false,  // Add new option for complete extraction
  expandAll: false        // Add new option to expand all market items
};

// Parse command line arguments
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--verbose' || arg === '-v') {
    config.verbose = true;
    continue;
  }
  
  if (arg === '--json' || arg === '-j') {
    config.jsonOutput = true;
    continue;
  }
  
  if (arg === '--complete' || arg === '-c') {
    config.extractComplete = true;
    continue;
  }
  
  if (arg === '--expand-all' || arg === '-e') {
    config.expandAll = true;
    continue;
  }
  
  // Skip to next iteration if this is a flag without a value
  if (arg.startsWith('--') && (!args[i + 1] || args[i + 1].startsWith('--'))) {
    continue;
  }
  
  const value = args[i + 1];
  
  if (arg === '--api' && value) {
    config.apiUrl = value;
    i++; // Skip the next argument as we've used it as a value
  } else if (arg === '--url' && value) {
    config.targetUrl = value;
    i++; // Skip the next argument as we've used it as a value
  } else if (arg === '--output' && value) {
    config.outputFile = value;
    i++; // Skip the next argument as we've used it as a value
  }
}

async function extractData() {
  if (!config.jsonOutput) {
    console.log(`Extracting data from: ${config.targetUrl}`);
    console.log(`Using API at: ${config.apiUrl}`);
    if (config.extractComplete) {
      console.log('Using COMPLETE extraction mode (captures entire DOM structure)');
    }
    if (config.expandAll) {
      console.log('Will EXPAND ALL market items before extraction');
    }
  }
  
  try {
    // First check if the API is up
    const healthCheck = await axios.get(`${config.apiUrl}/health`);
    if (healthCheck.data?.status !== 'ok') {
      throw new Error('API server is not healthy');
    }
    
    if (!config.jsonOutput) {
      console.log('API server is healthy, extracting data...');
    }
    
    // Make the extraction request to the appropriate endpoint
    const response = await axios.post(`${config.apiUrl}/extract`, {
      url: config.targetUrl,
      complete: config.extractComplete,
      expandAll: config.expandAll
    });
    
    if (!response.data?.success) {
      throw new Error('Data extraction failed');
    }
    
    // Get the data
    const data = response.data.data;
    
    // If we're using normal extraction, post-process Over/Under markets
    if (!config.extractComplete) {
      // Fix Over/Under markets
      if (data && data.markets) {
        data.markets.forEach(market => {
          // Fix the specific market we're having issues with
          if (market.title === "England total runs before dismissal #1. Innings #1" && 
              market.outcomes && market.outcomes.length === 2) {
            
            // Extract threshold from raw HTML or data-anchor
            let threshold = null;
            
            // Try to extract threshold from raw HTML
            const thresholdMatch = market.raw_html.match(/body-rounded-medium EC_Hc">([0-9.]+)<\/span>/);
            if (thresholdMatch && thresholdMatch[1]) {
              threshold = thresholdMatch[1];
            }
            
            // If we have a threshold and two outcomes
            if (threshold) {
              // Verify if the Over/Under labels are present in HTML
              const hasOverLabel = market.raw_html.includes('>Over</span>');
              const hasUnderLabel = market.raw_html.includes('>Under</span>');
              
              if (hasOverLabel && hasUnderLabel) {
                // Check data-anchor for outcomeType
                market.outcomes.forEach(outcome => {
                  if (outcome.attributes && outcome.attributes["data-anchor"]) {
                    try {
                      const anchorData = JSON.parse(
                        outcome.attributes["data-anchor"]
                          .replace(/^outcome_/, '')
                          .replace(/&quot;/g, '"')
                      );
                      
                      if (anchorData.outcomeType === 37) {
                        outcome.name = `Over ${threshold}`;
                      } else if (anchorData.outcomeType === 38) {
                        outcome.name = `Under ${threshold}`;
                      }
                    } catch (err) {
                      // If we can't parse the data-anchor, use position-based approach
                      if (!outcome.name) {
                        const index = market.outcomes.indexOf(outcome);
                        outcome.name = index === 0 ? `Over ${threshold}` : `Under ${threshold}`;
                      }
                    }
                  } else if (!outcome.name) {
                    // Fallback to position-based naming
                    const index = market.outcomes.indexOf(outcome);
                    outcome.name = index === 0 ? `Over ${threshold}` : `Under ${threshold}`;
                  }
                });
              }
            }
          }
        });
      }
    }
    
    // Save the data to file
    fs.writeFileSync(config.outputFile, JSON.stringify(data, null, 2));
    
    if (config.jsonOutput) {
      // If --json flag is set, output only the markets data in JSON format
      if (config.extractComplete) {
        console.log(JSON.stringify(data.complete_structure, null, 2));
      } else {
        const marketsData = data.markets;
        console.log(JSON.stringify(marketsData, null, 2));
      }
    } else {
      console.log(`Data successfully extracted and saved to ${config.outputFile}`);
      
      // Print a summary of the data
      console.log('\nExtraction Summary:');
      console.log(`Source: ${data.source}`);
      console.log(`Page Title: ${data.page_title}`);
      console.log(`Match: ${data.match}`);
      console.log(`Event ID: ${data.event_id}`);
      console.log(`Timestamp: ${data.timestamp}`);
      
      if (config.extractComplete) {
        console.log(`Extracted complete DOM structure from event-markets container`);
        console.log(`Total size: ${JSON.stringify(data).length} characters`);
        console.log(`DOM tree depth: ${getTreeDepth(data.complete_structure)} levels`);
        console.log(`Total elements extracted: ${countElements(data.complete_structure)}`);
      } else {
        console.log(`Available Tabs: ${data.tabs.map(tab => tab.name).join(', ')}`);
        console.log(`Markets: ${data.markets.length}`);
        
        // Print market information
        console.log('\nMarkets:');
        data.markets.forEach((market, index) => {
          console.log(`${index + 1}. ${market.title} (${market.outcomes.length} outcomes)`);
          
          // Show outcomes for ALL markets, not just the first 2
          if (market.outcomes.length === 0) {
            console.log('   No outcomes found');
          } else {
            market.outcomes.forEach(outcome => {
              console.log(`   - ${outcome.name || 'Unnamed'}: ${outcome.coefficient || 'No coefficient'}`);
            });
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Helper function to calculate tree depth for complete extraction
function getTreeDepth(node) {
  if (!node || !node.children || node.children.length === 0) {
    return 1;
  }
  
  let maxChildDepth = 0;
  for (const child of node.children) {
    const childDepth = getTreeDepth(child);
    maxChildDepth = Math.max(maxChildDepth, childDepth);
  }
  
  return 1 + maxChildDepth;
}

// Helper function to count total elements
function countElements(node) {
  if (!node) return 0;
  
  let count = 1; // Count this node
  
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      count += countElements(child);
    }
  }
  
  return count;
}

extractData(); 