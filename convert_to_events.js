const fs = require('fs');

// Configuration
const inputFile = process.argv[2] || 'formatted_output_summary.json';
const outputFile = process.argv[3] || 'betting_events.json';

console.log(`Converting betting data from ${inputFile} to event format...`);

// Load the parsed data
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// Extract scorecard directly from the input data (no need for separate file)
const scorecardData = data.scorecard || null;

// Function to normalize odds to sum to 10
function normalizeOdds(yesOdds, noOdds) {
  // Convert odds to implied probabilities
  const pYes = 1 / yesOdds;
  const pNo = 1 / noOdds;
  const totalP = pYes + pNo;
  
  // Normalize probabilities and scale to 10
  const normalizedYes = (pYes / totalP) * 10;
  const normalizedNo = (pNo / totalP) * 10;
  
  return {
    "Yes": Math.round(normalizedYes * 100) / 100, // Round to 2 decimal places
    "No": Math.round(normalizedNo * 100) / 100
  };
}

// Convert markets to events
const events = [];
const processedEvents = new Set(); // Track processed events to avoid duplicates

// Helper function to extract team names consistently
function extractTeamName(title) {
  if (title.includes("Gujarat Titans")) return "Gujarat Titans";
  if (title.includes("Mumbai Indians")) return "Mumbai Indians";
  if (title.includes("Royal Challengers Bengaluru")) return "Royal Challengers Bengaluru";
  if (title.includes("Sunrisers Hyderabad")) return "Sunrisers Hyderabad";
  if (title.includes("Punjab Kings")) return "Punjab Kings";
  if (title.includes("England Lions")) return "England Lions";
  if (title.includes("India A")) return "India A";
  return null;
}

