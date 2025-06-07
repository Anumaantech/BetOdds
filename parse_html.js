const fs = require('fs');
const { JSDOM } = require('jsdom');

// Configuration
const inputFile = process.argv[2] || 'complete_data.json';
const outputFile = process.argv[3] || 'parsed_data.json';

console.log(`Parsing HTML data from ${inputFile}...`);

// Load the extracted data
const rawData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const rawHtml = rawData.raw_html;

if (!rawHtml) {
  console.error('No raw HTML found in the input file');
  process.exit(1);
}

// Parse the HTML using JSDOM
const dom = new JSDOM(rawHtml);
const document = dom.window.document;

// Helper function to get all attributes of an element
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

// Helper function to extract text content
function getTextContent(element, selector) {
  const el = element.querySelector(selector);
  return el ? el.textContent.trim() : null;
}

// Helper function to check if element has a number that looks like odds
function hasOddsLikeContent(element) {
  const text = element.textContent.trim();
  return /^\d+\.\d+$/.test(text);
}

// Extract all markets
const marketItems = document.querySelectorAll('[data-id="market-item"]');
console.log(`Found ${marketItems.length} market items`);

const markets = [];

marketItems.forEach((marketItem, index) => {
  try {
    // Extract market title
    const titleElement = marketItem.querySelector('[data-id="modulor-typography"].body-semibold');
    const title = titleElement ? titleElement.textContent.trim() : `Unknown Market ${index}`;
    
    console.log(`Processing market: ${title}`);
    
    // Extract all outcomes
    const outcomes = [];
    
    // Get the HTML content as a string for direct searching
    const marketHtml = marketItem.outerHTML;
    
    // Look for common patterns in the HTML that indicate betting options and odds
    // First, look for button elements with odds
    const outcomeElements = marketItem.querySelectorAll('[role="button"], [tabindex="0"]');
    
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
        const coefficient = getTextContent(outcome, '.body-rounded-medium');
        let name = getTextContent(outcome, '.caption-2-medium-caps, .caption-2-medium');
        
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
                
                // Extract outcome type
                if (anchorData.outcomeType) {
                  // Map outcome types to names
                  const outcomeTypeMap = {
                    6: 'Even',
                    7: 'Odd',
                    14: 'Yes',
                    15: 'No',
                    25: 'run(-s)',
                    37: 'Over',
                    38: 'Under',
                    330: 'Caught',
                    331: 'Not caught',
                    332: 'Bowled',
                    333: 'LBW',
                    334: 'Run out',
                    335: 'Stumped',
                    336: 'Other'
                  };
                  
                  const baseName = outcomeTypeMap[anchorData.outcomeType] || null;
                  
                  if (baseName) {
                    // For runs, add the count
                    if (baseName === 'run(-s)' && anchorData.outcomeValues && anchorData.outcomeValues.length > 0) {
                      name = `${anchorData.outcomeValues[0]} ${baseName}`;
                    } 
                    // For Over/Under, add threshold
                    else if ((baseName === 'Over' || baseName === 'Under') && anchorData.values) {
                      // Try to find the threshold value
                      const threshold = anchorData.values.find(v => v.includes('.'));
                      if (threshold) {
                        name = `${baseName} ${threshold}`;
                      } else {
                        name = baseName;
                      }
                    } else {
                      name = baseName;
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`Error parsing data-anchor for outcome in ${title}:`, err.message);
            }
          }

          // If still no name found, try to infer from context or use default names
          if (!name) {
            // For markets with likely 'Yes/No' outcomes
            if (title.includes('catch out') || title.includes('score')) {
              const index = Array.from(outcomeElements).filter(el => 
                !el.closest('.EC_Fi') && 
                !el.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')
              ).indexOf(outcome);
              name = index === 0 ? 'Yes' : 'No';
            }
            // For Over/Under markets
            else if (title.includes('total runs') || title.includes('Total')) {
              const index = Array.from(outcomeElements).filter(el => 
                !el.closest('.EC_Fi') && 
                !el.querySelector('[data-testid="modulor-icon-info_circle_outlined"]')
              ).indexOf(outcome);
              name = index === 0 ? 'Over' : 'Under';
            }
            // Default case
            else {
              name = 'Option ' + (outcomes.length + 1);
            }
          }
          
          // Add outcome to the list
          outcomes.push({
            name: name || 'Unnamed',
            coefficient: coefficient,
            attributes: attributes,
            html: outcome.outerHTML.substring(0, 500) // Limit size
          });
        }
      } catch (err) {
        console.error(`Error processing outcome in ${title}:`, err.message);
      }
    });

    // If we still have no outcomes, try a more direct HTML parsing approach
    if (outcomes.length === 0) {
      console.log(`No outcomes found with primary selectors for ${title}, trying direct HTML parsing...`);
      
      // SPECIAL HANDLING FOR WINNER MARKET
      if (title === "Winner") {
        console.log("Applying special handling for Winner market...");
        
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
        
        console.log(`Extracted ${outcomes.length} outcomes for Winner market: ${outcomes.map(o => o.name).join(', ')}`);
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
              const teams = ["Gujarat Titans", "Lucknow Super Giants", "Draw"];
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
    console.error(`Error processing market ${index}:`, err.message);
  }
});

// Extract all tabs
const tabs = [];
const tabElements = document.querySelectorAll('[data-testid="marketTabs-button"]');
tabElements.forEach(tab => {
  const tabName = tab.querySelector('[data-testid="marketTabs-typography"]');
  if (tabName) {
    tabs.push({
      name: tabName.textContent.trim(),
      isActive: tab.classList.contains('modulor_tabs__active__1_77_0'),
      attributes: getAllAttributes(tab)
    });
  }
});

// Create the final data structure
const parsedData = {
  source: rawData.source,
  page_title: rawData.page_title,
  event_id: rawData.event_id,
  match: rawData.match,
  timestamp: new Date().toISOString(),
  scorecard: rawData.scorecard || {},
  tabs: tabs,
  markets: markets,
  raw_html_length: rawHtml.length
};

// Save the parsed data
fs.writeFileSync(outputFile, JSON.stringify(parsedData, null, 2));

console.log(`Parsing complete!`);
console.log(`Extracted ${markets.length} markets with a total of ${markets.reduce((acc, market) => acc + market.outcomes.length, 0)} outcomes`);
console.log(`Results saved to ${outputFile}`); 