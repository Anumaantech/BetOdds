const fs = require('fs');

// Configuration
const inputFile = process.argv[2] || 'parsed_data.json';
const outputFile = process.argv[3] || 'formatted_output.txt';

// Load the parsed data
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// Create an array to store the formatted output
let output = [];

output.push('\n=== BETTING MARKETS SUMMARY ===');
output.push(`Source: ${data.source}`);
output.push(`Match: ${data.match}`);
output.push(`Event ID: ${data.event_id}`);
output.push(`Timestamp: ${data.timestamp}`);

console.log('\n=== BETTING MARKETS SUMMARY ===');
console.log(`Source: ${data.source}`);
console.log(`Match: ${data.match}`);
console.log(`Event ID: ${data.event_id}`);
console.log(`Timestamp: ${data.timestamp}`);

// Display scorecard data if available
if (data.scorecard && Object.keys(data.scorecard).length > 0) {
  output.push('\n=== SCORECARD DATA ===');
  console.log('\n=== SCORECARD DATA ===');
  
  // Display team information
  if (data.scorecard.teams && data.scorecard.teams.length > 0) {
    output.push('\n--- TEAM SCORES ---');
    console.log('\n--- TEAM SCORES ---');
    
    data.scorecard.teams.forEach(team => {
      const teamInfo = `${team.name || team.shortName || 'Unknown Team'}: ${team.score || 'N/A'}`;
      const oversInfo = team.overs ? ` (${team.overs})` : '';
      const battingStatus = team.isBatting ? ' *BATTING*' : '';
      const fullTeamInfo = teamInfo + oversInfo + battingStatus;
      
      output.push(`  ${fullTeamInfo}`);
      console.log(`  ${fullTeamInfo}`);
    });
  }
  
  // Display scoreline
  if (data.scorecard.scoreline) {
    output.push(`\nMatch Status: ${data.scorecard.scoreline}`);
    console.log(`\nMatch Status: ${data.scorecard.scoreline}`);
  }
  
  // Display win probability
  if (data.scorecard.winProbability) {
    output.push('\n--- WIN PROBABILITY ---');
    console.log('\n--- WIN PROBABILITY ---');
    
    Object.keys(data.scorecard.winProbability).forEach(team => {
      const probInfo = `${team}: ${data.scorecard.winProbability[team]}`;
      output.push(`  ${probInfo}`);
      console.log(`  ${probInfo}`);
    });
  }
  
  // Display current batters
  if (data.scorecard.currentBatters && data.scorecard.currentBatters.length > 0) {
    output.push('\n--- CURRENT BATTERS ---');
    console.log('\n--- CURRENT BATTERS ---');
    
    data.scorecard.currentBatters.forEach(batter => {
      const batterInfo = `${batter.name}: ${batter.runs}R (${batter.balls}B, ${batter.fours}×4, ${batter.sixes}×6)`;
      output.push(`  ${batterInfo}`);
      console.log(`  ${batterInfo}`);
    });
  }
  
  // Display current bowlers
  if (data.scorecard.currentBowlers && data.scorecard.currentBowlers.length > 0) {
    output.push('\n--- CURRENT BOWLERS ---');
    console.log('\n--- CURRENT BOWLERS ---');
    
    data.scorecard.currentBowlers.forEach(bowler => {
      const bowlerInfo = `${bowler.name}: ${bowler.overs} overs, ${bowler.runs}R, ${bowler.wickets}W`;
      output.push(`  ${bowlerInfo}`);
      console.log(`  ${bowlerInfo}`);
    });
  }
  
  // Display recent ball results (show last 3 overs)
  if (data.scorecard.recentBalls && Object.keys(data.scorecard.recentBalls).length > 0) {
    output.push('\n--- RECENT OVERS ---');
    console.log('\n--- RECENT OVERS ---');
    
    const recentOvers = Object.keys(data.scorecard.recentBalls).slice(0, 3);
    recentOvers.forEach(overLabel => {
      const balls = data.scorecard.recentBalls[overLabel];
      const ballResults = balls.map(ball => ball.result).join(' ');
      const overInfo = `${overLabel}: ${ballResults}`;
      output.push(`  ${overInfo}`);
      console.log(`  ${overInfo}`);
    });
  }
  
  // Legacy scorecard data (for backward compatibility)
  if (data.scorecard.innings) {
    output.push(`\nLegacy - Current innings: ${data.scorecard.innings}`);
    console.log(`\nLegacy - Current innings: ${data.scorecard.innings}`);
  }
  
  if (data.scorecard.score) {
    output.push(`Legacy - Score: ${data.scorecard.score}`);
    console.log(`Legacy - Score: ${data.scorecard.score}`);
  }
  
  if (data.scorecard.parsed) {
    const team1 = data.scorecard.parsed.team1;
    const team2 = data.scorecard.parsed.team2;
    output.push('\nLegacy - Team scores:');
    console.log('\nLegacy - Team scores:');
    
    // Extract team names from the match title
    const matchParts = data.match.split(' - ');
    const team1Name = matchParts[0] || 'Team 1';
    const team2Name = matchParts[1]?.split(' Betting')[0] || 'Team 2';
    
    output.push(`  ${team1Name}: ${team1.runs}/${team1.wickets} (${team1.overs} overs)`);
    output.push(`  ${team2Name}: ${team2.runs}/${team2.wickets}`);
    console.log(`  ${team1Name}: ${team1.runs}/${team1.wickets} (${team1.overs} overs)`);
    console.log(`  ${team2Name}: ${team2.runs}/${team2.wickets}`);
  }
  
  if (data.scorecard.numbers && data.scorecard.numbers.length > 0) {
    output.push('\nLegacy - Scorecard numbers:');
    console.log('\nLegacy - Scorecard numbers:');
    data.scorecard.numbers.forEach(number => {
      output.push(`  ${number}`);
      console.log(`  ${number}`);
    });
  }
  
  output.push('=========================');
  console.log('=========================');
}

