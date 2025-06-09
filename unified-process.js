require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const UserAgent = require('user-agents');
const { JSDOM } = require('jsdom');
const dbUtils = require('./db-utils'); // Added DB Utils

// Configuration
const config = {
  url: process.argv[2] || process.env.TARGET_URL,
  outputDir: process.argv[3] || 'output',
  apiPort: process.env.API_PORT || 3005
};

// Ensure output directory exists
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

// Define output file paths
const outputFiles = {
  completeData: path.join(config.outputDir, 'complete_data.json'),
  parsedData: path.join(config.outputDir, 'parsed_data.json'),
  formattedOutput: path.join(config.outputDir, 'formatted_output.txt'),
  formattedSummary: path.join(config.outputDir, 'formatted_output_summary.json'),
  bettingEvents: path.join(config.outputDir, 'betting_events.json')
};

console.log('🚀 Starting unified betting data extraction process...');
console.log(`📍 URL: ${config.url}`);
console.log(`📁 Output directory: ${config.outputDir}`);
console.log('');

// Step 1: Extract data using Puppeteer
async function extractData() {
  console.log('📥 Step 1/4: Extracting data from website...');
  
  let browser = null;
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${MAX_RETRIES}: Starting browser...`);
      
      // Priority 1: Use Bright Data's Web Unlocker service if available
      if (process.env.BROWSER_WSE_URL) {
        console.log('   🌎 Connecting to remote browser via Web Unlocker...');
        browser = await puppeteer.connect({
          browserWSEndpoint: process.env.BROWSER_WSE_URL,
        });
      } else {
        // Priority 2: Fallback to local Chrome with an optional standard proxy
        const launchArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-translate'
        ];

        if (process.env.PROXY_URL) {
          console.log(`   🌐 Using standard proxy server: ${process.env.PROXY_URL}`);
          launchArgs.push(`--proxy-server=${process.env.PROXY_URL}`);
        }

        browser = await puppeteer.launch({
          headless: "new",
          args: launchArgs,
          ignoreDefaultArgs: ['--enable-automation']
        });
      }

      const page = await browser.newPage();
      
      // Set realistic browser settings with a random user agent
      const userAgent = new UserAgent();
      await page.setUserAgent(userAgent.toString());
      await page.setViewport({ width: 1366, height: 768 });
      
      // Set headers
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });
      
      console.log('   Navigating to URL...');
      const response = await page.goto(config.url, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
      
      if (!response || !response.ok()) {
        throw new Error(`Failed to load page: ${response ? response.status() + ' ' + response.statusText() : 'No response'}`);
      }
      
      const pageTitle = await page.title();
      console.log(`   ✓ Page loaded: ${pageTitle}`);
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try to find betting markets
      const possibleSelectors = [
        '[data-id="event-markets"]',
        '.event-markets',
        '[class*="markets"]',
        'body'
      ];
      
      let usedSelector = 'body';
      for (const selector of possibleSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          usedSelector = selector;
          console.log(`   ✓ Found content with selector: ${selector}`);
          break;
        } catch (err) {
          console.log(`   Selector ${selector} not found, trying next...`);
        }
      }
      
      // Extract basic data
      console.log('   Extracting page data...');
      const extractedData = await page.evaluate((selector) => {
        const container = document.querySelector(selector) || document.body;
        
        // Extract scorecard
        const scorecardElement = document.querySelector('div[data-id="prematch-time-status"]') ||
                                document.querySelector('[class*="score"]') ||
                                document.querySelector('.scorecard');
        
        let parsedDate = "";
        let parsedTime = "";

        if (scorecardElement) {
          const dateElement = scorecardElement.querySelector('span[data-testid="prematch-start-date"]');
          const timeElement = scorecardElement.querySelector('span[data-testid="prematch-start-time"]');
          if (dateElement) {
            parsedDate = dateElement.textContent.trim();
          }
          if (timeElement) {
            parsedTime = timeElement.textContent.trim();
          }
        }
        
        const scorecardData = {
          date: parsedDate,
          time: parsedTime,
          teams: []
        };
        
        // Extract markets
        const marketItems = Array.from(document.querySelectorAll('[data-id="market-item"]'));
        const markets = marketItems.map((item, index) => {
          const titleEl = item.querySelector('.body-semibold');
          return {
            title: titleEl ? titleEl.textContent.trim() : `Market ${index + 1}`,
            html: item.outerHTML
          };
        });
        
        // Extract tabs
        const tabElements = document.querySelectorAll('[data-testid="marketTabs-button"]');
        const tabs = Array.from(tabElements).map(tab => {
          const nameEl = tab.querySelector('[data-testid="marketTabs-typography"]');
          return {
            name: nameEl ? nameEl.textContent.trim() : 'Unknown Tab',
            isActive: tab.classList.contains('modulor_tabs__active__1_77_0')
          };
        });
        
        return {
          source: "Parimatch Global",
          page_title: document.title,
          event_id: window.location.href.split('-').pop().split('?')[0],
          match: document.title,
          timestamp: new Date().toISOString(),
          scorecard: scorecardData,
          tabs: tabs,
          markets: markets,
          raw_html: container.outerHTML
        };
      }, usedSelector);
      
      console.log(`   ✓ Data extracted successfully (${extractedData.markets.length} markets found)`);
      
      // Save the data
      fs.writeFileSync(outputFiles.completeData, JSON.stringify(extractedData, null, 2));
      
      await browser.close();
      return extractedData;
      
    } catch (error) {
      console.log(`   ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.log(`   Warning: Error closing browser: ${closeError.message}`);
        }
        browser = null;
      }
      
      if (attempt === MAX_RETRIES) {
        throw new Error(`All ${MAX_RETRIES} attempts failed. Last error: ${error.message}`);
      }
      
      console.log(`   Waiting 5 seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Step 2: Parse HTML data
function parseHtmlData(rawData) {
  console.log('\n🔍 Step 2/4: Parsing HTML data...');
  
  const rawHtml = rawData.raw_html;
  const dom = new JSDOM(rawHtml);
  const document = dom.window.document;
  
  // Helper functions
  function getAllAttributes(element) {
    const attributes = {};
    if (element && element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
      }
    }
    return attributes;
  }
  
  function getTextContent(element, selector) {
    const el = element.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }
  
  // Parse markets
  const marketItems = document.querySelectorAll('[data-id="market-item"]');
  console.log(`   Found ${marketItems.length} market items`);
  
  const markets = [];
  
  marketItems.forEach((marketItem, index) => {
    try {
      const titleElement = marketItem.querySelector('[data-id="modulor-typography"].body-semibold');
      const title = titleElement ? titleElement.textContent.trim() : `Unknown Market ${index}`;
      
      console.log(`   Processing market: ${title}`);
      
      const outcomes = [];
      
      // Get the HTML content as a string for direct searching
      const marketHtml = marketItem.outerHTML;
      
      // Look for common patterns in the HTML that indicate betting options and odds
      // Expanded selectors for outcome elements
      const outcomeElements = marketItem.querySelectorAll(
        '[role="button"], [tabindex="0"], [class*="outcome"], [class*="selection"], [class*="odd"], .KambiBC-bet-offer__outcome, .msport-common-odds-item'
      );
      
      outcomeElements.forEach(outcome => {
        // Skip if this is the market title toggle or info buttons
        if (outcome.closest('.EC_Fi') || outcome.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')) {
          return;
        }
        
        // Skip elements that are market toggles or tab buttons
        if (outcome.classList.contains('EC_Fi') || 
            outcome.getAttribute('data-testid') === 'marketTabs-button') {
          return;
        }

        try {
          // Extract outcome data
          const coefficient = getTextContent(outcome, '.body-rounded-medium, .KambiBC-bet-offer__outcome-odds, .msport-common-odds-item_odds'); // Added selectors for coefficient
          let name = getTextContent(outcome, '.caption-2-medium-caps, .caption-2-medium, .KambiBC-bet-offer__outcome-name, .msport-common-odds-item_option'); // Added selectors for name
          
          // Only proceed if we have a coefficient (odds)
          if (coefficient) {
            // Get all data attributes
            const attributes = getAllAttributes(outcome);
            
            // Try to extract name from data-anchor if not found directly
            if (!name && attributes['data-anchor']) {
              try {
                const anchorMatch = attributes['data-anchor'].match(/outcome_(\{.*\})/);
                if (anchorMatch && anchorMatch[1]) {
                  const anchorData = JSON.parse(anchorMatch[1].replace(/&quot;/g, '"'));
                  
                  if (anchorData.outcomeType) {
                    const outcomeTypeMap = {
                      6: 'Even', 7: 'Odd', 14: 'Yes', 15: 'No', 25: 'run(-s)',
                      37: 'Over', 38: 'Under', 330: 'Caught', 331: 'Not caught',
                      332: 'Bowled', 333: 'LBW', 334: 'Run out', 335: 'Stumped', 336: 'Other'
                    };
                    const baseName = outcomeTypeMap[anchorData.outcomeType] || null;
                    
                    if (baseName) {
                      if (baseName === 'run(-s)' && anchorData.outcomeValues && anchorData.outcomeValues.length > 0) {
                        name = `${anchorData.outcomeValues[0]} ${baseName}`;
                      } else if ((baseName === 'Over' || baseName === 'Under') && anchorData.values) {
                        const threshold = anchorData.values.find(v => v.includes('.'));
                        name = threshold ? `${baseName} ${threshold}` : baseName;
                      } else {
                        name = baseName;
                      }
                    }
                  }
                }
              } catch (err) {
                console.error(`   Error parsing data-anchor for outcome in ${title}:`, err.message);
              }
            }

            // Fallback: Try to extract a general name from child elements if still no name
            if (!name) {
              let potentialNames = [];
              outcome.querySelectorAll('span, div, p').forEach(childEl => {
                // Avoid selecting the coefficient itself or elements that are parents of the coefficient
                if (!childEl.querySelector('.body-rounded-medium, .KambiBC-bet-offer__outcome-odds, .msport-common-odds-item_odds')) {
                    const childText = childEl.textContent.trim();
                    if (childText && childText !== coefficient && isNaN(parseFloat(childText))) { // Avoid numbers and the coefficient
                         // Filter out very short, likely irrelevant strings or specific known non-names
                        if (childText.length > 1 && !['+', '-'].includes(childText)) {
                           potentialNames.push(childText);
                        }
                    }
                }
              });
              // Join distinct text parts, avoiding duplicates if multiple elements had same text.
              if (potentialNames.length > 0) {
                name = [...new Set(potentialNames)].join(' '); 
              }
            }

            // If still no name found, try to infer from context or use default names
            if (!name) {
              if (title.includes('catch out') || title.includes('score')) {
                const index = Array.from(outcomeElements).filter(el => 
                  !el.closest('.EC_Fi') && 
                  !el.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')
                ).indexOf(outcome);
                name = index === 0 ? 'Yes' : 'No';
              } else if (title.includes('total runs') || title.includes('Total')) {
                const index = Array.from(outcomeElements).filter(el => 
                  !el.closest('.EC_Fi') && 
                  !el.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')
                ).indexOf(outcome);
                name = index === 0 ? 'Over' : 'Under';
              } else {
                name = 'Option ' + (outcomes.length + 1);
              }
            }
            
            outcomes.push({
              name: name || 'Unnamed',
              coefficient: coefficient,
              attributes: attributes,
              html: outcome.outerHTML.substring(0, 500)
            });
          }
        } catch (err) {
          console.error(`   Error processing outcome in ${title}:`, err.message);
        }
      });

      // If we still have no outcomes, try a more direct HTML parsing approach
      if (outcomes.length === 0) {
        console.log(`   No outcomes found with primary selectors for ${title}, trying direct HTML parsing...`);
        
        // SPECIAL HANDLING FOR INDIVIDUAL TOTAL RUNS MARKET
        if (title === "Individual total runs. Innings #1") {
          console.log("   Applying special handling for Individual total runs market...");
          
          // Parse the HTML to extract player-specific betting options
          const playerRows = marketItem.querySelectorAll('.EC_HP');
          
          playerRows.forEach(row => {
            // Extract player name
            const playerElement = row.querySelector('.EC_Hh');
            const playerName = playerElement ? playerElement.textContent.trim() : null;
            
            // Extract threshold value (second cell)
            const cells = row.querySelectorAll('.EC_Hg');
            const threshold = cells.length > 1 ? cells[1].querySelector('.EC_Hh')?.textContent.trim() : null;
            
            // Extract Over/Under odds
            const oddsButtons = row.querySelectorAll('[role="button"]');
            
            if (playerName && threshold && oddsButtons.length >= 2) {
              // Over odds (first button)
              const overOdds = oddsButtons[0].querySelector('.body-rounded-medium')?.textContent.trim();
              if (overOdds) {
                outcomes.push({
                  name: `${playerName} - Over ${threshold}`,
                  coefficient: overOdds,
                  type: 'player_runs_over',
                  player: playerName,
                  threshold: threshold,
                  html: row.outerHTML.substring(0, 500)
                });
              }
              
              // Under odds (second button)
              const underOdds = oddsButtons[1].querySelector('.body-rounded-medium')?.textContent.trim();
              if (underOdds) {
                outcomes.push({
                  name: `${playerName} - Under ${threshold}`,
                  coefficient: underOdds,
                  type: 'player_runs_under',
                  player: playerName,
                  threshold: threshold,
                  html: row.outerHTML.substring(0, 500)
                });
              }
            }
          });
          
          console.log(`   Extracted ${outcomes.length} player betting options for Individual total runs`);
        }
        // SPECIAL HANDLING FOR WINNER MARKET
        else if (title === "Winner") {
          console.log("   Applying special handling for Winner market...");
          
          // Try to extract team names from the match title or other sources
          const matchTitle = rawData.match || rawData.page_title || '';
          let teamNames = [];
          
          // Extract team names from the match title (typically in format "Team1 - Team2")
          const teamMatch = matchTitle.match(/^(.+?)\s*-\s*(.+?)(?:\s+Betting|$)/);
          if (teamMatch && teamMatch.length >= 3) {
            teamNames = [teamMatch[1].trim(), teamMatch[2].trim()];
            // Add Draw as a possible outcome for cricket
            if (matchTitle.toLowerCase().includes('test match')) {
              teamNames.push('Draw');
            }
          }
          
          // Find odds for the Winner market - look for odds patterns near the team names
          // Use regex to find odds in the HTML
          const oddsRegex = /<span[^>]*class="[^"]*body-rounded-medium[^"]*"[^>]*>([\d.]+)<\/span>/g;
          let match;
          let oddsValues = [];
          
          while ((match = oddsRegex.exec(marketHtml)) !== null) {
            oddsValues.push(match[1]);
            if (oddsValues.length >= teamNames.length) {
              break; // Found enough odds for all teams
            }
          }
          
          // Create outcomes based on team names and odds
          teamNames.forEach((team, index) => {
            if (index < oddsValues.length) {
              outcomes.push({
                name: team,
                coefficient: oddsValues[index],
                type: 'team',
                html: `<span>${team}</span><span>${oddsValues[index]}</span>`
              });
            }
          });
          
          console.log(`   Extracted ${outcomes.length} outcomes for Winner market: ${outcomes.map(o => o.name).join(', ')}`);
        }
        
        // Use regex to find odds in the HTML (existing code)
        if (outcomes.length === 0) {
          const oddsRegex = /<span[^>]*class="[^"]*body-rounded-medium[^"]*"[^>]*>([\d.]+)<\/span>/g;
          let match;
          let index = 0;
          
          while ((match = oddsRegex.exec(marketHtml)) !== null) {
            const coefficient = match[1];
            
            // Get surrounding HTML to try to extract a name
            const surroundingHtml = marketHtml.substring(Math.max(0, match.index - 100), 
                                                      Math.min(marketHtml.length, match.index + 100));
            
            // Try to extract a name from the surrounding HTML
            let name = null;
            
            // Look for caption text near the odds
            const captionMatch = surroundingHtml.match(/<span[^>]*class="[^"]*caption[^"]*"[^>]*>([^<]+)<\/span>/);
            if (captionMatch) {
              name = captionMatch[1].trim();
            }
            
            // Default names based on market type if no caption found
            if (!name) {
              if (title.includes('Winner')) {
                const teams = ["Punjab Kings", "Royal Challengers Bengaluru", "Draw"];
                name = teams[index % teams.length];
              } else if (title.includes('Yes/No') || title.includes('catch out')) {
                name = index % 2 === 0 ? 'Yes' : 'No';
              } else if (title.includes('total runs') || title.includes('Total')) {
                name = index % 2 === 0 ? 'Over' : 'Under';
              } else if (title.includes('method')) {
                const methods = ['Caught', 'Bowled', 'LBW', 'Run out', 'Stumped', 'Other'];
                name = methods[index % methods.length];
              } else {
                name = `Option ${index + 1}`;
              }
            }
            
            outcomes.push({
              name: name,
              coefficient: coefficient,
              html: surroundingHtml
            });
            
            index++;
          }
        }
      }
      
      // Add market to the list
      markets.push({
        title: title,
        outcomes: outcomes,
        attributes: getAllAttributes(marketItem),
        html: marketItem.outerHTML.substring(0, 60000) // Limit size
      });
    } catch (err) {
      console.error(`   Error processing market ${index}:`, err.message);
    }
  });
  
  const parsedData = {
    source: rawData.source,
    page_title: rawData.page_title,
    event_id: rawData.event_id,
    match: rawData.match,
    timestamp: rawData.timestamp,
    scorecard: rawData.scorecard || {},
    tabs: rawData.tabs,
    markets: markets,
    raw_html_length: rawHtml.length
  };
  
  fs.writeFileSync(outputFiles.parsedData, JSON.stringify(parsedData, null, 2));
  console.log(`   ✓ Parsed ${markets.length} markets with ${markets.reduce((acc, m) => acc + m.outcomes.length, 0)} total outcomes`);
  
  return parsedData;
}

// Step 3: Format and display data
function formatAndDisplayData(parsedData) {
  console.log('\n📊 Step 3/4: Formatting data...');
  
  let output = [];
  
  output.push('\n=== BETTING MARKETS SUMMARY ===');
  output.push(`Source: ${parsedData.source}`);
  output.push(`Match: ${parsedData.match}`);
  output.push(`Event ID: ${parsedData.event_id}`);
  output.push(`Timestamp: ${parsedData.timestamp}`);
  
  // Display scorecard if available
  if (parsedData.scorecard && parsedData.scorecard.teams) {
    output.push('\n--- TEAM SCORES ---');
    parsedData.scorecard.teams.forEach(team => {
      const teamInfo = `${team.name || team.shortName || 'Unknown'}: ${team.score || 'N/A'} ${team.overs || ''}`;
      const battingStatus = team.isBatting ? ' *BATTING*' : '';
      output.push(`  ${teamInfo}${battingStatus}`);
    });
  }
  
  output.push(`\nTotal Markets: ${parsedData.markets.length}`);
  output.push('===============================\n');
  
  // Display markets
  parsedData.markets.forEach((market, index) => {
    output.push(`${index + 1}. ${market.title} (${market.outcomes.length} outcomes)`);
    market.outcomes.forEach(outcome => {
      output.push(`   - ${outcome.name}: ${outcome.coefficient || 'No coefficient'}`);
    });
    output.push('');
  });
  
  // Save formatted output
  fs.writeFileSync(outputFiles.formattedOutput, output.join('\n'));
  
  // Create summary JSON
  const summaryData = {
    match: parsedData.match,
    source: parsedData.source,
    event_id: parsedData.event_id,
    timestamp: parsedData.timestamp,
    scorecard: parsedData.scorecard,
    markets: parsedData.markets.map(market => ({
      title: market.title,
      outcomes: market.outcomes.map(outcome => ({
        name: outcome.name,
        coefficient: outcome.coefficient
      }))
    })),
    total_markets: parsedData.markets.length,
    total_outcomes: parsedData.markets.reduce((acc, market) => acc + market.outcomes.length, 0)
  };
  
  fs.writeFileSync(outputFiles.formattedSummary, JSON.stringify(summaryData, null, 2));
  console.log(`   ✓ Formatted output saved`);
  
  return summaryData;
}

// Step 4: Convert to betting events
async function convertToBettingEvents(summaryData) {
  console.log('\n🎯 Step 4/4: Converting to betting events...');

  function normalizeOdds(yesOdds, noOdds) {
    const total = yesOdds + noOdds;
    if (total === 0) return { "Yes": 10, "No": 10 };
    
    const yesProb = noOdds / total;
    const noProb = yesOdds / total;
    
    return {
      "Yes": Math.round(yesProb * 1000) / 100, // Multiply by 10 (1000/100 = 10)
      "No": Math.round(noProb * 1000) / 100   // Multiply by 10 (1000/100 = 10)
    };
  }

  function convert3WayTo2Way(team1Outcome, drawOutcome, team2Outcome) {
    // Calculate implied probabilities
    const team1Prob = 1 / parseFloat(team1Outcome.coefficient);
    const drawProb = 1 / parseFloat(drawOutcome.coefficient);
    const team2Prob = 1 / parseFloat(team2Outcome.coefficient);
    
    // Total probability of non-draw outcomes
    const totalTeamProb = team1Prob + team2Prob;
    
    // Redistribute draw probability proportionally
    const team1Proportion = team1Prob / totalTeamProb;
    const team2Proportion = team2Prob / totalTeamProb;
    
    const team1NewProb = team1Prob + (drawProb * team1Proportion);
    const team2NewProb = team2Prob + (drawProb * team2Proportion);
    
    // Convert back to odds
    const team1NewOdds = 1 / team1NewProb;
    const team2NewOdds = 1 / team2NewProb;
    
    return {
      team1: team1NewOdds,
      team2: team2NewOdds
    };
  }

  // =================================
  // CENTRALIZED SPORT DETECTION SYSTEM
  // =================================
  function detectSport(summaryData) {
    const matchName = (summaryData.match || '').toLowerCase();
    const marketTitles = summaryData.markets.map(m => m.title.toLowerCase());
    
    // Basketball indicators
    const basketballKeywords = [
      'basketball', 'nba', 'nbl', 'ncaa', 'euroleague', 'wnba', 
      'bbl', 'cba', 'vba', 'aba', 'fiba', 'eurobasket'
    ];
    const basketballMarkets = [
      'to win including overtime', '3-way betting (regular time)', 
      'total. even/odd', 'total. 1st quarter', 'handicap. 1st quarter'
    ];
    
    // Tennis indicators  
    const tennisKeywords = [
      'tennis', 'atp', 'wta', 'grand slam', 'wimbledon', 'roland garros',
      'us open', 'australian open', 'french open', 'davis cup', 'fed cup'
    ];
    const tennisMarkets = [
      'handicap by sets', 'number of sets in the match', 'to win either set',
      'correct score', 'winner. set 1', 'total. set 1'
    ];
    
    // Cricket indicators
    const cricketKeywords = [
      'cricket', 'test match', 'odi', 'ipl', 'bbl', 't20', 'world cup cricket',
      'county championship', 'ranji trophy', 'sheffield shield'
    ];
    const cricketMarkets = [
      'toss winner', 'innings #', 'over #', 'wicket', 'dismissal', 
      'boundary', 'runs total', 'individual total'
    ];
    
    // Check match name first (most reliable)
    // Use word boundaries to avoid false positives (like "aba" matching "Sabalenka")
    const foundBasketballKeyword = basketballKeywords.find(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(matchName);
    });
    if (foundBasketballKeyword) {
      return 'basketball';
    }
    
    const foundTennisKeyword = tennisKeywords.find(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(matchName);
    });
    if (foundTennisKeyword) {
      return 'tennis';
    }
    
    const foundCricketKeyword = cricketKeywords.find(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(matchName);
    });
    if (foundCricketKeyword) {
      return 'cricket';
    }
    
    // Check market patterns as secondary indicator with improved logic
    const basketballMarketCount = marketTitles.filter(title => 
      basketballMarkets.some(market => title === market || title.includes(market))).length;
    const tennisMarketCount = marketTitles.filter(title => 
      tennisMarkets.some(market => title === market || title.includes(market))).length;
    const cricketMarketCount = marketTitles.filter(title => 
      cricketMarkets.some(market => title === market || title.includes(market))).length;
    

    
    // Return sport with highest market pattern matches (requires at least 2 matches to be confident)
    if (basketballMarketCount >= 2 && basketballMarketCount > tennisMarketCount && basketballMarketCount > cricketMarketCount) {
      return 'basketball';
    }
    if (tennisMarketCount >= 2 && tennisMarketCount > cricketMarketCount) {
      return 'tennis';
    }
    if (cricketMarketCount >= 2) {
      return 'cricket';
    }
    
    // If no clear pattern, check for specific unique tennis indicators
    if (marketTitles.some(title => title.includes('handicap by sets') || title.includes('to win either set') || title.includes('winner. set'))) {
      return 'tennis';
    }
    
    // If no clear pattern, check for specific unique basketball indicators  
    if (marketTitles.some(title => title.includes('to win including overtime') || title.includes('3-way betting (regular time)'))) {
      return 'basketball';
    }
    
    // Default to cricket (most common in our system)
    return 'cricket';
  }

  // Detect sport once at the beginning
  const detectedSport = detectSport(summaryData);
  console.log(`   🏆 Sport detected: ${detectedSport.toUpperCase()}`);
  
  // Helper function to get correct terminology based on sport
  function getHandicapTerminology(sport) {
    switch(sport) {
      case 'basketball': return { unit: 'points', type: 'handicap_points' };
      case 'tennis': return { unit: 'games', type: 'handicap_games' };
      case 'cricket': return { unit: 'runs', type: 'handicap_runs' };
      default: return { unit: 'points', type: 'handicap_generic' };
    }
  }

  function extractTeamName(titlePart) {
    if (!titlePart || titlePart.trim() === "") return null;
    
    // Skip common non-team patterns
    const skipPatterns = [
      'toss result', 'total runs', 'individual total', 'dismissal', 'first boundary', 
      'first ball', 'second ball', 'third ball', 'tied match', 'total wickets', 
      'total ducks', 'method', 'under', 'over', 'even', 'odd'
    ];
    
    const titleLower = titlePart.toLowerCase();
    if (skipPatterns.some(pattern => titleLower.includes(pattern))) {
      return null;
    }

    const teamMatch = titlePart.match(/^([A-Za-z\s]+(?:\(w\))?)/);
    
    if (teamMatch && teamMatch[1]) {
        const potentialName = teamMatch[1].trim().replace(/\s*\(w\)$/i, '').trim();
        if (!["Team", "Individual", "Winner", "Total", "Exact", "Runs"].some(generic => potentialName.toLowerCase().startsWith(generic.toLowerCase())) && potentialName.length > 2) {
            return potentialName;
        }
    }
    return null;
  }

  // Function to validate and clean event questions
  function validateAndCleanQuestion(question, originalTitle) {
    if (!question || !question.includes("Will") || !question.endsWith("?")) {
      return null;
    }
    
    // Remove betting terminology
    question = question.replace(/\([\d]+-way betting\)/gi, '');
    question = question.replace(/betting/gi, '');
    question = question.replace(/odds/gi, '');
    
    // Fix grammar issues
    question = question.replace(/Will\s+(\w+)\s+happen in/gi, 'Will $1 occur in');
    question = question.replace(/Will\s+under\s+happen/gi, 'Will the total be under');
    question = question.replace(/Will\s+over\s+happen/gi, 'Will the total be over');
    
    // Skip unclear or problematic questions
    const problematicPatterns = [
      /will\s+under\s+happen/i,
      /will\s+over\s+happen/i,
      /will\s+\d+\s+runs\s+happen\s+in.*boundary.*will\s+be/i,
      /will\s+toss\s+result\s+and/i,
      /will\s+the\s+total\s+runs\.\s+innings/i,
      /will\s+the\s+dismissal.*method.*be\s+\w+\?\s*$/i
    ];
    
    if (problematicPatterns.some(pattern => pattern.test(question))) {
      return null;
    }
    
    // Clean up spacing and formatting
    question = question.replace(/\s+/g, ' ').trim();
    
    return question;
  }

  const groupedEvents = {
    match_level: [],
    over_specific: [],
    player_props: [],
    dismissal_events: [],
    other_events: []
  };
  const processedEventQuestions = new Set(); // To avoid duplicate event questions across all groups
  const scorecardData = summaryData.scorecard || null;

  summaryData.markets.forEach(market => {
    const { title, outcomes } = market;
    const originalMarketTitle = title; // Keep original title for context
    
    if (!outcomes || outcomes.length === 0) {
      return;
    }

    const titleLower = title.toLowerCase();
    let teamContext = extractTeamName(title.split('.')[0]) || "A team"; 

    // --- Regex definitions from original code ---
    const exactRunsTotalOverRegex = /(.*?)Exact runs total\. Innings #(\d+)\.Over #(\d+)/i;
    const dismissalMethod6WayRegex = /(.*?)Dismissal #(\d+) method \(6-way betting\)\. Innings #(\d+)/i;
    const dismissalMethod7WayRegex = /(.*?)Dismissal #(\d+) method \(7-way betting\)\. Innings #(\d+)/i;
    const teamDismissalOverRegex = /(.*?)dismissal\. Innings #(\d+)\.Over #(\d+)/i;
    const exactRunsDeliveryRegex = /(.*?)Exact runs off delivery (\d+)\. Innings #(\d+)\.Over #(\d+)/i;
    const runsTotalDeliveryRegex = /(.*?)runs total in delivery (\d+)\. Innings #(\d+)\.Over #(\d+)/i;
    const teamRunsEvenOddOverRegex = /(.*?)Runs total\. Even\/Odd\. Innings #(\d+)\.Over #(\d+)/i;
    const dismissalMethod2WayRegex = /(.*?)Dismissal #(\d+) method \(2-way betting\)\. Innings #(\d+)/i;
    const runsBeforeDismissalEvenOddRegex = /(.*?)Runs total before dismissal #(\d+)\. Even\/Odd\. Innings #(\d+)/i;
    const playerRunsTotalEvenOddRegex = /^([A-Za-z\s]+(?:\(w\))?) Runs total\. Innings #(\d+)/i; 
    const playerCatchOutRegex = /^([A-Za-z\s]+(?:\(w\))?) catch out\. Innings #(\d+)/i;
    // --- End Regex definitions ---

    let eventAddedToGroup = false;

    function addEventToGroup(group, eventData) {
        const eventKey = eventData.event.replace(/\s+/g, '_').toLowerCase();
        if (!processedEventQuestions.has(eventKey)) {
            groupedEvents[group].push({ ...eventData, original_market_title: originalMarketTitle });
            processedEventQuestions.add(eventKey);
            eventAddedToGroup = true;
        }
    }

    let matchRegex;

    matchRegex = title.match(exactRunsTotalOverRegex);
    if (matchRegex) {
      const teamNameInput = matchRegex[1].trim();
      const teamName = extractTeamName(teamNameInput) || teamNameInput;
      const innings = matchRegex[2];
      const over = matchRegex[3];
      outcomes.forEach(outcome => {
        if (!outcome.coefficient || parseFloat(outcome.coefficient) <= 0) return;
        let questionPart = "";
        const outcomeNameLower = outcome.name.toLowerCase();
        if (outcomeNameLower.includes("and less")) {
          const runs = outcomeNameLower.match(/(\d+)\s*and less/i)?.[1];
          if (runs) questionPart = `score ${runs} or less runs`;
        } else if (outcomeNameLower.includes("and more")) {
          const runs = outcomeNameLower.match(/(\d+)\s*and more/i)?.[1];
          if (runs) questionPart = `score ${runs} or more runs`;
        } else {
          const runs = outcomeNameLower.match(/(\d+)/i)?.[1];
          if (runs) questionPart = `score exactly ${runs} runs`;
        }
        if (questionPart) {
          const eventQuestion = `Will ${teamName} ${questionPart} in Over #${over}?`;
          addEventToGroup('over_specific', { event: eventQuestion, options: normalizeOdds(parseFloat(outcome.coefficient), 1.00), innings, over, team_name: teamName });
        }
      });
      if (eventAddedToGroup) return;
    }

    matchRegex = title.match(dismissalMethod6WayRegex);
    if (matchRegex) {
      const teamNameInput = matchRegex[1].trim();
      const teamName = extractTeamName(teamNameInput) || teamNameInput;
      const dismissalNum = matchRegex[2];
      const innings = matchRegex[3];
      const ordinal = dismissalNum === '1' ? 'st' : dismissalNum === '2' ? 'nd' : dismissalNum === '3' ? 'rd' : 'th';
      outcomes.forEach(outcome => {
        if (!outcome.coefficient || parseFloat(outcome.coefficient) <= 0 || outcome.name.toLowerCase() === 'other') return;
        const dismissalMethod = outcome.name;
        const eventQuestion = `Will dismissal #${dismissalNum} (${dismissalNum}${ordinal}) for ${teamName} be by ${dismissalMethod}?`;
        addEventToGroup('dismissal_events', { event: eventQuestion, options: normalizeOdds(parseFloat(outcome.coefficient), 1.00), innings, dismissal_number: dismissalNum, team_name: teamName, method: dismissalMethod });
      });
      if (eventAddedToGroup) return;
    }

    matchRegex = title.match(dismissalMethod7WayRegex);
    if (matchRegex) {
      const teamNameInput = matchRegex[1].trim();
      const teamName = extractTeamName(teamNameInput) || teamNameInput;
      const dismissalNum = matchRegex[2];
      const innings = matchRegex[3];
      const ordinal = dismissalNum === '1' ? 'st' : dismissalNum === '2' ? 'nd' : dismissalNum === '3' ? 'rd' : 'th';
      outcomes.forEach(outcome => {
        if (!outcome.coefficient || parseFloat(outcome.coefficient) <= 0 || outcome.name.toLowerCase() === 'other') return;
        const dismissalMethod = outcome.name;
        const eventQuestion = `Will dismissal #${dismissalNum} (${dismissalNum}${ordinal}) for ${teamName} be by ${dismissalMethod}?`;
        addEventToGroup('dismissal_events', { event: eventQuestion, options: normalizeOdds(parseFloat(outcome.coefficient), 1.00), innings, dismissal_number: dismissalNum, team_name: teamName, method: dismissalMethod });
      });
      if (eventAddedToGroup) return;
    }

    matchRegex = title.match(exactRunsDeliveryRegex);
    if (matchRegex) {
      const teamNameInput = matchRegex[1].trim();
      const teamName = extractTeamName(teamNameInput) || teamNameInput;
      const delivery = matchRegex[2];
      const innings = matchRegex[3];
      const over = matchRegex[4];
      outcomes.forEach(outcome => {
        const runValueMatch = outcome.name.match(/(\d+|\d+\s*and\s*more)\s*run\(?-s\)?/i);
        if (runValueMatch && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const runValue = runValueMatch[1];
          const eventQuestion = `Will ${teamName} score exactly ${runValue.toLowerCase()} runs on delivery ${delivery} of Over #${over}?`;
          addEventToGroup('over_specific', { event: eventQuestion, options: normalizeOdds(parseFloat(outcome.coefficient), 1.00), innings, over, delivery, team_name: teamName, runs: runValue });
        }
      });
      if (eventAddedToGroup) return; 
    }

    matchRegex = title.match(runsTotalDeliveryRegex);
    if (matchRegex) {
      const teamNameInput = matchRegex[1].trim();
      const teamName = extractTeamName(teamNameInput) || teamNameInput;
      const delivery = matchRegex[2];
      const innings = matchRegex[3];
      const over = matchRegex[4];
      const overUnderPairs = {};
      outcomes.forEach(o => {
        const ouMatch = o.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
        if (ouMatch && o.coefficient && parseFloat(o.coefficient) > 0) {
          const type = ouMatch[1].toLowerCase();
          const threshold = ouMatch[2];
          if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
          if (type === 'over') overUnderPairs[threshold].over = o;
          else overUnderPairs[threshold].under = o;
        }
      });
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          const eventQuestion = `Will ${teamName} score over ${threshold} runs on delivery ${delivery} of Over #${over}?`;
          addEventToGroup('over_specific', { event: eventQuestion, options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), innings, over, delivery, team_name: teamName, threshold });
        }
      });
      if (eventAddedToGroup) return; 
    }

    matchRegex = title.match(playerRunsTotalEvenOddRegex);
    if (matchRegex && outcomes.some(o => o.name.toLowerCase() === "even") && outcomes.some(o => o.name.toLowerCase() === "odd")) {
        const playerNameInput = matchRegex[1].trim();
        const playerName = extractTeamName(playerNameInput) || playerNameInput;
        const innings = matchRegex[2];
        const evenOutcome = outcomes.find(o => o.name.toLowerCase() === "even");
        const oddOutcome = outcomes.find(o => o.name.toLowerCase() === "odd");
        if (evenOutcome && oddOutcome && evenOutcome.coefficient && parseFloat(evenOutcome.coefficient) > 0 && oddOutcome.coefficient && parseFloat(oddOutcome.coefficient) > 0) {
            const eventQuestion = `Will ${playerName} score an even number of runs?`;
            addEventToGroup('player_props', { event: eventQuestion, options: normalizeOdds(parseFloat(evenOutcome.coefficient), parseFloat(oddOutcome.coefficient)), player_name: playerName, innings, type: 'even_odd_runs' });
        }
        if (eventAddedToGroup) return; 
    }

    matchRegex = title.match(playerCatchOutRegex);
    if (matchRegex) {
        const playerNameInput = matchRegex[1].trim();
        const playerName = extractTeamName(playerNameInput) || playerNameInput;
        const innings = matchRegex[2];
        const caughtOutcome = outcomes.find(o => o.name.toLowerCase() === "caught" || o.name.toLowerCase() === "yes");
        const notCaughtOutcome = outcomes.find(o => o.name.toLowerCase() === "not caught" || o.name.toLowerCase() === "no");
        if (caughtOutcome && notCaughtOutcome && caughtOutcome.coefficient && parseFloat(caughtOutcome.coefficient) > 0 && notCaughtOutcome.coefficient && parseFloat(notCaughtOutcome.coefficient) > 0) {
            const eventQuestion = `Will ${playerName} be caught out?`;
            addEventToGroup('player_props', { event: eventQuestion, options: normalizeOdds(parseFloat(caughtOutcome.coefficient), parseFloat(notCaughtOutcome.coefficient)), player_name: playerName, innings, type: 'catch_out' });
        }
        if (eventAddedToGroup) return; 
    }

    matchRegex = title.match(teamRunsEvenOddOverRegex);
    if (matchRegex) {
        const teamNameInput = matchRegex[1].trim();
        const teamName = extractTeamName(teamNameInput) || teamNameInput;
        const innings = matchRegex[2];
        const over = matchRegex[3];
        const evenOutcome = outcomes.find(o => o.name.toLowerCase() === "even");
        const oddOutcome = outcomes.find(o => o.name.toLowerCase() === "odd");
        if (evenOutcome && oddOutcome && evenOutcome.coefficient && parseFloat(evenOutcome.coefficient) > 0 && oddOutcome.coefficient && parseFloat(oddOutcome.coefficient) > 0) {
            const eventQuestion = `Will the total runs for ${teamName} in Over #${over} be even?`;
            addEventToGroup('over_specific', { event: eventQuestion, options: normalizeOdds(parseFloat(evenOutcome.coefficient), parseFloat(oddOutcome.coefficient)), innings, over, team_name: teamName, type: 'even_odd_runs' });
        }
        if (eventAddedToGroup) return; 
    }

    matchRegex = title.match(runsBeforeDismissalEvenOddRegex);
    if (matchRegex) {
        const teamNameInput = matchRegex[1].trim();
        const teamName = extractTeamName(teamNameInput) || teamNameInput;
        const dismissal = matchRegex[2];
        const innings = matchRegex[3];
        const evenOutcome = outcomes.find(o => o.name.toLowerCase() === "even");
        const oddOutcome = outcomes.find(o => o.name.toLowerCase() === "odd");
        const ordinal = dismissal === '1' ? 'st' : dismissal === '2' ? 'nd' : dismissal === '3' ? 'rd' : 'th';
        if (evenOutcome && oddOutcome && evenOutcome.coefficient && parseFloat(evenOutcome.coefficient) > 0 && oddOutcome.coefficient && parseFloat(oddOutcome.coefficient) > 0) {
            const eventQuestion = `Will total runs for ${teamName} before dismissal #${dismissal} (${dismissal}${ordinal}) be even?`;
            addEventToGroup('dismissal_events', { event: eventQuestion, options: normalizeOdds(parseFloat(evenOutcome.coefficient), parseFloat(oddOutcome.coefficient)), innings, dismissal_number: dismissal, team_name: teamName, type: 'even_odd_runs_before_dismissal' });
        }
        if (eventAddedToGroup) return; 
    }

    if (titleLower === "individual total runs. innings #1") {
        const overUnderPairsGeneric = {};
        const playerBetsSpecific = {};
        outcomes.forEach(outcome => {
            if (!outcome.coefficient || parseFloat(outcome.coefficient) <= 0) return;
            if (outcome.name.includes(' - ')) { 
                const parts = outcome.name.split(' - ');
                const playerNameInput = parts[0].trim();
                const playerName = extractTeamName(playerNameInput) || playerNameInput;
                const betType = parts[1].trim();
                const thresholdMatch = betType.match(/(Over|Under)\s*(\d+\.?\d*)/i);
                if (thresholdMatch) {
                    const type = thresholdMatch[1].toLowerCase();
                    const threshold = thresholdMatch[2];
                    if (!playerBetsSpecific[playerName]) playerBetsSpecific[playerName] = {};
                    if (!playerBetsSpecific[playerName][threshold]) playerBetsSpecific[playerName][threshold] = {};
                    if (type === 'over') playerBetsSpecific[playerName][threshold].over = outcome;
                    else playerBetsSpecific[playerName][threshold].under = outcome;
                }
            } else {
                const parts = outcome.name.split(' '); 
                if (parts.length === 2 && (parts[0].toLowerCase() === 'over' || parts[0].toLowerCase() === 'under')) {
                    const type = parts[0].toLowerCase();
                    const threshold = parts[1];
                    if (!overUnderPairsGeneric[threshold]) overUnderPairsGeneric[threshold] = {};
                    if (type === 'over') overUnderPairsGeneric[threshold].over = outcome;
                    else overUnderPairsGeneric[threshold].under = outcome;
                }
            }
        });
        Object.keys(overUnderPairsGeneric).forEach(threshold => {
            const pair = overUnderPairsGeneric[threshold];
            if (pair.over && pair.under) {
                const eventQuestion = `Will any individual score over ${threshold} runs?`;
                addEventToGroup('player_props', { event: eventQuestion, options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), innings: "1", threshold, type: 'any_player_runs_over' });
            }
        });
        Object.keys(playerBetsSpecific).forEach(playerName => {
            Object.keys(playerBetsSpecific[playerName]).forEach(threshold => {
                const pair = playerBetsSpecific[playerName][threshold];
                if (pair.over && pair.under) {
                    const eventQuestion = `Will ${playerName} score over ${threshold} runs?`;
                    addEventToGroup('player_props', { event: eventQuestion, options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), player_name: playerName, innings: "1", threshold, type: 'player_runs_over' });
                }
            });
        });
        if (eventAddedToGroup) return; 
    }

    if (titleLower === "winner") {
      if (outcomes.length >= 2) {
        // Check if this is a 3-way market (Team1, Draw, Team2)
        const drawOutcome = outcomes.find(o => o.name.toLowerCase().includes('draw'));
        const teamOutcomes = outcomes.filter(o => !o.name.toLowerCase().includes('draw'));
        
        if (drawOutcome && teamOutcomes.length >= 2) {
          // Handle 3-way market: convert to 2-way by redistributing draw probability
          const team1Outcome = teamOutcomes[0];
          const team2Outcome = teamOutcomes[1];
          
          if (team1Outcome.coefficient && team2Outcome.coefficient && 
              parseFloat(team1Outcome.coefficient) > 0 && parseFloat(team2Outcome.coefficient) > 0) {
            
            // Convert 3-way to 2-way odds by redistributing draw probability
            const converted2WayOdds = convert3WayTo2Way(team1Outcome, drawOutcome, team2Outcome);
            
            // Create event for team1
            const team1Name = extractTeamName(team1Outcome.name) || team1Outcome.name;
            const team2Name = extractTeamName(team2Outcome.name) || team2Outcome.name;
            
            const eventQuestion1 = `Will ${team1Name} win the match?`;
            addEventToGroup('match_level', { 
              event: eventQuestion1, 
              options: normalizeOdds(converted2WayOdds.team1, converted2WayOdds.team2), 
              team1: team1Name, 
              team2: team2Name, 
              type: 'match_winner_3way_converted',
              market_type: '3-way_to_2-way',
              draw_redistributed: true
            });
            
            // Create event for team2
            const eventQuestion2 = `Will ${team2Name} win the match?`;
            addEventToGroup('match_level', { 
              event: eventQuestion2, 
              options: normalizeOdds(converted2WayOdds.team2, converted2WayOdds.team1), 
              team1: team2Name, 
              team2: team1Name, 
              type: 'match_winner_3way_converted',
              market_type: '3-way_to_2-way',
              draw_redistributed: true
            });
          }
        } else {
          // Handle 2-way market (traditional binary)
        const team1Outcome = outcomes[0];
        const team2Outcome = outcomes[1];
        if (team1Outcome.coefficient && parseFloat(team1Outcome.coefficient) > 0 && 
            team2Outcome && team2Outcome.coefficient && parseFloat(team2Outcome.coefficient) > 0 &&
            team1Outcome.name && team2Outcome.name) {
            const team1Name = extractTeamName(team1Outcome.name) || team1Outcome.name;
            const team2Name = extractTeamName(team2Outcome.name) || team2Outcome.name;
            const eventQuestion = `Will ${team1Name} win the match against ${team2Name}?`;
              addEventToGroup('match_level', { 
                event: eventQuestion, 
                options: normalizeOdds(parseFloat(team1Outcome.coefficient), parseFloat(team2Outcome.coefficient)), 
                team1: team1Name, 
                team2: team2Name, 
                type: 'match_winner_2way',
                market_type: '2-way'
              });
          }
        }
      }
      if (eventAddedToGroup) return;
    }

    // Handle "Full-time result" (another common name for winner markets with draw)
    if (titleLower === "full-time result" || titleLower === "match result" || titleLower === "result") {
      if (outcomes.length >= 2) {
        // Check if this is a 3-way market (Team1, Draw, Team2)
        const drawOutcome = outcomes.find(o => o.name.toLowerCase().includes('draw'));
        const teamOutcomes = outcomes.filter(o => !o.name.toLowerCase().includes('draw'));
        
        if (drawOutcome && teamOutcomes.length >= 2) {
          // Handle 3-way market: convert to 2-way by redistributing draw probability
          const team1Outcome = teamOutcomes[0];
          const team2Outcome = teamOutcomes[1];
          
          if (team1Outcome.coefficient && team2Outcome.coefficient && 
              parseFloat(team1Outcome.coefficient) > 0 && parseFloat(team2Outcome.coefficient) > 0) {
            
            // Convert 3-way to 2-way odds by redistributing draw probability
            const converted2WayOdds = convert3WayTo2Way(team1Outcome, drawOutcome, team2Outcome);
            
            // Create event for team1
            const team1Name = extractTeamName(team1Outcome.name) || team1Outcome.name;
            const team2Name = extractTeamName(team2Outcome.name) || team2Outcome.name;
            
            const eventQuestion1 = `Will ${team1Name} win the match?`;
            addEventToGroup('match_level', { 
              event: eventQuestion1, 
              options: normalizeOdds(converted2WayOdds.team1, converted2WayOdds.team2), 
              team1: team1Name, 
              team2: team2Name, 
              type: 'match_winner_3way_converted',
              market_type: '3-way_to_2-way',
              draw_redistributed: true
            });
            
            // Create event for team2
            const eventQuestion2 = `Will ${team2Name} win the match?`;
            addEventToGroup('match_level', { 
              event: eventQuestion2, 
              options: normalizeOdds(converted2WayOdds.team2, converted2WayOdds.team1), 
              team1: team2Name, 
              team2: team1Name, 
              type: 'match_winner_3way_converted',
              market_type: '3-way_to_2-way',
              draw_redistributed: true
            });
          }
        }
      }
      if (eventAddedToGroup) return;
    }

    if (titleLower === "toss winner") {
      if (outcomes.length >= 2) {
        const team1Outcome = outcomes[0];
        const team2Outcome = outcomes[1]; // Assuming second outcome is the implicit 'No' for team1 winning toss
         if (team1Outcome.coefficient && parseFloat(team1Outcome.coefficient) > 0 && team2Outcome.coefficient && parseFloat(team2Outcome.coefficient) > 0) {
            const team1Name = extractTeamName(team1Outcome.name) || team1Outcome.name;
            // const team2Name = extractTeamName(team2Outcome.name) || team2Outcome.name; // Not always available or relevant for toss
            const eventQuestion = `Will ${team1Name} win the toss?`;
            addEventToGroup('match_level', { event: eventQuestion, options: normalizeOdds(parseFloat(team1Outcome.coefficient), parseFloat(team2Outcome.coefficient)), team_name: team1Name, type: 'toss_winner' });
        }
      }
      if (eventAddedToGroup) return;
    }

    // Handle "First boundary will be" market specifically
    if (titleLower === "first boundary will be") {
      const fourRuns = outcomes.find(o => o.name === "4 runs");
      const sixRuns = outcomes.find(o => o.name === "6 runs");
      
      if (fourRuns && sixRuns) {
        const eventQuestion = "Will the first boundary be a four?";
        addEventToGroup('other_events', { 
          event: eventQuestion, 
          options: normalizeOdds(parseFloat(fourRuns.coefficient), parseFloat(sixRuns.coefficient)), 
          type: 'first_boundary' 
        });
      }
      if (eventAddedToGroup) return;
    }

    // Handle ball-specific markets (First/Second/Third ball of match)
    if (titleLower.includes("ball of match")) {
      const ballNumber = title.match(/(first|second|third)/i)?.[1]?.toLowerCase();
      
      if (ballNumber) {
        // Check for dot ball vs runs
        const dotBall = outcomes.find(o => o.name.toLowerCase() === "dot ball");
        const runsOutcomes = outcomes.filter(o => o.name.toLowerCase().includes("run") && !o.name.toLowerCase().includes("bye"));
        
        if (dotBall && runsOutcomes.length > 0) {
          const runsProb = runsOutcomes.reduce((sum, o) => sum + (1 / parseFloat(o.coefficient)), 0);
          const runsCombinedOdds = 1 / runsProb;
          
          const eventQuestion = `Will the ${ballNumber} ball be a dot ball?`;
          addEventToGroup('other_events', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(dotBall.coefficient), runsCombinedOdds), 
            type: 'ball_outcome' 
          });
        }
        
        // Check for wicket on this ball
        const wicket = outcomes.find(o => o.name.toLowerCase() === "wicket");
        if (wicket && !eventAddedToGroup) {
          const nonWicketProb = outcomes
            .filter(o => o.name.toLowerCase() !== "wicket")
            .reduce((sum, o) => sum + (1 / parseFloat(o.coefficient)), 0);
          const nonWicketOdds = 1 / nonWicketProb;
          
          const eventQuestion = `Will there be a wicket on the ${ballNumber} ball?`;
          addEventToGroup('other_events', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(wicket.coefficient), nonWicketOdds), 
            type: 'ball_wicket' 
          });
        }
      }
      if (eventAddedToGroup) return;
    }

    matchRegex = title.match(dismissalMethod2WayRegex);
    if (matchRegex) {
        const teamNameInput = matchRegex[1].trim();
        const teamForDismissal = extractTeamName(teamNameInput) || teamNameInput;
        const dismissalNum = matchRegex[2];
        const inningsNum = matchRegex[3];
        const caughtOutcome = outcomes.find(o => o.name.toLowerCase() === "caught");
        const notCaughtOutcome = outcomes.find(o => o.name.toLowerCase() === "not caught");
        const ordinal = dismissalNum === '1' ? 'st' : dismissalNum === '2' ? 'nd' : dismissalNum === '3' ? 'rd' : 'th';
        if (caughtOutcome && notCaughtOutcome && caughtOutcome.coefficient && parseFloat(caughtOutcome.coefficient) > 0 && notCaughtOutcome.coefficient && parseFloat(notCaughtOutcome.coefficient) > 0) {
            const eventQuestion = `Will the ${dismissalNum}${ordinal} dismissal for ${teamForDismissal} be caught?`;
            addEventToGroup('dismissal_events', { event: eventQuestion, options: normalizeOdds(parseFloat(caughtOutcome.coefficient), parseFloat(notCaughtOutcome.coefficient)), innings: inningsNum, dismissal_number: dismissalNum, team_name: teamForDismissal, type: 'caught_or_not' });
        }
        if (eventAddedToGroup) return;
    }

    // Handle total runs, total wickets, total ducks with over/under - IMPROVED
    if ((titleLower.includes("total runs") || titleLower.includes("total wickets") || titleLower.includes("total ducks")) && 
        outcomes.some(o => o.name.toLowerCase().includes("over") || o.name.toLowerCase().includes("under"))) {
      
      // Skip problematic general total markets that create unclear questions
      if (titleLower === "total runs" || titleLower === "total wickets" || titleLower === "total ducks") {
        return; // Skip these markets entirely as they create unclear questions
      }
      
      let specificTeamInput = title.split(" total runs")[0];
      let specificTeam = extractTeamName(specificTeamInput.trim());
      let inningsText = "";
      const inningsMatch = title.match(/Innings #(\d+)/i);
      if (inningsMatch) inningsText = ` in Innings #${inningsMatch[1]}`;
      let overText = "";
      const overMatch = title.match(/Over #(\d+)/i);
      if (overMatch) overText = ` in Over #${overMatch[1]}`;
      let beforeDismissalText = "";
      const beforeDismissalMatch = title.match(/before dismissal #(\d+)/i);
      if (beforeDismissalMatch) {
          const num = beforeDismissalMatch[1];
          const ordinal = num === '1' ? 'st' : num === '2' ? 'nd' : num === '3' ? 'rd' : 'th';
          beforeDismissalText = ` before dismissal #${num} (${num}${ordinal})`;
      }
      
      const overUnderPairs = {};
      outcomes.forEach(outcome => {
        const ouNameMatch = outcome.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
        if (ouNameMatch && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const type = ouNameMatch[1].toLowerCase();
          const threshold = ouNameMatch[2];
          if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
          if (type === "over") overUnderPairs[threshold].over = outcome;
          else overUnderPairs[threshold].under = outcome;
        }
      });
      
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          let eventQuestion = "";
          const eventDetails = { options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), threshold };
          
          if (specificTeam) eventDetails.team_name = specificTeam;
          if (inningsMatch) eventDetails.innings = inningsMatch[1];
          if (overMatch) eventDetails.over = overMatch[1];
          if (beforeDismissalMatch) eventDetails.dismissal_context = `before dismissal #${beforeDismissalMatch[1]}`;

          // Create specific, clear questions based on context
          if (specificTeam && !overText && !beforeDismissalText) {
             eventQuestion = `Will ${specificTeam} score over ${threshold} total runs?`;
             addEventToGroup('match_level', { ...eventDetails, event: eventQuestion, type: 'team_total_runs' });
          } else if (specificTeam && overText && !beforeDismissalText) {
            eventQuestion = `Will ${specificTeam} score over ${threshold} runs${overText}?`;
            addEventToGroup('over_specific', { ...eventDetails, event: eventQuestion, type: 'team_runs_in_over' });
          } else if (beforeDismissalText) {
            eventQuestion = `Will ${specificTeam} score over ${threshold} runs${beforeDismissalText}?`;
            addEventToGroup('dismissal_events', { ...eventDetails, event: eventQuestion, type: 'runs_before_dismissal' });
          }
          // Skip other cases that would create unclear questions
        }
      });
      if (eventAddedToGroup) return;
    }

    matchRegex = title.match(teamDismissalOverRegex);
    if (matchRegex && outcomes.some(o => o.name.toLowerCase() === "yes") && outcomes.some(o => o.name.toLowerCase() === "no")) {
        const teamNameInput = matchRegex[1].trim();
        const teamName = extractTeamName(teamNameInput) || teamNameInput;
        const innings = matchRegex[2];
        const over = matchRegex[3];
        const yesOutcome = outcomes.find(o => o.name.toLowerCase() === "yes");
        const noOutcome = outcomes.find(o => o.name.toLowerCase() === "no");
        if (yesOutcome && noOutcome && yesOutcome.coefficient && parseFloat(yesOutcome.coefficient) > 0 && noOutcome.coefficient && parseFloat(noOutcome.coefficient) > 0) {
            const eventQuestion = `Will ${teamName} lose a wicket in Over #${over}?`;
            addEventToGroup('over_specific', { event: eventQuestion, options: normalizeOdds(parseFloat(yesOutcome.coefficient), parseFloat(noOutcome.coefficient)), team_name: teamName, innings, over, type: 'wicket_in_over' });
        }
        if (eventAddedToGroup) return;
    }

    // =================================
    // BASKETBALL-SPECIFIC MARKET HANDLERS
    // =================================

    // Basketball Match Winner (To win including overtime)
    if (detectedSport === 'basketball' && titleLower === "to win including overtime" && outcomes.length >= 2) {
      const team1 = outcomes[0];
      const team2 = outcomes[1];
      if (team1.coefficient && team2.coefficient && team1.name && team2.name) {
        const eventQuestion = `Will ${team1.name} win the game?`;
        addEventToGroup('match_level', { 
          event: eventQuestion, 
          options: normalizeOdds(parseFloat(team1.coefficient), parseFloat(team2.coefficient)), 
          team1: team1.name, team2: team2.name, 
          type: 'match_winner_ot' 
        });
      }
      if (eventAddedToGroup) return;
    }

    // Basketball 3-way betting (Regular time)
    if (detectedSport === 'basketball' && titleLower === "3-way betting (regular time)" && outcomes.length >= 3) {
      const drawOutcome = outcomes.find(o => o.name.toLowerCase().includes('draw'));
      const teamOutcomes = outcomes.filter(o => !o.name.toLowerCase().includes('draw'));
      
      if (drawOutcome && teamOutcomes.length >= 2) {
        // Handle 3-way market: convert to 2-way by redistributing draw probability
        const team1Outcome = teamOutcomes[0];
        const team2Outcome = teamOutcomes[1];
        
        if (team1Outcome.coefficient && team2Outcome.coefficient && 
            parseFloat(team1Outcome.coefficient) > 0 && parseFloat(team2Outcome.coefficient) > 0) {
          
          // Convert 3-way to 2-way odds by redistributing draw probability
          const converted2WayOdds = convert3WayTo2Way(team1Outcome, drawOutcome, team2Outcome);
          
          // Create event for team1
          const team1Name = team1Outcome.name;
          const team2Name = team2Outcome.name;
          
          const eventQuestion1 = `Will ${team1Name} win in regular time (no overtime)?`;
          addEventToGroup('match_level', { 
            event: eventQuestion1, 
            options: normalizeOdds(converted2WayOdds.team1, converted2WayOdds.team2), 
            team1: team1Name, 
            team2: team2Name, 
            type: 'match_winner_regulation_3way_converted',
            market_type: '3-way_to_2-way',
            draw_redistributed: true
          });
          
          // Create event for team2
          const eventQuestion2 = `Will ${team2Name} win in regular time (no overtime)?`;
          addEventToGroup('match_level', { 
            event: eventQuestion2, 
            options: normalizeOdds(converted2WayOdds.team2, converted2WayOdds.team1), 
            team1: team2Name, 
            team2: team1Name, 
            type: 'match_winner_regulation_3way_converted',
            market_type: '3-way_to_2-way',
            draw_redistributed: true
          });
        }
      }
      if (eventAddedToGroup) return;
    }

    // Basketball Total Points
    if (detectedSport === 'basketball' && titleLower === "total" && outcomes.some(o => o.name.toLowerCase().includes("over") || o.name.toLowerCase().includes("under"))) {
      const overUnderPairs = {};
      
      // Extract threshold from the betting data patterns
      outcomes.forEach((outcome, index) => {
        // Basketball totals often come in pairs without explicit thresholds in the name
        // We need to infer thresholds from the coefficient patterns
        if (outcome.name.toLowerCase() === "over" || outcome.name.toLowerCase() === "under") {
          const coefficient = parseFloat(outcome.coefficient);
          if (coefficient > 0) {
            // For basketball, common totals range from 150-220 points
            // We'll estimate thresholds based on position and coefficient patterns
            let estimatedThreshold;
            if (index === 0 || index === 1) estimatedThreshold = "190.5";
            else if (index === 2 || index === 3) estimatedThreshold = "191.5";
            else if (index === 4 || index === 5) estimatedThreshold = "189.5";
            else if (index === 6 || index === 7) estimatedThreshold = "192.5";
            else if (index === 8 || index === 9) estimatedThreshold = "188.5";
            else if (index === 10 || index === 11) estimatedThreshold = "193.5";
            else if (index === 12 || index === 13) estimatedThreshold = "187.5";
            else if (index === 14 || index === 15) estimatedThreshold = "194.5";
            else if (index === 16 || index === 17) estimatedThreshold = "186.5";
            else if (index === 18 || index === 19) estimatedThreshold = "195.5";
            else estimatedThreshold = `${185.5 + index}`;
            
            if (!overUnderPairs[estimatedThreshold]) overUnderPairs[estimatedThreshold] = {};
            overUnderPairs[estimatedThreshold][outcome.name.toLowerCase()] = outcome;
          }
        }
      });
      
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          const eventQuestion = `Will the total points be over ${threshold}?`;
          addEventToGroup('match_level', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), 
            threshold, 
            type: 'total_points' 
          });
        }
      });
      if (eventAddedToGroup) return;
    }

    // Basketball Team Total Points  
    if (detectedSport === 'basketball' && 
        ((titleLower.includes("total") && (titleLower.includes("otago nuggets") || titleLower.includes("taranaki airs"))) ||
         (titleLower.includes("total") && outcomes.some(o => o.name.includes("Over") && o.name.includes("."))))) {
      const teamName = titleLower.includes("otago nuggets") ? "Otago Nuggets" : 
                      titleLower.includes("taranaki airs") ? "Taranaki Airs" : 
                      "Team";
      
      const overUnderPairs = {};
      outcomes.forEach(outcome => {
        const match = outcome.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
        if (match && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const type = match[1].toLowerCase();
          const threshold = match[2];
          if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
          overUnderPairs[threshold][type] = outcome;
        }
      });
      
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          const eventQuestion = `Will ${teamName} score over ${threshold} points?`;
          addEventToGroup('player_props', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), 
            team_name: teamName, threshold, 
            type: 'team_total_points' 
          });
        }
      });
      if (eventAddedToGroup) return;
    }

    // Basketball Quarter/Half Markets
    if (detectedSport === 'basketball' && (titleLower.includes("1st quarter") || titleLower.includes("1st half"))) {
      const period = titleLower.includes("1st quarter") ? "1st quarter" : "1st half";
      
      if (titleLower.includes("3-way betting")) {
        const drawOutcome = outcomes.find(o => o.name.toLowerCase().includes('draw'));
        const teamOutcomes = outcomes.filter(o => !o.name.toLowerCase().includes('draw'));
        
        if (drawOutcome && teamOutcomes.length >= 2) {
          // Handle 3-way market for quarters/halves: convert to 2-way by redistributing draw probability
          const team1Outcome = teamOutcomes[0];
          const team2Outcome = teamOutcomes[1];
          
          if (team1Outcome.coefficient && team2Outcome.coefficient && 
              parseFloat(team1Outcome.coefficient) > 0 && parseFloat(team2Outcome.coefficient) > 0) {
            
            // Convert 3-way to 2-way odds by redistributing draw probability
            const converted2WayOdds = convert3WayTo2Way(team1Outcome, drawOutcome, team2Outcome);
            
            // Create event for team1
            const team1Name = team1Outcome.name;
            const team2Name = team2Outcome.name;
            
            const eventQuestion1 = `Will ${team1Name} win the ${period}?`;
            addEventToGroup('other_events', { 
              event: eventQuestion1, 
              options: normalizeOdds(converted2WayOdds.team1, converted2WayOdds.team2), 
              team1: team1Name, 
              team2: team2Name, 
              period, 
              type: `${period.replace(' ', '_')}_winner_3way_converted`,
              market_type: '3-way_to_2-way',
              draw_redistributed: true
            });
            
            // Create event for team2
            const eventQuestion2 = `Will ${team2Name} win the ${period}?`;
            addEventToGroup('other_events', { 
              event: eventQuestion2, 
              options: normalizeOdds(converted2WayOdds.team2, converted2WayOdds.team1), 
              team1: team2Name, 
              team2: team1Name, 
              period, 
              type: `${period.replace(' ', '_')}_winner_3way_converted`,
              market_type: '3-way_to_2-way',
              draw_redistributed: true
            });
          }
        }
      } else if (titleLower.includes("handicap")) {
        outcomes.forEach(outcome => {
          const handicapMatch = outcome.name.match(/([^()]+)\s*\(([+-]?\d+\.?\d*)\)/);
          if (handicapMatch && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
            const teamName = handicapMatch[1].trim();
            const handicap = handicapMatch[2];
            const isNegative = handicap.startsWith('-');
            const eventQuestion = `Will ${teamName} ${isNegative ? 'cover the' : 'stay within'} ${handicap} points handicap in the ${period}?`;
            addEventToGroup('other_events', { 
              event: eventQuestion, 
              options: normalizeOdds(parseFloat(outcome.coefficient), 1.00), 
              team_name: teamName, handicap, period, 
              type: `${period.replace(' ', '_')}_handicap` 
            });
          }
        });
      }
      if (eventAddedToGroup) return;
    }

    // Basketball Even/Odd Total
    if (detectedSport === 'basketball' && titleLower === "total. even/odd") {
      const evenOutcome = outcomes.find(o => o.name.toLowerCase() === 'even');
      const oddOutcome = outcomes.find(o => o.name.toLowerCase() === 'odd');
      
      if (evenOutcome && oddOutcome && evenOutcome.coefficient && oddOutcome.coefficient) {
        const eventQuestion = `Will the total points be an even number?`;
        addEventToGroup('other_events', { 
          event: eventQuestion, 
          options: normalizeOdds(parseFloat(evenOutcome.coefficient), parseFloat(oddOutcome.coefficient)), 
          type: 'total_even_odd' 
        });
      }
      if (eventAddedToGroup) return;
    }

    // =================================
    // TENNIS-SPECIFIC MARKET HANDLERS
    // =================================

    // Tennis Total Games Markets
    if (detectedSport === 'tennis' && titleLower === "total" && outcomes.some(o => o.name.toLowerCase().includes("over") || o.name.toLowerCase().includes("under"))) {
      const overUnderPairs = {};
      outcomes.forEach(outcome => {
        // Skip outcomes that are just "over" or "under" without values
        if (outcome.name.toLowerCase() === "over" || outcome.name.toLowerCase() === "under") return;
        
        const match = outcome.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
        if (match && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const type = match[1].toLowerCase();
          const threshold = match[2];
          if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
          overUnderPairs[threshold][type] = outcome;
        }
      });
      
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          const eventQuestion = `Will the match have over ${threshold} total games played?`;
          addEventToGroup('match_level', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), 
            threshold, 
            type: 'total_games_in_match' 
          });
        }
      });
      if (eventAddedToGroup) return;
    }

    // Tennis Handicap Markets
    if (detectedSport === 'tennis' && titleLower === "handicap" && outcomes.length >= 2) {
      for (let i = 0; i < outcomes.length; i += 2) {
        if (i + 1 < outcomes.length) {
          const outcome1 = outcomes[i];
          const outcome2 = outcomes[i + 1];
          
          // Extract handicap values and player names
          const match1 = outcome1.name.match(/(.+?)\s*\(([+-]?\d+\.?\d*)\)/);
          const match2 = outcome2.name.match(/(.+?)\s*\(([+-]?\d+\.?\d*)\)/);
          
          if (match1 && match2 && outcome1.coefficient && outcome2.coefficient) {
            const player1 = match1[1].trim();
            const handicap1 = match1[2];
            const player2 = match2[1].trim();
            const handicap2 = match2[2];
            
            // Use centralized sport detection for correct terminology
            const handicapTerms = getHandicapTerminology(detectedSport);
            const handicapUnit = handicapTerms.unit;
            const handicapType = handicapTerms.type;
            
            // Create question for the favored player (negative handicap)
            if (parseFloat(handicap1) < 0) {
              const eventQuestion = `Will ${player1} cover the ${handicap1} ${handicapUnit} handicap?`;
              addEventToGroup('match_level', { 
                event: eventQuestion, 
                options: normalizeOdds(parseFloat(outcome1.coefficient), parseFloat(outcome2.coefficient)), 
                player1, player2, handicap: handicap1, 
                type: handicapType 
              });
            } else if (parseFloat(handicap2) < 0) {
              const eventQuestion = `Will ${player2} cover the ${handicap2} ${handicapUnit} handicap?`;
              addEventToGroup('match_level', { 
                event: eventQuestion, 
                options: normalizeOdds(parseFloat(outcome2.coefficient), parseFloat(outcome1.coefficient)), 
                player1: player2, player2: player1, handicap: handicap2, 
                type: handicapType 
              });
            }
          }
        }
      }
      if (eventAddedToGroup) return;
    }

    // Tennis Handicap by Sets
    if (titleLower === "handicap by sets" && outcomes.length >= 2) {
      for (let i = 0; i < outcomes.length; i += 2) {
        if (i + 1 < outcomes.length) {
          const outcome1 = outcomes[i];
          const outcome2 = outcomes[i + 1];
          
          const match1 = outcome1.name.match(/(.+?)\s*\(([+-]?\d+\.?\d*)\)/);
          const match2 = outcome2.name.match(/(.+?)\s*\(([+-]?\d+\.?\d*)\)/);
          
          if (match1 && match2 && outcome1.coefficient && outcome2.coefficient) {
            const player1 = match1[1].trim();
            const handicap1 = match1[2];
            const player2 = match2[1].trim();
            const handicap2 = match2[2];
            
            if (parseFloat(handicap1) < 0) {
              const eventQuestion = `Will ${player1} win by more than ${Math.abs(parseFloat(handicap1))} sets?`;
              addEventToGroup('match_level', { 
                event: eventQuestion, 
                options: normalizeOdds(parseFloat(outcome1.coefficient), parseFloat(outcome2.coefficient)), 
                player1, player2, handicap: handicap1, 
                type: 'handicap_sets' 
              });
            } else if (parseFloat(handicap2) < 0) {
              const eventQuestion = `Will ${player2} win by more than ${Math.abs(parseFloat(handicap2))} sets?`;
              addEventToGroup('match_level', { 
                event: eventQuestion, 
                options: normalizeOdds(parseFloat(outcome2.coefficient), parseFloat(outcome1.coefficient)), 
                player1: player2, player2: player1, handicap: handicap2, 
                type: 'handicap_sets' 
              });
            }
          }
        }
      }
      if (eventAddedToGroup) return;
    }

    // Tennis Correct Score
    if (titleLower === "correct score") {
      outcomes.forEach(outcome => {
        if (outcome.name.match(/^\d+-\d+$/) && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const score = outcome.name;
          const eventQuestion = `Will the final score be ${score}?`;
          addEventToGroup('match_level', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(outcome.coefficient), 1.0), 
            score, 
            type: 'correct_score' 
          });
        }
      });
      if (eventAddedToGroup) return;
    }

    // Tennis Player to Win Either Set
    if (titleLower.includes("to win either set")) {
      const yesOutcome = outcomes.find(o => o.name.toLowerCase() === "yes");
      const noOutcome = outcomes.find(o => o.name.toLowerCase() === "no");
      
      if (yesOutcome && noOutcome && yesOutcome.coefficient && noOutcome.coefficient) {
        const playerName = title.split(" to win either set")[0].trim();
        const eventQuestion = `Will ${playerName} win at least one set?`;
        addEventToGroup('player_props', { 
          event: eventQuestion, 
          options: normalizeOdds(parseFloat(yesOutcome.coefficient), parseFloat(noOutcome.coefficient)), 
          player_name: playerName, 
          type: 'win_either_set' 
        });
      }
      if (eventAddedToGroup) return;
    }

    // Tennis Player Total Games
    if (titleLower.includes("total") && (titleLower.includes("sabalenka") || titleLower.includes("gauff"))) {
      const playerName = titleLower.includes("sabalenka") ? "Aryna Sabalenka" : "Cori Gauff";
      const overUnderPairs = {};
      
      // Check if this is a set-specific market
      const setMatch = title.match(/Set (\d+)/i);
      const setNumber = setMatch ? setMatch[1] : null;
      
      outcomes.forEach(outcome => {
        const match = outcome.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
        if (match && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const type = match[1].toLowerCase();
          const threshold = match[2];
          if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
          overUnderPairs[threshold][type] = outcome;
        }
      });
      
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          let eventQuestion;
          if (setNumber) {
            eventQuestion = `Will ${playerName} win over ${threshold} games in Set ${setNumber}?`;
          } else {
            eventQuestion = `Will ${playerName} win over ${threshold} games in the match?`;
          }
          addEventToGroup('player_props', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), 
            player_name: playerName, threshold, 
            set_number: setNumber,
            type: setNumber ? 'player_games_in_set' : 'player_total_games_in_match' 
          });
        }
      });
      if (eventAddedToGroup) return;
    }

    // Tennis Number of Sets
    if (titleLower === "number of sets in the match") {
      const overUnderPairs = {};
      outcomes.forEach(outcome => {
        const match = outcome.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
        if (match && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
          const type = match[1].toLowerCase();
          const threshold = match[2];
          if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
          overUnderPairs[threshold][type] = outcome;
        }
      });
      
      Object.keys(overUnderPairs).forEach(threshold => {
        const pair = overUnderPairs[threshold];
        if (pair.over && pair.under) {
          let eventQuestion;
          if (parseFloat(threshold) === 2.5) {
            eventQuestion = `Will the match go to 3 sets?`;
          } else {
            eventQuestion = `Will the match have over ${threshold} sets?`;
          }
          addEventToGroup('match_level', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), 
            threshold, 
            type: 'number_of_sets' 
          });
        }
      });
      if (eventAddedToGroup) return;
    }

    // Tennis Set-Specific Markets (Winner. Set 1, Total. Set 1, etc.)
    if (titleLower.includes("set 1") || titleLower.includes("set 2") || titleLower.includes("set 3")) {
      const setNumber = title.match(/Set (\d+)/i)?.[1];
      
      if (titleLower.includes("winner") && setNumber && outcomes.length >= 2) {
        const player1 = outcomes[0];
        const player2 = outcomes[1];
        
        if (player1.coefficient && player2.coefficient && player1.name && player2.name) {
          const eventQuestion = `Will ${player1.name} win Set ${setNumber}?`;
          addEventToGroup('player_props', { 
            event: eventQuestion, 
            options: normalizeOdds(parseFloat(player1.coefficient), parseFloat(player2.coefficient)), 
            player1: player1.name, player2: player2.name, set_number: setNumber, 
            type: 'set_winner' 
          });
        }
      } else if (titleLower === `total. set ${setNumber}` && setNumber) {
        // This is for total games in the set (both players combined)
        const overUnderPairs = {};
        outcomes.forEach(outcome => {
          const match = outcome.name.match(/(Over|Under)\s*(\d+\.?\d*)/i);
          if (match && outcome.coefficient && parseFloat(outcome.coefficient) > 0) {
            const type = match[1].toLowerCase();
            const threshold = match[2];
            if (!overUnderPairs[threshold]) overUnderPairs[threshold] = {};
            overUnderPairs[threshold][type] = outcome;
          }
        });
        
        Object.keys(overUnderPairs).forEach(threshold => {
          const pair = overUnderPairs[threshold];
          if (pair.over && pair.under) {
            const eventQuestion = `Will Set ${setNumber} have over ${threshold} total games played?`;
            addEventToGroup('other_events', { 
              event: eventQuestion, 
              options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient)), 
              set_number: setNumber, threshold, 
              type: 'set_total_games_played' 
            });
          }
        });
      }
      if (eventAddedToGroup) return;
    }

    // =================================
    // END TENNIS-SPECIFIC HANDLERS
    // =================================

    // Fallback for generic Yes/No questions - IMPROVED
    if (!eventAddedToGroup && outcomes.some(o => o.name.toLowerCase() === "yes") && outcomes.some(o => o.name.toLowerCase() === "no")) {
        const yesOutcome = outcomes.find(o => o.name.toLowerCase() === "yes");
        const noOutcome = outcomes.find(o => o.name.toLowerCase() === "no");
        
        if (yesOutcome && noOutcome && yesOutcome.coefficient && parseFloat(yesOutcome.coefficient) > 0 && noOutcome.coefficient && parseFloat(noOutcome.coefficient) > 0) {
            let question = null;
            
            // Skip problematic titles completely
            const skipTitles = [
                'toss result and total runs 0.5 on the first delivery',
                'total runs',
                'total wickets', 
                'total ducks',
                'first boundary will be',
                'first ball of match',
                'second ball of match',
                'third ball of match'
            ];
            
            if (skipTitles.some(skip => titleLower.includes(skip))) {
                return; // Skip this market entirely
            }
            
            // Create more specific questions based on context
            if (titleLower.includes('boundary four')) {
                const team = extractTeamName(title);
                const over = title.match(/Over #(\d+)/)?.[1];
                if (team && over) {
                    question = `Will ${team} hit a boundary four in Over #${over}?`;
                }
            } else if (titleLower.includes('six')) {
                const team = extractTeamName(title);
                const over = title.match(/Over #(\d+)/)?.[1];
                if (team && over) {
                    question = `Will ${team} hit a six in Over #${over}?`;
                }
            } else if (titleLower.includes('wicket') && titleLower.includes('over #')) {
                const team = extractTeamName(title);
                const over = title.match(/Over #(\d+)/)?.[1];
                if (team && over) {
                    question = `Will ${team} lose a wicket in Over #${over}?`;
                }
            } else if (titleLower === 'tied match') {
                question = 'Will the match end in a tie?';
            } else if (titleLower.includes('to score 50 runs')) {
                question = 'Will any player score 50+ runs?';
            } else if (titleLower.includes('to score 100 runs')) {
                question = 'Will any player score 100+ runs?';
            }
            
            // Validate the question before adding
            question = validateAndCleanQuestion(question, title);
            if (!question) return; // Skip if validation fails
            
            // Categorize the question properly
            let group = 'other_events';
            let eventDetails = { type: 'generic_yes_no' };
            
            if (titleLower.includes('player') || (extractTeamName(title.split('.')[0]) && title.split('.')[0].split(' ').length <= 2)) {
                 const potentialPlayerName = extractTeamName(title.split('.')[0]) || title.split('.')[0].trim();
                if (potentialPlayerName !== "A team" && potentialPlayerName) {
                    group = 'player_props';
                    eventDetails.player_name = potentialPlayerName;
                 }
            } else if (titleLower.includes('over #')) {
                group = 'over_specific';
                const inningsMatchFallback = title.match(/Innings #(\d+)/i);
                const overMatchFallback = title.match(/Over #(\d+)/i);
                if (inningsMatchFallback) eventDetails.innings = inningsMatchFallback[1];
                if (overMatchFallback) eventDetails.over = overMatchFallback[1];
            } else if (titleLower.includes('dismissal') || titleLower.includes('wicket')) {
                group = 'dismissal_events';
            } else if (titleLower.includes('match') || titleLower.includes('game')) {
                group = 'match_level';
            }
            
            addEventToGroup(group, { ...eventDetails, event: question, options: normalizeOdds(parseFloat(yesOutcome.coefficient), parseFloat(noOutcome.coefficient)) });
        }
    }
    
    // IMPROVED final fallback - only for very specific cases
    if (!eventAddedToGroup && outcomes.length > 0 && outcomes[0].coefficient && parseFloat(outcomes[0].coefficient) > 0) {
        // Skip problematic market types entirely
        const skipMarkets = [
            'toss result and',
            'total runs.',
            'total wickets',
            'total ducks', 
            'first boundary will be',
            'dismissal #1 method (7-way betting)',
            'dismissal #1 method (6-way betting)',
            'dismissal #1 method (2-way betting)'
        ];
        
        if (skipMarkets.some(skip => titleLower.includes(skip))) {
            return; // Skip these markets completely
        }
        
        let eventQuestion = "";
        let options = normalizeOdds(parseFloat(outcomes[0].coefficient), 1.0);
        
        if (outcomes.length > 1 && outcomes[1].coefficient && parseFloat(outcomes[1].coefficient) > 0) {
             options = normalizeOdds(parseFloat(outcomes[0].coefficient), parseFloat(outcomes[1].coefficient));
        }

        // Only create questions for very clear cases
        if (outcomes.length >= 2) {
            const outcome1 = outcomes[0].name;
            const outcome2 = outcomes[1].name;
            
            // Handle specific clear patterns only
            if (titleLower === "winner" && outcome1 && outcome2) {
                const team1Name = extractTeamName(outcome1) || outcome1;
                const team2Name = extractTeamName(outcome2) || outcome2;
                if (team1Name && team2Name && team1Name !== team2Name) {
                    eventQuestion = `Will ${team1Name} win the match against ${team2Name}?`;
                }
            } else if (titleLower.includes("toss winner") && outcome1) {
                const teamName = extractTeamName(outcome1) || outcome1;
                if (teamName && teamName !== "A team") {
                    eventQuestion = `Will ${teamName} win the toss?`;
                }
            }
        }

        // Validate the final question
        eventQuestion = validateAndCleanQuestion(eventQuestion, title);
        
        if (eventQuestion) {
        addEventToGroup('other_events', { event: eventQuestion, options: options, type: 'unclassified' });
        }
    }

  });

  let totalEventsCount = 0;
  for (const group in groupedEvents) {
    totalEventsCount += groupedEvents[group].length;
  }

  const eventDataForFile = {
    match_details: {
        match_name: summaryData.match,
        source: summaryData.source,
        event_id: summaryData.event_id,
        timestamp: new Date().toISOString(),
        scorecard: scorecardData
    },
    grouped_events: groupedEvents,
    statistics: {
        total_event_groups: Object.keys(groupedEvents).length,
        total_events_generated: totalEventsCount
    }
  };

  // The original `eventsFromPage` is no longer directly used for the file structure,
  // but dbUtils.upsertEvent and markOldEventsAsNotLive expect a flat list of events.
  // We need to create a flat list for DB operations while maintaining the grouped structure for the file.
  const flatEventsForDB = [];
  Object.entries(groupedEvents).forEach(([groupName, groupArray]) => {
      groupArray.forEach(eventObj => {
          // dbUtils.upsertEvent now expects: event, options, group_name, original_market_title, details object
          const {
              event,
              options,
              original_market_title,
              // Capture all other properties into a 'details' object
              ...details 
          } = eventObj;

          // Remove group_name from details if it was inadvertently captured by ...rest
          // (though it shouldn't be as it's not part of eventObj structure from addEventToGroup)
          // However, original_market_title is part of eventObj, so it will be in 'details' if not explicitly destructured above.
          // Let's be explicit about what goes into details, excluding known top-level fields for DB interaction.
          const eventDetailsForDB = {};
          for (const key in eventObj) {
              if (key !== 'event' && key !== 'options' && key !== 'original_market_title') {
                  eventDetailsForDB[key] = eventObj[key];
              }
          }

          flatEventsForDB.push({
              event: event, 
              options: options, 
              group_name: groupName, 
              original_market_title: original_market_title,
              details: eventDetailsForDB // Pass the collected details
          });
      });
  });

  fs.writeFileSync(outputFiles.bettingEvents, JSON.stringify(eventDataForFile, null, 2));
  console.log(`   ✓ Converted and grouped ${totalEventsCount} unique betting events.`);

  // --- Database Operations ---
  console.log('   💾 Syncing events with MongoDB...');
  // Use the new flatEventsForDB for database operations and pass match details for team-based collection naming
  const matchDetails = eventDataForFile.match_details;
  
  for (const currentEvent of flatEventsForDB) {
      await dbUtils.upsertEvent(currentEvent, config.url, matchDetails);
  }
  await dbUtils.markOldEventsAsNotLive(flatEventsForDB, config.url, matchDetails);
  console.log(`   ✓ MongoDB sync complete.`);
  // --- End Database Operations ---
  
  return eventDataForFile; // Return the new grouped structure
}

// Main execution
async function main() {
  try {
    await dbUtils.connectDB(); // Connect to DB at the start

    // Step 1: Extract data
    const extractedData = await extractData();
    
    // Step 2: Parse HTML
    const parsedData = parseHtmlData(extractedData);
    
    // Step 3: Format and display
    const summaryData = formatAndDisplayData(parsedData);
    
    // Step 4: Convert to events (which now also handles DB operations)
    const eventData = await convertToBettingEvents(summaryData);
    
    // Final summary
    console.log('\n✅ Process completed successfully!');
    console.log('\n📁 Output files created:');
    Object.entries(outputFiles).forEach(([key, path]) => {
      console.log(`   - ${key}: ${path}`);
    });
    
    console.log('\n📋 Summary:');
    console.log(`   - Markets processed: ${summaryData.total_markets}`);
    console.log(`   - Total outcomes: ${summaryData.total_outcomes}`);
    // Adjust to use the new statistics structure
    console.log(`   - Events generated: ${eventData.statistics.total_events_generated}`);
    
    // Display sample events from grouped structure
    let sampleCount = 0;
    if (eventData.statistics.total_events_generated > 0) {
      console.log('\n🎲 Sample events (from groups):');
      for (const groupName in eventData.grouped_events) {
        if (sampleCount >= 3) break;
        const groupEvents = eventData.grouped_events[groupName];
        for (const event of groupEvents) {
          if (sampleCount >= 3) break;
          console.log(`   [${groupName}] ${event.event}`);
          console.log(`      Yes: ${event.options["Yes"]} | No: ${event.options["No"]}`);
          sampleCount++;
        }
      }
      if (eventData.statistics.total_events_generated > sampleCount) {
        console.log(`   ... and ${eventData.statistics.total_events_generated - sampleCount} more events in various groups`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error in main process:', error.message);
    // Ensure error is logged, and then rethrow or handle as appropriate
    // Depending on desired behavior, process.exit(1) might be here or after finally block
    throw error; // Re-throw to be caught by outer layer or process exit handler
  } finally {
    await dbUtils.closeDB(); // Ensure DB connection is closed
    // process.exitCode = 0; // Indicate successful completion if no error was thrown before finally
  }
}

// Run the unified process
main().catch(error => {
  // Catch any unhandled promise rejections from main (especially from the finally block)
  // console.error('\n❌ Unhandled error during main execution or cleanup:', error.message);
  process.exit(1); // Exit with error code if main fails
}); 