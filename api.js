const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3005;

// Enable CORS
app.use(cors());
app.use(express.json());

// Browser instance cache
let browser = null;

async function initBrowser() {
  if (!browser) {
    console.log('Initializing browser...');
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
}

async function closeBrowser() {
  if (browser) {
    console.log('Closing browser...');
    await browser.close();
    browser = null;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Helper function to extract outcome name based on outcomeType
function getOutcomeNameFromType(outcomeType) {
  // Standard mapping of outcomeType to outcome names
  const outcomeTypeMap = {
    6: 'Even',
    7: 'Odd',
    14: 'Yes',
    15: 'No',
    25: 'run(-s)', // Used with outcomeValues
    37: 'Over',
    38: 'Under',
    330: 'Caught',
    331: 'Not caught',
    332: 'Bowled',
    333: 'LBW',
    334: 'Run out',
    335: 'Stumped',
    336: 'Other',
    // Add more mappings as discovered
  };
  
  // Return the mapped name if available
  return outcomeTypeMap[outcomeType] || null;
}

// Function to extract threshold value from data-anchor
function extractThresholdFromAnchor(dataAnchor) {
  if (!dataAnchor) return null;
  
  try {
    // Try to parse the JSON inside the data-anchor attribute
    const anchorMatch = dataAnchor.match(/outcome_(\{.*\})/);
    if (anchorMatch && anchorMatch[1]) {
      const anchorData = JSON.parse(anchorMatch[1]);
      
      // The threshold is typically the second value in the values array for over/under markets
      if (anchorData.values && anchorData.values.length > 1) {
        // Check if the value looks like a threshold (contains a decimal point)
        const potentialThreshold = anchorData.values.find(v => v.includes('.'));
        if (potentialThreshold) {
          return potentialThreshold;
        }
      }
    }
  } catch (err) {
    console.error('Error extracting threshold from data-anchor:', err);
  }
  
  return null;
}

// API endpoint to extract betting data
app.post('/extract', async (req, res) => {
  const { url, complete, expandAll } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await initBrowser();
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for the betting container to be available
    console.log('Waiting for betting data to load...');
    await page.waitForSelector('[data-id="event-markets"]', { timeout: 60000 });
    
    // Click "All" tab to show all markets if it's not already active
    await page.evaluate(() => {
      const allTab = Array.from(document.querySelectorAll('[data-testid="marketTabs-button"]'))
        .find(tab => tab.textContent.includes('All'));
      if (allTab && !allTab.classList.contains('modulor_tabs__active__1_77_0')) {
        allTab.click();
      }
    });
    
    // Wait for markets to update after tab selection
    await page.waitForTimeout(2000);
    
    // Expand all collapsed markets if requested or for complete extraction
    if (expandAll || complete) {
      console.log('Expanding all collapsed markets...');
      try {
        // Use a more stable approach to expand markets
        await page.evaluate(() => {
          return new Promise((resolve) => {
            // Find all collapsed market toggle buttons
            const toggleButtons = Array.from(document.querySelectorAll('.EC_Fi'));
            console.log(`Found ${toggleButtons.length} toggle buttons`);
            
            // Function to click toggles one by one with delay
            const clickToggleWithDelay = (index) => {
              if (index >= toggleButtons.length) {
                resolve(); // All toggles processed
                return;
              }
              
              const button = toggleButtons[index];
              // Check if this is a market title (has the market title class)
              const marketTitle = button.querySelector('.body-semibold');
              
              // Only expand if it's a market title button
              if (marketTitle) {
                try {
                  const title = marketTitle.textContent.trim();
                  console.log(`Expanding market: ${title}`);
                  button.click();
                } catch (err) {
                  console.error('Error clicking button:', err);
                }
              }
              
              // Process next toggle after a delay
              setTimeout(() => clickToggleWithDelay(index + 1), 100);
            };
            
            // Start clicking toggles with delay
            clickToggleWithDelay(0);
          });
        });
        
        // Wait for expanded markets to load
        console.log('Waiting for expanded markets to load...');
        await page.waitForTimeout(5000);
      } catch (error) {
        console.error('Error expanding markets:', error.message);
        // Continue anyway to try to extract what we can
      }
    }
    
    let bettingData;
    
    // Extract data based on the requested mode
    if (complete) {
      console.log('Extracting complete DOM structure...');
      bettingData = await page.evaluate(() => {
        // Helper function to recursively extract DOM structure
        function extractElementData(element) {
          if (!element) return null;
          
          // Create basic element info
          const elementData = {
            tagName: element.tagName?.toLowerCase(),
            attributes: {},
            textContent: element.textContent?.trim() || '',
            children: []
          };
          
          // Extract all attributes
          if (element.attributes) {
            for (let i = 0; i < element.attributes.length; i++) {
              const attr = element.attributes[i];
              elementData.attributes[attr.name] = attr.value;
            }
          }
          
          // Extract direct text nodes
          let directText = '';
          for (let i = 0; i < element.childNodes.length; i++) {
            const node = element.childNodes[i];
            if (node.nodeType === 3) { // Text node
              const text = node.textContent.trim();
              if (text) {
                directText += text + ' ';
              }
            }
          }
          elementData.directText = directText.trim();
          
          // Extract all child elements recursively
          for (let i = 0; i < element.children.length; i++) {
            const childData = extractElementData(element.children[i]);
            if (childData) {
              elementData.children.push(childData);
            }
          }
          
          return elementData;
        }
        
        // Get the main container
        const mainContainer = document.querySelector('[data-id="event-markets"]');
        if (!mainContainer) {
          console.error('Main container not found');
          return {
            source: "Parimatch Global",
            page_title: document.title,
            event_id: window.location.href.split('-').pop().split('?')[0],
            match: document.querySelector('.header-label')?.textContent.trim() || document.title,
            timestamp: new Date().toISOString(),
            error: "Main container not found"
          };
        }
        
        // Get all tab elements for reference
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
        
        // Extract all market items directly
        const marketItems = Array.from(mainContainer.querySelectorAll('[data-id="market-item"]'));
        console.log(`Found ${marketItems.length} market items`);
        
        // Extract basic data about each market
        const markets = marketItems.map((marketItem, index) => {
          const titleElement = marketItem.querySelector('[data-id="modulor-typography"].body-semibold');
          const title = titleElement ? titleElement.textContent.trim() : `Unknown Market ${index}`;
          
          // Get actual outcome buttons, excluding the market title and info buttons
          const outcomeButtons = Array.from(
            marketItem.querySelectorAll('[role="button"], [tabindex="0"]')
          ).filter(btn => 
            !btn.classList.contains('EC_Fi') && 
            !btn.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')
          );
          
          return {
            title,
            outcomeCount: outcomeButtons.length,
            html: marketItem.outerHTML.substring(0, 60000) // Limit size
          };
        });
        
        // Extract complete DOM structure
        const completeStructure = extractElementData(mainContainer);
        
        // Extract raw HTML as well
        const rawHtml = mainContainer.outerHTML;
        
        // Extract additional metadata
        const pageTitle = document.title;
        const eventId = window.location.href.split('-').pop().split('?')[0];
        const teams = document.querySelector('.header-label')?.textContent.trim() || pageTitle;
        
        return {
          source: "Parimatch Global",
          page_title: pageTitle,
          event_id: eventId,
          match: teams,
          timestamp: new Date().toISOString(),
          tabs: tabs,
          market_count: markets.length,
          markets_summary: markets,
          complete_structure: completeStructure,
          raw_html: rawHtml
        };
      });
    } else {
      // Original extraction code for markets data
      console.log('Extracting betting data...');
      bettingData = await page.evaluate(() => {
        // Helper function to extract text content safely
        const getTextContent = (element, selector) => {
          const el = element.querySelector(selector);
          return el ? el.textContent.trim() : null;
        };
        
        // Helper function to extract all attributes from an element
        const getAllAttributes = (element) => {
          const attributes = {};
          if (element && element.attributes) {
            for (let i = 0; i < element.attributes.length; i++) {
              const attr = element.attributes[i];
              attributes[attr.name] = attr.value;
            }
          }
          return attributes;
        };

        // Get match info
        const pageTitle = document.title || 'Cricket Betting';
        
        // Extract event details from URL
        const eventId = window.location.href.split('-').pop().split('?')[0];
        const teams = document.querySelector('.header-label')?.textContent.trim() || pageTitle;
        
        // Get main container
        const mainContainer = document.querySelector('[data-id="event-markets"]');
        
        // Extract all available tabs
        const tabs = [];
        const tabElements = mainContainer.querySelectorAll('[data-testid="marketTabs-button"]');
        tabElements.forEach(tab => {
          const tabName = tab.querySelector('[data-testid="marketTabs-typography"]');
          if (tabName) {
            tabs.push({
              name: tabName.textContent.trim(),
              isActive: tab.classList.contains('modulor_tabs__active__1_77_0')
            });
          }
        });
        
        // Extract all market items
        const markets = [];
        const marketItems = mainContainer.querySelectorAll('[data-id="market-item"]');
        
        marketItems.forEach((marketItem, index) => {
          try {
            // Extract market title
            const titleElement = marketItem.querySelector('[data-id="modulor-typography"].body-semibold');
            const title = titleElement ? titleElement.textContent.trim() : `Unknown Market ${index}`;
            
            // Extract all bet outcomes within this market
            const outcomes = [];
            
            // FIRST PASS: Look for standard button elements (standard markets)
            // Find all clickable outcome elements (any element with role="button" or tabindex="0")
            const outcomeElements = marketItem.querySelectorAll('[role="button"], [tabindex="0"]');
            
            outcomeElements.forEach(outcome => {
              // Skip if this is the market title toggle or info buttons
              if (outcome.closest('.EC_Fi') || outcome.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')) {
                return;
              }
              
              try {
                const outcomeData = {
                  // Extract all data attributes
                  attributes: getAllAttributes(outcome),
                  // Extract coefficient/odds value if available
                  coefficient: getTextContent(outcome, '.body-rounded-medium'),
                  // Extract outcome name if available
                  name: getTextContent(outcome, '.caption-2-medium-caps')
                };
                
                // If we don't have a name but have another text element, use that
                if (!outcomeData.name) {
                  // Try to find any visible text in the outcome
                  const textNodes = Array.from(outcome.querySelectorAll('*'))
                    .filter(el => el.textContent.trim())
                    .map(el => el.textContent.trim());
                  
                  if (textNodes.length > 0) {
                    // If coefficient is one of the text nodes, filter it out for the name
                    outcomeData.name = textNodes
                      .filter(text => text !== outcomeData.coefficient)
                      .join(' ');
                  }
                }
                
                // Look for threshold value separately if we don't have a name yet
                if (!outcomeData.name) {
                  const thresholdElement = outcome.closest('.EC_Gz')?.querySelector('.EC_HZ');
                  if (thresholdElement) {
                    const threshold = thresholdElement.textContent.trim();
                    // Determine if this is Over or Under based on position
                    const allOutcomes = outcome.closest('.EC_Gz').querySelectorAll('[role="button"], [tabindex="0"]');
                    const isFirst = Array.from(allOutcomes).indexOf(outcome) === 0;
                    outcomeData.name = isFirst ? `Over ${threshold}` : `Under ${threshold}`;
                  }
                }
                
                // Try to extract from data-anchor attribute
                if (!outcomeData.name) {
                  const dataAnchor = outcome.getAttribute('data-anchor');
                  if (dataAnchor) {
                    try {
                      const anchorMatch = dataAnchor.match(/outcome_(\{.*\})/);
                      if (anchorMatch && anchorMatch[1]) {
                        const anchorData = JSON.parse(anchorMatch[1]);
                        
                        // Check if we have outcomeType in the data
                        if (anchorData.outcomeType) {
                          // Get outcome name based on outcomeType
                          const baseOutcomeName = getOutcomeNameFromType(anchorData.outcomeType);
                          
                          if (baseOutcomeName) {
                            // For run-based outcomes, add the run count
                            if (baseOutcomeName === 'run(-s)' && anchorData.outcomeValues && anchorData.outcomeValues.length > 0) {
                              outcomeData.name = `${anchorData.outcomeValues[0]} ${baseOutcomeName}`;
                            } else if (baseOutcomeName === 'Over' || baseOutcomeName === 'Under') {
                              // For Over/Under outcomes, add the threshold
                              const threshold = extractThresholdFromAnchor(dataAnchor);
                              if (threshold) {
                                outcomeData.name = `${baseOutcomeName} ${threshold}`;
                              } else {
                                outcomeData.name = baseOutcomeName;
                              }
                            } else {
                              outcomeData.name = baseOutcomeName;
                            }
                          }
                        }
                      }
                    } catch (err) {
                      console.error('Error parsing data-anchor:', err);
                    }
                  }
                }
                
                // Only add outcomes with at least some data
                if (outcomeData.coefficient || outcomeData.name) {
                  outcomes.push(outcomeData);
                }
              } catch (err) {
                console.error('Error processing outcome:', err);
              }
            });
            
            // SECOND PASS: Check for alternative outcome displays (player-specific markets, etc.)
            // If the market has 0 outcomes from the first pass but claims to have outcomes, try different selectors
            const claimedOutcomes = marketItem.querySelectorAll('.modulor-tabs__panel, .EC_Gc, .EC_HV');
            
            if (outcomes.length === 0 && claimedOutcomes.length > 0) {
              try {
                // Try finding Yes/No type outcomes (common in player markets)
                const yesNoElements = marketItem.querySelectorAll('.EC_Hc');
                
                if (yesNoElements.length > 0) {
                  yesNoElements.forEach(element => {
                    const nameElement = element.querySelector('.EC_HO');
                    const valueElement = element.querySelector('.body-rounded-medium');
                    
                    if (nameElement && valueElement) {
                      outcomes.push({
                        name: nameElement.textContent.trim(),
                        coefficient: valueElement.textContent.trim(),
                        attributes: getAllAttributes(element)
                      });
                    }
                  });
                }
                
                // Try alternative selectors for special markets
                if (outcomes.length === 0) {
                  // Look for any elements with odds (numbers that look like betting odds)
                  const possibleOddsElements = Array.from(marketItem.querySelectorAll('*')).filter(el => {
                    const text = el.textContent.trim();
                    // Match patterns like 1.35, 2.00, etc.
                    return /^\d+\.\d+$/.test(text);
                  });
                  
                  possibleOddsElements.forEach(oddElement => {
                    // Look for the closest element that could be a name
                    let nameElement = oddElement.parentElement;
                    while (nameElement && nameElement !== marketItem) {
                      const siblings = Array.from(nameElement.parentElement.children).filter(
                        el => el !== nameElement && el.textContent.trim() && !/^\d+\.\d+$/.test(el.textContent.trim())
                      );
                      
                      if (siblings.length > 0) {
                        outcomes.push({
                          name: siblings[0].textContent.trim(),
                          coefficient: oddElement.textContent.trim(),
                          attributes: {
                            class: oddElement.className,
                            parentClass: oddElement.parentElement.className
                          }
                        });
                        break;
                      }
                      
                      nameElement = nameElement.parentElement;
                    }
                  });
                }
              } catch (err) {
                console.error('Error in second pass outcome detection:', err);
              }
            }
            
            // Extract raw HTML of the market for backup
            const marketHTML = marketItem.outerHTML;
            
            // Check if this is an over/under market based on title
            const isOverUnderMarket = title.toLowerCase().includes('total runs') || title.match(/total|over|under/i);
            
            // Special handling for the specific market mentioned in the image
            if (title === "England total runs before dismissal #1. Innings #1" || 
                (isOverUnderMarket && outcomes.length === 2 && outcomes.every(o => !o.name))) {
              
              console.log(`Special handling for market: ${title}`);
              console.log(`isOverUnderMarket: ${isOverUnderMarket}, outcomes: ${outcomes.length}, all empty names: ${outcomes.every(o => !o.name)}`);
              
              // Check if we have the threshold in the raw HTML
              const thresholdMatch = marketHTML.match(/body-rounded-medium EC_Hc">([0-9.]+)<\/span>/);
              const threshold = thresholdMatch ? thresholdMatch[1] : null;
              console.log(`Threshold from HTML: ${threshold}`);
              
              // Look for Over/Under labels in the HTML
              const hasOverUnderLabels = marketHTML.includes('>Over</span>') && marketHTML.includes('>Under</span>');
              console.log(`Has Over/Under labels: ${hasOverUnderLabels}`);
              
              if (hasOverUnderLabels && threshold && outcomes.length === 2) {
                // First outcome is typically Over, second is Under based on DOM structure
                outcomes[0].name = `Over ${threshold}`;
                outcomes[1].name = `Under ${threshold}`;
                console.log(`Fixed Over/Under market: "${title}" with threshold ${threshold}`);
              }
              // Alternatively, check the data-anchor for outcomeType 37/38
              else if (outcomes.length === 2) {
                console.log(`Trying to extract from data-anchor attributes...`);
                outcomes.forEach((outcome, index) => {
                  if (outcome.attributes && outcome.attributes["data-anchor"]) {
                    const dataAnchor = outcome.attributes["data-anchor"];
                    console.log(`Outcome ${index+1} data-anchor: ${dataAnchor}`);
                    
                    try {
                      const anchorMatch = dataAnchor.match(/outcome_(\{.*\})/);
                      if (anchorMatch && anchorMatch[1]) {
                        const anchorData = JSON.parse(anchorMatch[1]);
                        console.log(`Parsed anchor data for outcome ${index+1}: ${JSON.stringify(anchorData)}`);
                        
                        // Check for outcomeType 37 (Over) or 38 (Under)
                        if (anchorData.outcomeType === 37) {
                          // Find threshold in values array
                          const threshold = extractThresholdFromAnchor(dataAnchor);
                          console.log(`Outcome ${index+1} is Over, threshold: ${threshold}`);
                          outcome.name = threshold ? `Over ${threshold}` : "Over";
                        } 
                        else if (anchorData.outcomeType === 38) {
                          const threshold = extractThresholdFromAnchor(dataAnchor);
                          console.log(`Outcome ${index+1} is Under, threshold: ${threshold}`);
                          outcome.name = threshold ? `Under ${threshold}` : "Under";
                        }
                      } else {
                        console.log(`No match for outcome_{ pattern in data-anchor`);
                      }
                    } catch (err) {
                      console.error(`Error parsing data-anchor for outcome ${index+1}:`, err);
                    }
                  } else {
                    console.log(`No data-anchor attribute for outcome ${index+1}`);
                  }
                });
              }
            }
            
            // Only add markets with some data
            if (outcomes.length > 0 || title !== `Unknown Market ${index}`) {
              markets.push({
                title: title,
                outcomes: outcomes,
                raw_html: marketHTML
              });
            }
          } catch (err) {
            console.error('Error processing market:', err);
          }
        });
        
        return {
          source: "Parimatch Global",
          page_title: pageTitle,
          event_id: eventId,
          match: teams,
          timestamp: new Date().toISOString(),
          tabs: tabs,
          markets: markets,
          raw_html: mainContainer.outerHTML
        };
      });
    }
    
    await page.close();
    
    res.json({ 
      success: true, 
      data: bettingData 
    });
    
  } catch (error) {
    console.error('Error during extraction:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to extract data' 
    });
  }
});

// API endpoint to extract data from multiple cricket matches
app.post('/extract-matches', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await initBrowser();
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for the matches list to be available
    console.log('Waiting for matches list to load...');
    await page.waitForSelector('.event-row', { timeout: 60000 });
    
    // Extract the matches list
    console.log('Extracting matches list...');
    const matchesData = await page.evaluate(() => {
      const matches = [];
      
      // Get all match rows
      const matchRows = document.querySelectorAll('.event-row');
      
      matchRows.forEach(row => {
        try {
          // Get match details
          const matchLink = row.querySelector('a');
          const matchUrl = matchLink ? matchLink.href : null;
          const matchId = matchUrl ? matchUrl.split('-').pop() : null;
          
          const teamsElement = row.querySelector('.event-name');
          const teams = teamsElement ? teamsElement.textContent.trim() : 'Unknown Match';
          
          const leagueElement = row.querySelector('.event-tournament');
          const league = leagueElement ? leagueElement.textContent.trim() : 'Unknown League';
          
          const dateElement = row.querySelector('.event-date');
          const matchDate = dateElement ? dateElement.textContent.trim() : '';
          
          // Get odds if available
          const odds = [];
          const oddElements = row.querySelectorAll('.selection-value');
          
          oddElements.forEach(odd => {
            const oddValue = odd.textContent.trim();
            if (oddValue) {
              odds.push(oddValue);
            }
          });
          
          if (matchUrl) {
            matches.push({
              id: matchId,
              url: matchUrl,
              teams: teams,
              league: league,
              date: matchDate,
              odds: odds
            });
          }
        } catch (err) {
          // Skip this match if there's an error
        }
      });
      
      return {
        source: "Parimatch Global",
        timestamp: new Date().toISOString(),
        matches: matches
      };
    });
    
    await page.close();
    
    res.json({ 
      success: true, 
      data: matchesData 
    });
    
  } catch (error) {
    console.error('Error during matches extraction:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to extract matches data' 
    });
  }
});