output.push(`Available Tabs: ${data.tabs.map(tab => tab.name).join(', ')}`);
output.push(`Total Markets: ${data.markets.length}`);
output.push('===============================\n');

console.log(`Available Tabs: ${data.tabs.map(tab => tab.name).join(', ')}`);
console.log(`Total Markets: ${data.markets.length}`);
console.log('===============================\n');

// Display all markets
data.markets.forEach((market, index) => {
  const marketHeader = `${index + 1}. ${market.title} (${market.outcomes.length} outcomes)`;
  output.push(marketHeader);
  console.log(marketHeader);
  
  // Sort outcomes to group them better (e.g., Over/Under pairs)
  const sortedOutcomes = [...market.outcomes].sort((a, b) => {
    // First sort by name prefix (Over, Under, Yes, No, etc.)
    const aPrefix = a.name.split(' ')[0];
    const bPrefix = b.name.split(' ')[0];
    
    if (aPrefix !== bPrefix) {
      // Custom order for common prefixes
      const prefixOrder = ['Over', 'Under', 'Yes', 'No', 'Even', 'Odd'];
      const aIndex = prefixOrder.indexOf(aPrefix);
      const bIndex = prefixOrder.indexOf(bPrefix);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      return aPrefix.localeCompare(bPrefix);
    }
    
    // Then sort by numeric values if present
    const aValue = parseFloat(a.name.split(' ')[1]);
    const bValue = parseFloat(b.name.split(' ')[1]);
    
    if (!isNaN(aValue) && !isNaN(bValue)) {
      return aValue - bValue;
    }
    
    // Finally sort by coefficient
    return parseFloat(a.coefficient || '0') - parseFloat(b.coefficient || '0');
  });
  
  // Show outcomes with indentation
  sortedOutcomes.forEach(outcome => {
    const outcomeText = `   - ${outcome.name}: ${outcome.coefficient || 'No coefficient'}`;
    output.push(outcomeText);
    console.log(outcomeText);
    
    // If the outcome has a data-anchor attribute, extract and display outcomeType
    if (outcome.attributes && outcome.attributes['data-anchor']) {
      try {
        const anchorMatch = outcome.attributes['data-anchor'].match(/outcome_(\{.*\})/);
        if (anchorMatch && anchorMatch[1]) {
          const anchorData = JSON.parse(anchorMatch[1].replace(/&quot;/g, '"'));
          if (anchorData.outcomeType) {
            const detailText = `     (Type: ${anchorData.outcomeType}, Values: ${JSON.stringify(anchorData.values)})`;
            output.push(detailText);
            console.log(detailText);
          }
        }
      } catch (err) {
        // Ignore parsing errors
      }
    }
  });
  
  output.push(''); // Add a blank line between markets
  console.log(''); // Add a blank line between markets
});

// Save the formatted output to file
try {
  fs.writeFileSync(outputFile, output.join('\n'));
  console.log(`\n✅ Formatted output saved to: ${outputFile}`);
} catch (error) {
  console.error(`❌ Error saving output to file: ${error.message}`);
}

// Also save a JSON summary for easier programmatic access
const summaryData = {
  match: data.match,
  source: data.source,
  event_id: data.event_id,
  timestamp: data.timestamp,
  scorecard: data.scorecard,
  tabs: data.tabs.map(tab => tab.name),
  markets: data.markets.map(market => ({
    title: market.title,
    outcomes: market.outcomes.map(outcome => ({
      name: outcome.name,
      coefficient: outcome.coefficient
    }))
  })),
  total_markets: data.markets.length,
  total_outcomes: data.markets.reduce((acc, market) => acc + market.outcomes.length, 0)
};

const summaryFile = outputFile.replace('.txt', '_summary.json');
try {
  fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2));
  console.log(`✅ JSON summary saved to: ${summaryFile}`);
} catch (error) {
  console.error(`❌ Error saving JSON summary: ${error.message}`);
} 