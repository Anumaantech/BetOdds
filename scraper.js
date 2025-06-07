require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

async function extractBettingData() {
  console.log('Starting browser...');
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport to ensure all elements load
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log('Navigating to URL...');
    // Updated URL to use environment variable
    const targetUrl = process.env.TARGET_URL;
    console.log(`Target URL: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Page loaded, checking for betting data...');
    
    // Check page title and URL
    const pageTitle = await page.title();
    const currentUrl = await page.url();
    console.log(`Page title: ${pageTitle}`);
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
    
    let foundSelector = null;
    
    for (const selector of possibleSelectors) {
      try {
        console.log(`Trying selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 600000 });
        foundSelector = selector;
        console.log(`Found betting container with selector: ${selector}`);
        break;
      } catch (err) {
        console.log(`Selector ${selector} not found, trying next...`);
      }
    }
    
    if (!foundSelector) {
      console.log('No betting container found. Checking page content...');
      
      // Get page content to debug
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log('Page content preview:', bodyText);
      
      // Check if this is an error page
      if (bodyText.toLowerCase().includes('error') || 
          bodyText.toLowerCase().includes('not found') ||
          bodyText.toLowerCase().includes('404')) {
        throw new Error('Page appears to be an error page. Please check if the URL is valid and the event is still active.');
      }
      
      // Use fallback selector
      foundSelector = 'body';
      console.log('Using document body as fallback...');
    }
    
    // Wait for the betting container to be available
    console.log('Waiting for betting data to load...');
    await page.waitForSelector(foundSelector, { timeout: 60000 });
    
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
    
    // Extract the data
    console.log('Extracting betting data...');
    const bettingData = await page.evaluate((containerSelector) => {
      // Helper function to extract text content safely
      const getTextContent = (element, selector) => {
        const el = element.querySelector(selector);
        return el ? el.textContent.trim() : null;
      };
      
      // More robust text extraction that tries multiple selectors
      const getTextContentWithFallback = (element, selectors) => {
        for (const selector of selectors) {
          const content = getTextContent(element, selector);
          if (content) return content;
        }
        
        // If selectors fail, try getting any visible text content
        const textNodes = Array.from(element.querySelectorAll('*'))
          .filter(el => el.textContent.trim())
          .map(el => el.textContent.trim());
          
        return textNodes.length > 0 ? textNodes[0] : null;
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
      
      // Get main container using the selector that was found to work
      const mainContainer = document.querySelector(containerSelector) || 
                           document.querySelector('[data-id="event-markets"]') ||
                           document.querySelector('body');
      
      if (!mainContainer) {
        return {
          error: "No suitable container found for extraction",
          source: "Parimatch Global",
          page_title: pageTitle,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log(`Using container with selector: ${containerSelector}`);
      
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
      
      // Helper to check if a string contains any of the patterns
      const containsAny = (str, patterns) => {
        if (!str) return false;
        const lowerStr = str.toLowerCase();
        return patterns.some(pattern => lowerStr.includes(pattern.toLowerCase()));
      };
      
      // Extract all market items
      const markets = [];
      const marketItems = mainContainer.querySelectorAll('[data-id="market-item"]');
      
      marketItems.forEach((marketItem, index) => {
        try {
          // Extract market title
          const titleElement = marketItem.querySelector('[data-id="modulor-typography"].body-semibold');
          const title = titleElement ? titleElement.textContent.trim() : `Unknown Market ${index}`;
          
          console.log(`Processing market: ${title}`);
          
          // Check if this is an over/under market based on title
          const isOverUnderMarket = title.toLowerCase().includes('total runs') || title.match(/total|over|under/i);
          
          // Extract all bet outcomes within this market
          const outcomes = [];
          
          // FIRST PASS: Look for all possible outcome containers
          // Common outcome container patterns across Parimatch
          const outcomeContainerSelectors = [
            '[role="button"]', 
            '[tabindex="0"]',
            '.EC_Hc',        // Yes/No type outcomes
            '.EC_Gz',        // Over/Under outcomes
            '.EC_HV',        // Other outcome types
            '[data-id="coefficient-button"]', // Specific buttons
            '[data-event-type]',  // Any element with event type
            '.outcome-button',     // Generic outcome buttons
            '.EC_HO',        // Outcome names
            '.EC_HP'         // Coefficient values
          ];
          
          // Create a single selector for all possible outcome containers
          const combinedSelector = outcomeContainerSelectors.join(',');
          let outcomeElements = marketItem.querySelectorAll(combinedSelector);
          
          console.log(`Found ${outcomeElements.length} possible outcome elements in market "${title}"`);
          
          // Special handling for Even/Odd markets
          const isEvenOddMarket = title.toLowerCase().includes('even/odd');
          if (isEvenOddMarket) {
            console.log(`  Special handling for Even/Odd market: ${title}`);
            
            // For Even/Odd markets, look for special container patterns
            const evenOddContainers = marketItem.querySelectorAll('.EC_Gn, .EC_Go');
            
            if (evenOddContainers.length > 0) {
              console.log(`  Found ${evenOddContainers.length} Even/Odd containers`);
              
              evenOddContainers.forEach(container => {
                // Try to find Even and Odd labels
                const evenButton = container.querySelector('[data-anchor*="outcomeType\\\":181"]') || 
                                  container.querySelector('[data-anchor*="outcomeValues\\\":[\\\"2\\\"]"]');
                const oddButton = container.querySelector('[data-anchor*="outcomeType\\\":180"]') || 
                                 container.querySelector('[data-anchor*="outcomeValues\\\":[\\\"1\\\"]"]');
                
                if (evenButton) {
                  const coefficient = getTextContentWithFallback(evenButton, ['.body-rounded-medium', '[data-id="coefficient-value"]']);
                  outcomes.push({
                    name: "Even",
                    coefficient: coefficient,
                    attributes: getAllAttributes(evenButton)
                  });
                  console.log(`  Added Even outcome with coefficient: ${coefficient}`);
                }
                
                if (oddButton) {
                  const coefficient = getTextContentWithFallback(oddButton, ['.body-rounded-medium', '[data-id="coefficient-value"]']);
                  outcomes.push({
                    name: "Odd",
                    coefficient: coefficient,
                    attributes: getAllAttributes(oddButton)
                  });
                  console.log(`  Added Odd outcome with coefficient: ${coefficient}`);
                }
              });
            }
          }
          
          // Special handling for boundary markets (Four, Six)
          const isBoundaryMarket = containsAny(title, ['Boundary', 'Four', 'Six', 'Fours', 'Sixes']);
          if (isBoundaryMarket && outcomes.length === 0) {
            console.log(`  Special handling for Boundary market: ${title}`);
            
            // For boundary markets, look for Yes/No pattern
            const yesNoButtons = marketItem.querySelectorAll('.EC_HO');
            
            if (yesNoButtons.length >= 2) {
              // Usually first is Yes, second is No
              const yesButton = yesNoButtons[0];
              const noButton = yesNoButtons[1];
              
              if (yesButton) {
                const coefficient = getTextContentWithFallback(yesButton.parentElement, ['.body-rounded-medium']);
                outcomes.push({
                  name: "Yes",
                  coefficient: coefficient,
                  attributes: getAllAttributes(yesButton)
                });
                console.log(`  Added Yes outcome with coefficient: ${coefficient}`);
              }
              
              if (noButton) {
                const coefficient = getTextContentWithFallback(noButton.parentElement, ['.body-rounded-medium']);
                outcomes.push({
                  name: "No",
                  coefficient: coefficient,
                  attributes: getAllAttributes(noButton)
                });
                console.log(`  Added No outcome with coefficient: ${coefficient}`);
              }
            }
          }
          
          // Special handling for player markets
          const isPlayerMarket = containsAny(title, ['Individual', 'To score', 'Player', 'Batter', 'Bowler']);
          if (isPlayerMarket && outcomes.length === 0) {
            console.log(`  Special handling for Player market: ${title}`);
            
            // Look for player names and their corresponding odds
            const playerContainers = marketItem.querySelectorAll('.EC_HV, .EC_Gn, .EC_Go');
            
            playerContainers.forEach(container => {
              const nameElement = container.querySelector('.caption-2-medium-caps, .caption-2-medium');
              const oddsElement = container.querySelector('.body-rounded-medium');
              
              if (nameElement && oddsElement) {
                outcomes.push({
                  name: nameElement.textContent.trim(),
                  coefficient: oddsElement.textContent.trim(),
                  attributes: getAllAttributes(container)
                });
                console.log(`  Added player outcome: ${nameElement.textContent.trim()} - ${oddsElement.textContent.trim()}`);
              }
            });
          }
          
          // Process standard outcome elements if we still have none
          if (outcomes.length === 0) {
            outcomeElements.forEach(outcome => {
              // Skip if this is the market title toggle or info buttons
              if (outcome.closest('.EC_Fi') || outcome.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')) {
                return;
              }
              
              try {
                // Extract coefficient value
                let coefficient = null;
                const coefficientElement = outcome.querySelector('.body-rounded-medium');
                if (coefficientElement) {
                  coefficient = coefficientElement.textContent.trim();
                }
                
                // Extract outcome name
                let name = null;
                const nameElement = outcome.querySelector('.caption-2-medium-caps, .caption-2-medium');
                if (nameElement) {
                  name = nameElement.textContent.trim();
                }
                
                // Check if we have a coefficient but no name
                if (coefficient && !name) {
                  // For team-based markets, try to determine name from context
                  const marketTitle = title.toLowerCase();
                  if (marketTitle.includes('england') && marketTitle.includes('zimbabwe')) {
                    // Check if this is the first or second outcome in a 2-outcome market
                    const allOutcomes = Array.from(marketItem.querySelectorAll(combinedSelector))
                      .filter(el => !el.closest('.EC_Fi') && !el.querySelector('[data-testid="modulor-icon-info_circle_outlined"]'));
                    
                    const index = allOutcomes.indexOf(outcome);
                    if (index === 0) name = 'England';
                    else if (index === 1) name = 'Zimbabwe';
                  }
                  
                  // Check for threshold-based bets (Over/Under)
                  if (!name) {
                    const thresholdElement = outcome.closest('.EC_Gz')?.querySelector('.EC_HZ');
                    if (thresholdElement) {
                      const threshold = thresholdElement.textContent.trim();
                      // Determine if this is Over or Under based on position
                      const allOutcomes = outcome.closest('.EC_Gz').querySelectorAll(combinedSelector);
                      const isFirst = Array.from(allOutcomes).indexOf(outcome) === 0;
                      name = isFirst ? `Over ${threshold}` : `Under ${threshold}`;
                    }
                  }
                  
                  // Try to extract from data-anchor attribute
                  if (!name) {
                    const dataAnchor = outcome.getAttribute('data-anchor');
                    if (dataAnchor) {
                      try {
                        const anchorMatch = dataAnchor.match(/outcome_(\{.*\})/);
                        if (anchorMatch && anchorMatch[1]) {
                          const anchorData = JSON.parse(anchorMatch[1]);
                          
                          // Check if we have outcomeType in the data
                          if (anchorData.outcomeType) {
                            // Determine if this is first or second element for positional context
                            const allOutcomes = Array.from(marketItem.querySelectorAll('[data-anchor*="outcomeType"]:' + anchorData.outcomeType));
                            const isFirst = allOutcomes.indexOf(outcome) === 0;
                            
                            // Get outcome name based on outcomeType
                            const baseOutcomeName = getOutcomeNameFromType(anchorData.outcomeType, dataAnchor, isFirst);
                            
                            if (baseOutcomeName) {
                              // For run-based outcomes, add the run count
                              if (baseOutcomeName === 'run(-s)' && anchorData.outcomeValues && anchorData.outcomeValues.length > 0) {
                                name = `${anchorData.outcomeValues[0]} ${baseOutcomeName}`;
                              } else if (baseOutcomeName === 'Over' || baseOutcomeName === 'Under') {
                                // For Over/Under outcomes, add the threshold
                                const threshold = extractThresholdFromAnchor(dataAnchor);
                                if (threshold) {
                                  name = `${baseOutcomeName} ${threshold}`;
                                } else {
                                  name = baseOutcomeName;
                                }
                              } else {
                                name = baseOutcomeName;
                              }
                            }
                          }
                        }
                      } catch (err) {
                        console.error('Error parsing data-anchor:', err);
                      }
                    }
                  }
                }
                
                // For Over/Under markets, ensure we have threshold
                if (name && (name.toLowerCase() === 'over' || name.toLowerCase() === 'under')) {
                  const thresholdElement = outcome.closest('.EC_Gz, .EC_HZ')?.querySelector('.EC_HZ');
                  if (thresholdElement) {
                    const threshold = thresholdElement.textContent.trim();
                    name = `${name} ${threshold}`;
                  } else {
                    // Try to get threshold from data-anchor if not found in the DOM
                    const dataAnchor = outcome.getAttribute('data-anchor');
                    const threshold = extractThresholdFromAnchor(dataAnchor);
                    if (threshold) {
                      name = `${name} ${threshold}`;
                    }
                  }
                }
                
                // Create outcome data object
                const outcomeData = {
                  // Extract all data attributes
                  attributes: getAllAttributes(outcome),
                  // Extract coefficient/odds value if available
                  coefficient: coefficient,
                  // Extract outcome name if available
                  name: name
                };
                
                // Only add outcomes with at least some data
                if ((outcomeData.coefficient || outcomeData.name) && 
                    !outcomes.some(o => o.name === outcomeData.name && o.coefficient === outcomeData.coefficient)) {
                  outcomes.push(outcomeData);
                  console.log(`  Added outcome: ${outcomeData.name || 'Unnamed'} - ${outcomeData.coefficient || 'No coefficient'}`);
                }
              } catch (err) {
                // Skip this outcome if there's an error
                console.error(`  Error processing outcome in ${title}:`, err);
              }
            });
          }
          
          // SECOND PASS: If still no outcomes, scan the entire market DOM for numerical patterns
          if (outcomes.length === 0) {
            console.log(`No outcomes found in first pass for "${title}", scanning for odds patterns`);
            
            // Scan for elements with text that looks like betting odds (e.g., 1.85, 2.00)
            const oddRegex = /^\d+\.\d+$/;
            const allElements = marketItem.querySelectorAll('*');
            
            // Track elements with odds-like text for further processing
            const elementsWithOdds = [];
            
            allElements.forEach(el => {
              const text = el.textContent.trim();
              if (oddRegex.test(text)) {
                elementsWithOdds.push({
                  element: el,
                  odds: text
                });
              }
            });
            
            console.log(`  Found ${elementsWithOdds.length} elements with numerical odds in "${title}"`);
            
            // Process each odds element to find associated name
            elementsWithOdds.forEach(({ element, odds }) => {
              let name = null;
              
              // Strategy 1: Check parent's siblings for name
              const parent = element.parentElement;
              if (parent) {
                const siblings = Array.from(parent.parentElement?.children || [])
                  .filter(el => el !== parent && el.textContent.trim() && !oddRegex.test(el.textContent.trim()));
                
                if (siblings.length > 0) {
                  name = siblings[0].textContent.trim();
                }
              }
              
              // Strategy 2: Check for nearby text elements that could be names
              if (!name) {
                // Find elements near this odds element that might be names
                const nearbyElements = Array.from(marketItem.querySelectorAll('*'))
                  .filter(el => {
                    if (el === element || oddRegex.test(el.textContent.trim())) return false;
                    
                    // Get bounding rectangles to check proximity
                    const elRect = el.getBoundingClientRect();
                    const oddsRect = element.getBoundingClientRect();
                    
                    // Check if elements are horizontally aligned and close
                    const isHorizontallyAligned = Math.abs(elRect.top - oddsRect.top) < 30;
                    const isClose = Math.abs(elRect.left - oddsRect.left) < 200;
                    
                    return isHorizontallyAligned && isClose && el.textContent.trim();
                  });
                
                if (nearbyElements.length > 0) {
                  name = nearbyElements[0].textContent.trim();
                }
              }
              
              // Strategy 3: If this market is named after a team, use team name
              if (!name) {
                if (title.includes('England')) name = 'England';
                else if (title.includes('Zimbabwe')) name = 'Zimbabwe';
              }
              
              // Strategy 4: For Even/Odd markets
              if (!name && isEvenOddMarket) {
                // Look at the position of the element
                const allOddElements = elementsWithOdds.map(e => e.element);
                const index = allOddElements.indexOf(element);
                name = (index % 2 === 0) ? 'Even' : 'Odd';
              }
              
              // Add the outcome with what we found
              if (!outcomes.some(o => o.name === (name || 'Unknown') && o.coefficient === odds)) {
                outcomes.push({
                  name: name || 'Unknown',
                  coefficient: odds,
                  attributes: getAllAttributes(element)
                });
                
                console.log(`  Added outcome from numerical scan: ${name || 'Unknown'} - ${odds}`);
              }
            });
          }
          
          // THIRD PASS: If market has title mentioning number of outcomes but none found
          // Extract the claimed number of outcomes from the title
          const outcomeCountMatch = title.match(/\((\d+)\s+outcomes?\)/i);
          if (outcomeCountMatch && outcomes.length === 0) {
            const claimedOutcomeCount = parseInt(outcomeCountMatch[1]);
            console.log(`  Market "${title}" claims to have ${claimedOutcomeCount} outcomes but none were found`);
            
            // Create placeholder outcomes based on the claimed count
            for (let i = 0; i < claimedOutcomeCount; i++) {
              // For even/odd markets, use those names
              let name = `Outcome ${i+1}`;
              
              if (isEvenOddMarket && claimedOutcomeCount === 2) {
                name = i === 0 ? 'Even' : 'Odd';
              }
              
              outcomes.push({
                name: name,
                coefficient: null,
                attributes: {
                  note: 'Placeholder: This outcome was not properly extracted'
                }
              });
              console.log(`  Added placeholder outcome ${i+1} of ${claimedOutcomeCount}: ${name}`);
            }
          }
          
          // FOURTH PASS: Special case handling for markets that still have no outcomes
          if (outcomes.length === 0) {
            // Check if this is a known market type that should have standard outcomes
            if (isBoundaryMarket) {
              // For boundary markets, add standard Yes/No outcomes
              outcomes.push(
                { name: "Yes", coefficient: null, attributes: { note: 'Placeholder boundary outcome' } },
                { name: "No", coefficient: null, attributes: { note: 'Placeholder boundary outcome' } }
              );
              console.log(`  Added placeholder Yes/No outcomes for boundary market: ${title}`);
            } 
            else if (title.includes("total runs of the first")) {
              // For "total runs of the first X overs" markets, add Over/Under placeholders
              outcomes.push(
                { name: "Over", coefficient: null, attributes: { note: 'Placeholder total runs outcome' } },
                { name: "Under", coefficient: null, attributes: { note: 'Placeholder total runs outcome' } }
              );
              console.log(`  Added placeholder Over/Under outcomes for total runs market: ${title}`);
            }
            else if (title.includes("Runs total of first") && title.includes("Even/Odd")) {
              // For "Runs total of first X over. Even/Odd" markets, add Even/Odd placeholders
              outcomes.push(
                { name: "Even", coefficient: null, attributes: { note: 'Placeholder Even/Odd outcome' } },
                { name: "Odd", coefficient: null, attributes: { note: 'Placeholder Even/Odd outcome' } }
              );
              console.log(`  Added placeholder Even/Odd outcomes for runs total market: ${title}`);
            }
            else if (title.includes("To score")) {
              // For "To score X runs" markets, add Yes/No placeholders
              outcomes.push(
                { name: "Yes", coefficient: null, attributes: { note: 'Placeholder to score outcome' } },
                { name: "No", coefficient: null, attributes: { note: 'Placeholder to score outcome' } }
              );
              console.log(`  Added placeholder Yes/No outcomes for 'To score' market: ${title}`);
            }
            else if (title.includes("Individual total")) {
              // For individual totals, add player name placeholders based on the current match
              outcomes.push(
                { name: "Ben Duckett", coefficient: null, attributes: { note: 'Placeholder player outcome' } },
                { name: "Zak Crawley", coefficient: null, attributes: { note: 'Placeholder player outcome' } }
              );
              console.log(`  Added placeholder player outcomes for individual market: ${title}`);
            }
          }
          
          // Extract raw HTML of the market for backup
          const marketHTML = marketItem.outerHTML;
          
          // Special handling for specific markets that need fixing
          if (title === "England total runs before dismissal #1. Innings #1" || 
              (isOverUnderMarket && outcomes.length === 2 && outcomes.every(o => !o.name))) {
            
            // Check if we have the threshold in the raw HTML
            const thresholdMatch = marketHTML.match(/body-rounded-medium EC_Hc">([0-9.]+)<\/span>/);
            const threshold = thresholdMatch ? thresholdMatch[1] : null;
            
            // Look for Over/Under labels in the HTML
            const hasOverUnderLabels = marketHTML.includes('>Over</span>') && marketHTML.includes('>Under</span>');
            
            if (hasOverUnderLabels && threshold && outcomes.length === 2) {
              // First outcome is typically Over, second is Under based on DOM structure
              outcomes[0].name = `Over ${threshold}`;
              outcomes[1].name = `Under ${threshold}`;
              console.log(`Fixed Over/Under market: "${title}" with threshold ${threshold}`);
            }
            // Alternatively, check the data-anchor for outcomeType 37/38
            else if (outcomes.length === 2) {
              outcomes.forEach((outcome, index) => {
                if (outcome.attributes && outcome.attributes["data-anchor"]) {
                  const dataAnchor = outcome.attributes["data-anchor"];
                  try {
                    const anchorMatch = dataAnchor.match(/outcome_(\{.*\})/);
                    if (anchorMatch && anchorMatch[1]) {
                      const anchorData = JSON.parse(anchorMatch[1]);
                      
                      // Check for outcomeType 37 (Over) or 38 (Under)
                      if (anchorData.outcomeType === 37) {
                        // Find threshold in values array
                        const threshold = extractThresholdFromAnchor(dataAnchor);
                        outcome.name = threshold ? `Over ${threshold}` : "Over";
                      } 
                      else if (anchorData.outcomeType === 38) {
                        const threshold = extractThresholdFromAnchor(dataAnchor);
                        outcome.name = threshold ? `Under ${threshold}` : "Under";
                      }
                    }
                  } catch (err) {
                    console.error('Error parsing data-anchor for Over/Under market:', err);
                  }
                }
              });
            }
          }
          
          // Only add markets with some data
          if (outcomes.length > 0 || title !== `Unknown Market ${index}`) {
            markets.push({
              title: title,
              outcomes: outcomes,
              raw_html: marketHTML.substring(0, 5000) // Limit HTML size
            });
            console.log(`Added market: ${title} with ${outcomes.length} outcomes`);
          } else {
            console.log(`Skipping market: ${title} (no outcomes found)`);
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
        raw_html: mainContainer.outerHTML.substring(0, 600000) // Limit HTML size
      };
    }, foundSelector);
    
    // Write the data to a file
    const data = JSON.stringify(bettingData, null, 2);
    fs.writeFileSync('betting_data.json', data);
    
    console.log('Data extraction complete. Results saved to betting_data.json');
    
  } catch (error) {
    console.error('Error during extraction:', error);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

// Helper function to extract outcome name based on outcomeType
function getOutcomeNameFromType(outcomeType, dataAnchor, isFirst) {
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

extractBettingData(); 