// Add a new API endpoint for complete DOM extraction
app.post('/extract-complete', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await initBrowser();
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for the betting container to be available
    console.log('Waiting for betting data to load...');
    await page.waitForSelector('[data-id="event-markets"]', { timeout: 60000 });
    
    // Click "All" tab to show all markets if it's not already active
    await page.evaluate(() => {
      const allTab = Array.from(document.querySelectorAll('[data-testid="marketTabs-button"]'))
        .find(tab => tab.textContent.includes('All'));
      if (allTab && !allTab.classList.contains('modulor_tabs__active__1_77_0')) {
        allTab.click();
      }
    });
    
    // Wait for markets to update after tab selection
    await page.waitForTimeout(2000);
    
    // Expand all collapsed markets
    await page.evaluate(() => {
      // Find all collapsed market toggle buttons
      const toggleButtons = Array.from(document.querySelectorAll('.EC_Fi'));
      toggleButtons.forEach(button => {
        const marketTitle = button.querySelector('.body-semibold');
        const isCollapsed = button.nextElementSibling && 
                          !button.nextElementSibling.querySelector('.EC_Gl');
        
        if (isCollapsed && marketTitle) {
          console.log(`Expanding market: ${marketTitle.textContent.trim()}`);
          button.click();
        }
      });
    });
    
    // Wait for expanded markets to load
    await page.waitForTimeout(2000);
    
    // Extract the complete DOM structure
    console.log('Extracting complete DOM structure...');
    const completeData = await page.evaluate(() => {
      // Helper function to recursively extract DOM structure
      function extractElementData(element) {
        if (!element) return null;
        
        // Create basic element info
        const elementData = {
          tagName: element.tagName?.toLowerCase(),
          attributes: {},
          textContent: element.textContent?.trim() || '',
          children: []
        };
        
        // Extract all attributes
        if (element.attributes) {
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            elementData.attributes[attr.name] = attr.value;
          }
        }
        
        // Extract direct text nodes
        let directText = '';
        for (let i = 0; i < element.childNodes.length; i++) {
          const node = element.childNodes[i];
          if (node.nodeType === 3) { // Text node
            const text = node.textContent.trim();
            if (text) {
              directText += text + ' ';
            }
          }
        }
        elementData.directText = directText.trim();
        
        // Extract all child elements recursively
        for (let i = 0; i < element.children.length; i++) {
          const childData = extractElementData(element.children[i]);
          if (childData) {
            elementData.children.push(childData);
          }
        }
        
        return elementData;
      }
      
      // Get the main container
      const mainContainer = document.querySelector('[data-id="event-markets"]');
      
      // Extract complete DOM structure
      const completeStructure = extractElementData(mainContainer);
      
      // Extract raw HTML as well
      const rawHtml = mainContainer.outerHTML;
      
      // Extract additional metadata
      const pageTitle = document.title;
      const eventId = window.location.href.split('-').pop().split('?')[0];
      const teams = document.querySelector('.header-label')?.textContent.trim() || pageTitle;
      
      return {
        source: "Parimatch Global",
        page_title: pageTitle,
        event_id: eventId,
        match: teams,
        timestamp: new Date().toISOString(),
        complete_structure: completeStructure,
        raw_html: rawHtml
      };
    });
    
    await page.close();
    
    res.json({ 
      success: true, 
      data: completeData 
    });
    
  } catch (error) {
    console.error('Error during complete extraction:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to extract complete data' 
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initBrowser();
  
  // Clean shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await closeBrowser();
    process.exit(0);
  });
});

// Error handling for unexpected browser crashes
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Reset browser on crash
  await closeBrowser();
  await initBrowser();
}); 