// Process each market
data.markets.forEach(market => {
  const { title, outcomes } = market;
  
  console.log(`\n📊 Processing market: "${title}" with ${outcomes.length} outcomes`);
  
  // Skip if no outcomes
  if (!outcomes || outcomes.length === 0) {
    console.log(`  ⚠️ Skipping - no outcomes`);
    return;
  }
  
  // Winner Market
  if (title === "Winner") {
    if (outcomes.length >= 2 && !processedEvents.has('match_winner')) {
      const team1 = outcomes[0];
      const team2 = outcomes[1];
      
      // Create event for each team
      events.push({
        event: `Will ${team1.name} win the match?`,
        options: normalizeOdds(parseFloat(team1.coefficient), parseFloat(team2.coefficient))
      });
      
      processedEvents.add('match_winner');
    }
  }
  // Toss winner
  else if (title === "Toss winner") {
    if (outcomes.length >= 2 && !processedEvents.has('toss_winner')) {
      const team1 = outcomes[0];
      const team2 = outcomes[1];
      
      events.push({
        event: `Will ${team1.name} win the toss?`,
        options: normalizeOdds(parseFloat(team1.coefficient), parseFloat(team2.coefficient))
      });
      
      processedEvents.add('toss_winner');
    }
  }
  // Toss and match winner
  else if (title === "Toss and match winner") {
    outcomes.forEach(outcome => {
      if (outcome.name !== "None") {
        const eventKey = `toss_match_winner_${outcome.name}`;
        if (!processedEvents.has(eventKey)) {
          // Calculate the opposite odds (all other outcomes combined)
          const thisOdds = parseFloat(outcome.coefficient);
          const otherOdds = outcomes
            .filter(o => o.name !== outcome.name)
            .reduce((sum, o) => sum + (1 / parseFloat(o.coefficient)), 0);
          const oppositeOdds = 1 / otherOdds;
          
          events.push({
            event: `Will ${outcome.name} win both toss and match?`,
            options: normalizeOdds(thisOdds, oppositeOdds)
          });
          
          processedEvents.add(eventKey);
        }
      }
    });
  }
  // Toss result and total runs on first delivery
  else if (title.includes("Toss result and total runs") && title.includes("first delivery")) {
    outcomes.forEach(outcome => {
      const parts = outcome.name.split(" / ");
      if (parts.length === 2) {
        const team = parts[0];
        const condition = parts[1];
        const eventKey = `toss_first_delivery_${outcome.name}`;
        
        if (!processedEvents.has(eventKey)) {
          // Find the opposite outcome
          const oppositeCondition = condition.includes("Over") ? "Under" : "Over";
          const oppositeOutcome = outcomes.find(o => o.name === `${team} / ${oppositeCondition} 0.5`);
          
          if (oppositeOutcome) {
            events.push({
              event: `Will ${team} win toss and first delivery have ${condition.toLowerCase()}?`,
              options: normalizeOdds(parseFloat(outcome.coefficient), parseFloat(oppositeOutcome.coefficient))
            });
            
            processedEvents.add(eventKey);
            processedEvents.add(`toss_first_delivery_${oppositeOutcome.name}`);
          }
        }
      }
    });
  }
  // Individual total runs - MOVED BEFORE GENERIC TOTAL RUNS
  else if (title === "Individual total runs. Innings #1") {
    console.log(`\n🔍 Processing Individual total runs market with ${outcomes.length} outcomes`);
    
    // This market now has player-specific over/under pairs
    const playerBets = {};
    
    // Group outcomes by player and threshold
    outcomes.forEach(outcome => {
      console.log(`  - Processing outcome: ${outcome.name}`);
      
      if (outcome.name.includes(' - ')) {
        const parts = outcome.name.split(' - ');
        const playerName = parts[0];
        const betType = parts[1]; // "Over X" or "Under X"
        
        if (!playerBets[playerName]) {
          playerBets[playerName] = {};
        }
        
        if (betType.includes('Over')) {
          const threshold = betType.replace('Over ', '');
          if (!playerBets[playerName][threshold]) {
            playerBets[playerName][threshold] = {};
          }
          playerBets[playerName][threshold].over = outcome;
        } else if (betType.includes('Under')) {
          const threshold = betType.replace('Under ', '');
          if (!playerBets[playerName][threshold]) {
            playerBets[playerName][threshold] = {};
          }
          playerBets[playerName][threshold].under = outcome;
        }
      }
    });
    
    console.log(`  Found ${Object.keys(playerBets).length} players with bets`);
    
    // Create events for each player's over/under pair
    Object.keys(playerBets).forEach(playerName => {
      Object.keys(playerBets[playerName]).forEach(threshold => {
        const pair = playerBets[playerName][threshold];
        
        if (pair.over && pair.under) {
          const eventKey = `${playerName}_runs_${threshold}`;
          if (!processedEvents.has(eventKey)) {
            const event = {
              event: `Will ${playerName} score over ${threshold} runs in Innings #1?`,
              options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient))
            };
            
            events.push(event);
            processedEvents.add(eventKey);
            
            console.log(`  ✅ Added event: ${event.event}`);
          }
        }
      });
    });
  }
  // Total runs Over/Under
  else if (title.includes("total runs") && outcomes.some(o => o.name.includes("Over") || o.name.includes("Under"))) {
    const teamName = extractTeamName(title);
    
    // Extract innings context
    let inningsText = "";
    if (title.includes("Innings #1")) {
      inningsText = " in Innings #1";
    } else if (title.includes("Innings #2")) {
      inningsText = " in Innings #2";
    }
    
    // Extract over context
    let overText = "";
    const overMatch = title.match(/Over #(\d+)/);
    if (overMatch) {
      overText = ` in Over #${overMatch[1]}`;
    }
    
    // Group Over/Under pairs by threshold
    const overUnderPairs = {};
    outcomes.forEach(outcome => {
      if (outcome.name.includes("Over ") || outcome.name.includes("Under ")) {
        const threshold = outcome.name.match(/(\d+\.?\d*)/)?.[1];
        if (threshold) {
          if (!overUnderPairs[threshold]) {
            overUnderPairs[threshold] = {};
          }
          if (outcome.name.includes("Over")) {
            overUnderPairs[threshold].over = outcome;
          } else {
            overUnderPairs[threshold].under = outcome;
          }
        }
      }
    });
    
    // Create specific threshold questions
    Object.keys(overUnderPairs).forEach(threshold => {
      const pair = overUnderPairs[threshold];
      
      if (pair.over && pair.under) {
        const eventKey = `${teamName || 'total'}_runs_over_${threshold}${inningsText}${overText}`;
        
        if (!processedEvents.has(eventKey)) {
          let eventDescription;
          
          // Create specific event descriptions based on context
          if (title.includes("before dismissal #1") && teamName) {
            eventDescription = `Will ${teamName} score over ${threshold} runs before dismissal #1${inningsText}?`;
          } else if (teamName) {
            eventDescription = `Will ${teamName} score over ${threshold} total runs${inningsText}?`;
          } else {
            eventDescription = `Will total runs be over ${threshold}${inningsText}${overText}?`;
          }
          
          events.push({
            event: eventDescription,
            options: normalizeOdds(parseFloat(pair.over.coefficient), parseFloat(pair.under.coefficient))
          });
          
          processedEvents.add(eventKey);
        }
      }
    });
  }
  // First boundary type
  else if (title === "First boundary will be") {
    const fourRuns = outcomes.find(o => o.name === "4 runs");
    const sixRuns = outcomes.find(o => o.name === "6 runs");
    
    if (fourRuns && sixRuns && !processedEvents.has('first_boundary')) {
      events.push({
        event: "Will the first boundary be a four?",
        options: normalizeOdds(parseFloat(fourRuns.coefficient), parseFloat(sixRuns.coefficient))
      });
      
      processedEvents.add('first_boundary');
    }
  }
  // Ball outcomes (First/Second/Third ball)
  else if (title.includes("ball of match")) {
    const ballNumber = title.match(/(First|Second|Third)/)?.[1]?.toLowerCase();
    
    if (ballNumber) {
      // Dot ball vs any runs
      const dotBall = outcomes.find(o => o.name === "Dot Ball");
      const runsOutcomes = outcomes.filter(o => o.name.includes("run") && !o.name.includes("Bye"));
      
      if (dotBall && runsOutcomes.length > 0 && !processedEvents.has(`${ballNumber}_ball_dot`)) {
        // Calculate combined odds for all run outcomes
        const runsProb = runsOutcomes.reduce((sum, o) => sum + (1 / parseFloat(o.coefficient)), 0);
        const runsCombinedOdds = 1 / runsProb;
        
        events.push({
          event: `Will the ${ballNumber} ball be a dot ball?`,
          options: normalizeOdds(parseFloat(dotBall.coefficient), runsCombinedOdds)
        });
        
        processedEvents.add(`${ballNumber}_ball_dot`);
      }
      
      // Wicket on this ball
      const wicket = outcomes.find(o => o.name === "Wicket");
      if (wicket && !processedEvents.has(`${ballNumber}_ball_wicket`)) {
        const nonWicketProb = outcomes
          .filter(o => o.name !== "Wicket")
          .reduce((sum, o) => sum + (1 / parseFloat(o.coefficient)), 0);
        const nonWicketOdds = 1 / nonWicketProb;
        
        events.push({
          event: `Will there be a wicket on the ${ballNumber} ball?`,
          options: normalizeOdds(parseFloat(wicket.coefficient), nonWicketOdds)
        });
        
        processedEvents.add(`${ballNumber}_ball_wicket`);
      }
    }
  }
  // Dismissal methods
  else if (title.includes("Dismissal") && title.includes("method")) {
    const dismissalNumber = title.match(/#(\d+)/)?.[1] || "1";
    const teamName = extractTeamName(title);
    const inningsMatch = title.match(/Innings #(\d+)/);
    const innings = inningsMatch ? ` in Innings #${inningsMatch[1]}` : "";
    
    if (title.includes("2-way betting")) {
      const caught = outcomes.find(o => o.name === "Caught");
      const notCaught = outcomes.find(o => o.name === "Not caught");
      
      if (caught && notCaught) {
        const eventKey = `${teamName || 'team'}_dismissal_${dismissalNumber}_caught${innings}`;
        if (!processedEvents.has(eventKey)) {
          const teamText = teamName ? `${teamName}'s ` : "";
          events.push({
            event: `Will ${teamText}dismissal #${dismissalNumber} be caught${innings}?`,
            options: normalizeOdds(parseFloat(caught.coefficient), parseFloat(notCaught.coefficient))
          });
          
          processedEvents.add(eventKey);
        }
      }
    }
  }
  // Partnership best result
  else if (title.includes("best result of the first partnership")) {
    outcomes.forEach(outcome => {
      if (outcome.name !== "Draw") {
        const eventKey = `first_partnership_${outcome.name}`;
        if (!processedEvents.has(eventKey)) {
          // Calculate odds against this team
          const thisOdds = parseFloat(outcome.coefficient);
          const otherOdds = outcomes
            .filter(o => o.name !== outcome.name)
            .reduce((sum, o) => sum + (1 / parseFloat(o.coefficient)), 0);
          const oppositeOdds = 1 / otherOdds;
          
          events.push({
            event: `Will ${outcome.name} have the best first partnership?`,
            options: normalizeOdds(thisOdds, oppositeOdds)
          });
          
          processedEvents.add(eventKey);
        }
      }
    });
  }
  // Each team will score X runs
  else if (title.startsWith("Each team will score")) {
    const runThreshold = title.match(/(\d+)/)?.[1];
    const yesOutcome = outcomes.find(o => o.name === "Yes");
    
    if (runThreshold && yesOutcome && !processedEvents.has(`each_team_${runThreshold}`)) {
      // Since we only have "Yes" option, we'll estimate "No" as inverse
      const yesOdds = parseFloat(yesOutcome.coefficient);
      const noOdds = 1 / (1 - (1 / yesOdds)); // Estimated
      
      events.push({
        event: `Will each team score ${runThreshold}+ runs?`,
        options: normalizeOdds(yesOdds, noOdds)
      });
      
      processedEvents.add(`each_team_${runThreshold}`);
    }
  }
  // Total wickets/ducks
  else if (title === "Total wickets" || title === "Total ducks") {
    const type = title.includes("wickets") ? "wickets" : "ducks";
    
    // Find unique thresholds
    const thresholds = new Set();
    outcomes.forEach(outcome => {
      const match = outcome.name.match(/(\d+\.?\d*)/);
      if (match) thresholds.add(match[1]);
    });
    
    thresholds.forEach(threshold => {
      const overOutcome = outcomes.find(o => o.name === `Over ${threshold}`);
      const underOutcome = outcomes.find(o => o.name === `Under ${threshold}`);
      
      if (overOutcome && underOutcome) {
        const eventKey = `total_${type}_${threshold}`;
        if (!processedEvents.has(eventKey)) {
          events.push({
            event: `Will there be over ${threshold} ${type} in the match?`,
            options: normalizeOdds(parseFloat(overOutcome.coefficient), parseFloat(underOutcome.coefficient))
          });
          
          processedEvents.add(eventKey);
        }
      } else if (underOutcome && !overOutcome) {
        // Only under option available, estimate over
        const eventKey = `total_${type}_under_${threshold}`;
        if (!processedEvents.has(eventKey)) {
          const underOdds = parseFloat(underOutcome.coefficient);
          const overOdds = 1 / (1 - (1 / underOdds)); // Estimated
          
          events.push({
            event: `Will there be under ${threshold} ${type} in the match?`,
            options: normalizeOdds(overOdds, underOdds)
          });
          
          processedEvents.add(eventKey);
        }
      }
    });
  }
  // Tied match
  else if (title === "Tied match") {
    const yes = outcomes.find(o => o.name === "Yes");
    const no = outcomes.find(o => o.name === "No");
    
    if (yes && no && !processedEvents.has('tied_match')) {
      events.push({
        event: "Will the match end in a tie?",
        options: normalizeOdds(parseFloat(yes.coefficient), parseFloat(no.coefficient))
      });
      
      processedEvents.add('tied_match');
    }
  }
  // Handle generic Yes/No markets
  else if (outcomes.some(o => o.name === "Yes" || o.name === "No")) {
    const yesOutcome = outcomes.find(o => o.name === "Yes");
    const noOutcome = outcomes.find(o => o.name === "No");
    
    if (yesOutcome && noOutcome) {
      let question = "";
      
      // Create specific questions based on market type
      if (title.includes("Boundary Four")) {
        const team = extractTeamName(title);
        const over = title.match(/Over #(\d+)/)?.[1];
        question = `Will ${team} hit a boundary four in over ${over}?`;
      } else if (title.includes("Boundary Six")) {
        const team = extractTeamName(title);
        const over = title.match(/Over #(\d+)/)?.[1];
        question = `Will ${team} hit a six in over ${over}?`;
      } else if (title.includes("dismissal")) {
        const team = extractTeamName(title);
        const over = title.match(/Over #(\d+)/)?.[1];
        question = `Will ${team} lose a wicket in over ${over}?`;
      } else if (title.includes("To score 50 runs")) {
        question = "Will any player score 50+ runs in the match?";
      } else if (title.includes("To score 100 runs")) {
        question = "Will any player score 100+ runs in the match?";
      } else {
        // Convert title to question format
        question = title.endsWith('?') ? title : `Will ${title.toLowerCase()}?`;
      }
      
      // Only add if not already processed and question is properly formatted
      if (!processedEvents.has(question) && question.includes("Will")) {
        events.push({
          event: question,
          options: normalizeOdds(parseFloat(yesOutcome.coefficient), parseFloat(noOutcome.coefficient))
        });
        
        processedEvents.add(question);
      }
    }
  }
});

// Step 4: Format All Outputs Consistently
const eventData = {
  match: data.match,
  source: data.source,
  event_id: data.event_id,
  timestamp: data.timestamp,
  total_events: events.length,
  events: events
};

// Add scorecard section if available
if (scorecardData) {
  eventData.scorecard = scorecardData;
}

// Save the converted events
try {
  fs.writeFileSync(outputFile, JSON.stringify(eventData, null, 2));
  console.log(`✅ Successfully converted ${events.length} betting events`);
  console.log(`📁 Event data saved to: ${outputFile}`);
  
  // Print sample events
  console.log('\n📋 Sample Events:');
  events.slice(0, 5).forEach((event, index) => {
    console.log(`${index + 1}. ${event.event}`);
    console.log(`   Yes: ${event.options["Yes"]} | No: ${event.options["No"]}`);
  });
  
  if (events.length > 5) {
    console.log(`   ... and ${events.length - 5} more events`);
  }
  
  if (eventData.scorecard) {
    console.log('\n📊 Scorecard included:');
    if (eventData.scorecard.teams && eventData.scorecard.teams.length > 0) {
      eventData.scorecard.teams.forEach(team => {
        console.log(`   ${team.name} (${team.shortName}): ${team.score} - ${team.overs}`);
      });
    } else {
      console.log('   ✅ Live scorecard data included with HTML structure');
      console.log('   📍 Contains: Innings, scores, and match details');
    }
  } else {
    console.log('\n⚠️  No scorecard data available');
  }
  
} catch (error) {
  console.error(`❌ Error saving event data: ${error.message}`);
}

console.log('\n✨ Conversion complete!'); 