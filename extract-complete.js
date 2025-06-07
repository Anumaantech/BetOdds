require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  url: process.argv[2] || process.env.TARGET_URL,
  outputFile: process.argv[3] || 'complete_data.json',
  apiPort: process.env.API_PORT || 3005
};

// Ensure output directory exists
const outputDir = path.dirname(config.outputFile);
if (outputDir && outputDir !== '.' && !fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Starting extraction with complete DOM data...');
console.log(`URL: ${config.url}`);
console.log(`Output file: ${config.outputFile}`);

// Instead of using the complex API approach, use a simpler direct approach
const puppeteer = require('puppeteer');

async function extractData() {
  console.log('Initializing browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    console.log('Browser launched successfully');
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log(`Navigating to URL: ${config.url}`);
    await page.goto(config.url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded, checking for betting data...');
    
    // First, let's check what's actually on the page
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);
    
    // Check if the page loaded correctly
    const currentUrl = await page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    // Try multiple selectors for the betting container
    const possibleSelectors = [
      '[data-id="event-markets"]',
      '.event-markets',
      '[class*="event-markets"]',
      '[class*="markets"]',
      '.betting-markets',
      '.markets-container'
    ];
    
    let bettingContainer = null;
    let usedSelector = null;
    
    for (const selector of possibleSelectors) {
      try {
        console.log(`Trying selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 600000 });
        bettingContainer = await page.$(selector);
        if (bettingContainer) {
          usedSelector = selector;
          console.log(`Found betting container with selector: ${selector}`);
          break;
        }
      } catch (err) {
        console.log(`Selector ${selector} not found, trying next...`);
      }
    }
    
    if (!bettingContainer) {
      console.log('No betting container found with any selector. Checking page content...');
      
      // Get page content to debug
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log('Page content preview:', bodyText);
      
      // Check if this is an error page or redirect
      if (bodyText.toLowerCase().includes('error') || 
          bodyText.toLowerCase().includes('not found') ||
          bodyText.toLowerCase().includes('404')) {
        throw new Error('Page appears to be an error page. Please check if the URL is valid and the event is still active.');
      }
      
      // Try to find any markets-related content
      const hasMarkets = await page.evaluate(() => {
        return document.body.innerHTML.toLowerCase().includes('market') ||
               document.body.innerHTML.toLowerCase().includes('bet') ||
               document.body.innerHTML.toLowerCase().includes('odds');
      });
      
      if (!hasMarkets) {
        throw new Error('No betting markets found on this page. The event might be finished or the URL might be incorrect.');
      }
      
      // If we have markets but no container, use the body
      console.log('Using document body as fallback...');
      usedSelector = 'body';
    }
    
    // Wait for the betting container to be available
    console.log('Waiting for betting data to load...');
    await page.waitForSelector(usedSelector || '[data-id="event-markets"]', { timeout: 60000 });
    
    // Click "All" tab to show all markets if it's not already active
    await page.evaluate(() => {
      const allTab = Array.from(document.querySelectorAll('[data-testid="marketTabs-button"]'))
        .find(tab => tab.textContent.includes('All'));
      if (allTab && !allTab.classList.contains('modulor_tabs__active__1_77_0')) {
        console.log('Clicking All tab');
        allTab.click();
      } else {
        console.log('All tab is already active');
      }
    });
    
    // Wait for markets to update after tab selection
    console.log('Waiting for markets to update...');
    await page.waitForTimeout(3000);
    
    // Find and expand the Winner market specifically
    console.log('Looking for Winner market...');
    await page.evaluate(() => {
      return new Promise(resolve => {
        // Find the Winner market
        const marketHeaders = Array.from(document.querySelectorAll('.EC_Fi'));
        const winnerMarketHeader = marketHeaders.find(header => {
          const titleEl = header.querySelector('.body-semibold');
          return titleEl && titleEl.textContent.trim() === 'Winner';
        });
        
        if (winnerMarketHeader) {
          console.log('Found Winner market, expanding it...');
          winnerMarketHeader.click();
          resolve();
        } else {
          console.log('Winner market not found in the current view');
          
          // Try clicking the Match tab to find the Winner market
          const matchTab = Array.from(document.querySelectorAll('[data-testid="marketTabs-button"]'))
            .find(tab => tab.textContent.includes('Match'));
          
          if (matchTab) {
            console.log('Clicking Match tab to find Winner market');
            matchTab.click();
            
            // Wait for tab content to load
            setTimeout(() => {
              // Try finding the Winner market again
              const marketHeaders = Array.from(document.querySelectorAll('.EC_Fi'));
              const winnerMarketHeader = marketHeaders.find(header => {
                const titleEl = header.querySelector('.body-semibold');
                return titleEl && titleEl.textContent.trim() === 'Winner';
              });
              
              if (winnerMarketHeader) {
                console.log('Found Winner market after switching to Match tab');
                winnerMarketHeader.click();
              } else {
                console.log('Winner market not found even after switching to Match tab');
              }
              resolve();
            }, 60000);
          } else {
            resolve(); // No Match tab found, continue
          }
        }
      });
    });
    
    // Wait for Winner market to load if found
    await page.waitForTimeout(2000);
    
    // Expand all collapsed markets
    console.log('Expanding all collapsed markets...');
    await page.evaluate(() => {
      // Simple approach - just click all market headers
      const marketHeaders = Array.from(document.querySelectorAll('.EC_Fi'));
      console.log(`Found ${marketHeaders.length} market headers`);
      
      // First pass - just get all the market titles for logging
      const marketTitles = marketHeaders
        .map(header => {
          const titleEl = header.querySelector('.body-semibold');
          return titleEl ? titleEl.textContent.trim() : 'Untitled Market';
        });
      
      console.log('Markets to expand:', marketTitles.join(', '));
      
      // Now click each header to expand it
      marketHeaders.forEach((header, index) => {
        try {
          console.log(`Clicking market header ${index + 1}: ${marketTitles[index]}`);
          header.click();
        } catch (err) {
          console.error(`Error clicking market header ${index + 1}:`, err.message);
        }
      });
    });
    
    // Wait for all expanded markets to load
    console.log('Waiting for expanded markets to load...');
    await page.waitForTimeout(5000);
    
    // Extract the HTML content
    console.log('Extracting data...');
    const data = await page.evaluate((containerSelector) => {
      // Get the main container using the selector that was found to work
      const mainContainer = document.querySelector(containerSelector) || 
                           document.querySelector('[data-id="event-markets"]') ||
                           document.querySelector('body');
      
      if (!mainContainer) {
        return {
          error: "No suitable container found for extraction"
        };
      }
      
      console.log(`Using container with selector: ${containerSelector}`);
      
      // Extract scorecard data
      const scorecardData = {};
      
      // First try to find the comprehensive scorecard with the new structure
      // Try multiple possible selectors for the comprehensive scorecard
      let scorecardElement = document.querySelector('.selector-content .score') ||
                            document.querySelector('.score') ||
                            document.querySelector('[class*="score"]') ||
                            document.querySelector('.live-scorecard') ||
                            document.querySelector('.scorecard') ||
                            document.querySelector('div[data-id="prematch-time-status"]');
      
      // Log what we found
      if (scorecardElement) {
        console.log('Found scorecard element with selector:', scorecardElement.className || scorecardElement.tagName);
        
        // Check if this has the comprehensive structure
        const hasTeams = scorecardElement.querySelectorAll('.team').length > 0;
        const hasBattingTable = scorecardElement.querySelectorAll('.live-batting-table-row').length > 0;
        const hasBowlingTable = scorecardElement.querySelectorAll('.live-bowling-table-row').length > 0;
        const hasRecentBalls = scorecardElement.querySelectorAll('.recent .over').length > 0;
        
        console.log('Scorecard structure check:', {
          hasTeams,
          hasBattingTable,
          hasBowlingTable,
          hasRecentBalls
        });
      }
      
      if (scorecardElement && scorecardElement.querySelectorAll('.team').length > 0) {
        console.log('Found comprehensive scorecard structure');
        
        // Get the raw HTML of the scorecard
        scorecardData.html = scorecardElement.outerHTML;
        
        // Extract team information from the new structure
        const teams = [];
        const teamElements = scorecardElement.querySelectorAll('.team');
        
        teamElements.forEach(teamElement => {
          const teamData = {};
          
          // Extract team name and short name
          const teamNameElement = teamElement.querySelector('.team-name');
          const teamShortNameElement = teamElement.querySelector('.team-short-name');
          
          if (teamNameElement) {
            teamData.name = teamNameElement.textContent.trim();
          }
          
          if (teamShortNameElement) {
            teamData.shortName = teamShortNameElement.textContent.trim();
          }
          
          // Extract team score and overs
          const teamScoreElement = teamElement.querySelector('.team-score');
          const teamOversElement = teamElement.querySelector('.team-overs');
          
          if (teamScoreElement) {
            teamData.score = teamScoreElement.textContent.trim();
            
            // Parse score (e.g., "255/6" or "0/0")
            const scoreMatch = teamData.score.match(/(\d+)\/(\d+)/);
            if (scoreMatch) {
              teamData.runs = parseInt(scoreMatch[1]);
              teamData.wickets = parseInt(scoreMatch[2]);
            }
          }
          
          if (teamOversElement) {
            teamData.overs = teamOversElement.textContent.trim();
            
            // Parse overs (e.g., "44.1 /50 Ovs" or "0.0 /50 Ovs")
            const oversMatch = teamData.overs.match(/([\d.]+)\s*\/(\d+)\s*Ovs/);
            if (oversMatch) {
              teamData.oversPlayed = parseFloat(oversMatch[1]);
              teamData.totalOvers = parseInt(oversMatch[2]);
            }
          }
          
          // Check if team is currently batting
          const battingIcon = teamElement.querySelector('.batting-icon');
          teamData.isBatting = !!battingIcon;
          
          if (teamData.name || teamData.shortName) {
            teams.push(teamData);
          }
        });
        
        scorecardData.teams = teams;
        
        // Extract scoreline
        const scorelineElement = scorecardElement.querySelector('.scoreline');
        if (scorelineElement) {
          scorecardData.scoreline = scorelineElement.textContent.trim();
        }
        
        // Extract win probability
        const winProbability = {};
        const percentageElements = scorecardElement.querySelectorAll('.percentage');
        
        percentageElements.forEach(percentageElement => {
          const children = Array.from(percentageElement.children);
          if (children.length >= 2) {
            const teamDiv = children[0];
            const percentDiv = children[1];
            
            if (teamDiv && percentDiv) {
              const teamName = teamDiv.textContent.trim();
              const percentage = percentDiv.textContent.trim();
              winProbability[teamName] = percentage;
            }
          }
        });
        
        if (Object.keys(winProbability).length > 0) {
          scorecardData.winProbability = winProbability;
        }
        
        // Extract recent ball results
        const recentBalls = {};
        const overElements = scorecardElement.querySelectorAll('.recent .over');
        
        overElements.forEach(overElement => {
          const labelElement = overElement.querySelector('.label');
          const ballElements = overElement.querySelectorAll('.result');
          
          if (labelElement) {
            const overLabel = labelElement.textContent.trim();
            const balls = [];
            
            ballElements.forEach(ballElement => {
              balls.push({
                result: ballElement.textContent.trim(),
                style: {
                  backgroundColor: ballElement.style.backgroundColor,
                  color: ballElement.style.color
                }
              });
            });
            
            recentBalls[overLabel] = balls;
          }
        });
        
        if (Object.keys(recentBalls).length > 0) {
          scorecardData.recentBalls = recentBalls;
        }
        
        // Extract current batters
        const currentBatters = [];
        const battingRows = scorecardElement.querySelectorAll('.live-batting-table-row');
        
        battingRows.forEach(row => {
          const cells = Array.from(row.children);
          if (cells.length >= 5) {
            currentBatters.push({
              name: cells[0].textContent.trim(),
              runs: parseInt(cells[1].textContent.trim()) || 0,
              balls: parseInt(cells[2].textContent.trim()) || 0,
              fours: parseInt(cells[3].textContent.trim()) || 0,
              sixes: parseInt(cells[4].textContent.trim()) || 0
            });
          }
        });
        
        if (currentBatters.length > 0) {
          scorecardData.currentBatters = currentBatters;
        }
        
        // Extract current bowlers
        const currentBowlers = [];
        const bowlingRows = scorecardElement.querySelectorAll('.live-bowling-table-row');
        
        bowlingRows.forEach(row => {
          const cells = Array.from(row.children);
          if (cells.length >= 4) {
            currentBowlers.push({
              name: cells[0].textContent.trim(),
              overs: cells[1].textContent.trim(),
              runs: parseInt(cells[2].textContent.trim()) || 0,
              wickets: parseInt(cells[3].textContent.trim()) || 0
            });
          }
        });
        
        if (currentBowlers.length > 0) {
          scorecardData.currentBowlers = currentBowlers;
        }
        
      } else if (scorecardElement) {
        // Fallback to legacy scorecard format
        console.log('Using legacy scorecard format');
        
        // Get the raw HTML of the scorecard
        scorecardData.html = scorecardElement.outerHTML;
        
        // Legacy extraction methods...
        const inningsElement = scorecardElement.querySelector('.caption-2-medium-caps.EC_GW');
        if (inningsElement) {
          scorecardData.innings = inningsElement.textContent.trim();
        }
        
        const scoreElement = scorecardElement.querySelector('.EC_Fm');
        if (scoreElement) {
          scorecardData.score = scoreElement.textContent.trim();
          
          // Parse the score text to extract team scores
          const scoreMatch = scoreElement.textContent.match(/(\d+)\/(\d+)\(([^)]+)\):(\d+)\/(\d+)/);
          if (scoreMatch) {
            scorecardData.parsed = {
              team1: {
                runs: scoreMatch[1],
                wickets: scoreMatch[2],
                overs: scoreMatch[3]
              },
              team2: {
                runs: scoreMatch[4],
                wickets: scoreMatch[5]
              }
            };
          }
        }
        
        // Extract any number displays (usually scores)
        const numberDisplays = [];
        const numberElements = scorecardElement.querySelectorAll('.EC_Gl');
        numberElements.forEach(el => {
          numberDisplays.push(el.textContent.trim());
        });
        
        if (numberDisplays.length > 0) {
          scorecardData.numbers = numberDisplays;
        }
      } else {
        console.log('No scorecard element found');
      }
      
      // Extract tabs
      const tabs = [];
      const tabElements = document.querySelectorAll('[data-testid="marketTabs-button"]');
      tabElements.forEach(tab => {
        const tabName = tab.querySelector('[data-testid="marketTabs-typography"]');
        if (tabName) {
          tabs.push({
            name: tabName.textContent.trim(),
            isActive: tab.classList.contains('modulor_tabs__active__1_77_0')
          });
        }
      });
      
      // Extract basic data about each market
      const marketItems = Array.from(document.querySelectorAll('[data-id="market-item"]'));
      console.log(`Found ${marketItems.length} market items`);
      
      const markets = marketItems.map((marketItem, index) => {
        const titleElement = marketItem.querySelector('[data-id="modulor-typography"].body-semibold');
        const title = titleElement ? titleElement.textContent.trim() : `Unknown Market ${index}`;
        
        return {
          title,
          html: marketItem.outerHTML
        };
      });
      
      return {
        source: "Parimatch Global",
        page_title: document.title,
        event_id: window.location.href.split('-').pop().split('?')[0],
        match: document.querySelector('.header-label')?.textContent.trim() || document.title,
        timestamp: new Date().toISOString(),
        scorecard: scorecardData,
        tabs: tabs,
        markets: markets,
        raw_html: mainContainer.outerHTML
      };
    }, usedSelector);
    
    console.log('Data extraction complete');
    console.log('Writing data to file...');
    fs.writeFileSync(config.outputFile, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${config.outputFile}`);
    
    await page.close();
    await browser.close();
    console.log('Browser closed');
    
    return 0;
  } catch (error) {
    console.error('Error during extraction:', error);
    try {
      await browser.close();
      console.log('Browser closed after error');
    } catch (closeError) {
      console.error('Error closing browser:', closeError);
    }
    return 1;
  }
}

// Run the extraction
extractData()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  }); 