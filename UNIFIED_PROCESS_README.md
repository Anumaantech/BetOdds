# Unified Betting Data Process

## Overview

The unified process combines all three steps of betting data extraction into a single command, optimizing the workflow from 3 separate commands to just 1.

## Previous Workflow (3 Commands)

Previously, you had to run these commands in sequence:
```bash
npm run extract-all
npm run full-process
npm run convert-events
```

## New Unified Workflow (1 Command)

Now you can run everything with a single command:
```bash
npm run process
```

Or with custom parameters:
```bash
npm run process -- [URL] [OUTPUT_DIR]
```

## What It Does

The unified process performs 4 steps automatically:

1. **Extract Data** - Uses Puppeteer to navigate to the betting website and extract all market data
2. **Parse HTML** - Processes the raw HTML to extract structured market information
3. **Format Data** - Creates human-readable output and summary files
4. **Convert to Events** - Transforms markets into normalized betting events with Yes/No options

## Output Files

All output files are saved to the `output` directory (or your specified directory):

- `complete_data.json` - Raw extracted data with HTML
- `parsed_data.json` - Structured market data
- `formatted_output.txt` - Human-readable market summary
- `formatted_output_summary.json` - JSON summary of all markets
- `betting_events.json` - Final normalized betting events

## Usage Examples

### Default Usage
```bash
npm run process
```
This uses the URL from your `.env` file and saves to the `output` directory.

### Custom URL
```bash
npm run process -- "https://1xbet.com/en/live/cricket/12345"
```

### Custom URL and Output Directory
```bash
npm run process -- "https://1xbet.com/en/live/cricket/12345" "my-custom-output"
```

## Benefits of Unified Process

1. **Simplified Workflow** - One command instead of three
2. **Faster Execution** - No intermediate file I/O between steps
3. **Better Error Handling** - Process stops immediately if any step fails
4. **Clear Progress Tracking** - Visual indicators for each step
5. **Consistent Output** - All files saved to the same directory

## Sample Output

```
🚀 Starting unified betting data extraction process...
📍 URL: https://1xbet.com/en/live/cricket/12345
📁 Output directory: output

📥 Step 1/4: Extracting data from website...
   Navigating to URL...
   Page loaded: Team A vs Team B - Betting
   Expanding all markets...
   Extracting page data...
   ✓ Data extracted successfully (25 markets found)

🔍 Step 2/4: Parsing HTML data...
   ✓ Parsed 25 markets with 78 total outcomes

📊 Step 3/4: Formatting data...
   ✓ Formatted output saved

🎯 Step 4/4: Converting to betting events...
   ✓ Converted 15 betting events

✅ Process completed successfully!

📁 Output files created:
   - completeData: output/complete_data.json
   - parsedData: output/parsed_data.json
   - formattedOutput: output/formatted_output.txt
   - formattedSummary: output/formatted_output_summary.json
   - bettingEvents: output/betting_events.json

📋 Summary:
   - Markets processed: 25
   - Total outcomes: 78
   - Events generated: 15

🎲 Sample events:
   1. Will Team A win the match against Team B?
      Yes: 4.12 | No: 5.88
   2. Will Team B win the match against Team A?
      Yes: 5.88 | No: 4.12
   3. Will the total runs exceed 145.5?
      Yes: 5.25 | No: 4.75
```

## Troubleshooting

If you encounter any issues:

1. Make sure your `.env` file has a valid `TARGET_URL`
2. Ensure the betting page is accessible and has live data
3. Check that all dependencies are installed: `npm install`
4. For debugging, check the intermediate JSON files in the output directory

## Reverting to Old Process

The original scripts are still available if needed:
```bash
# Old way still works
npm run extract-all
npm run full-process
npm run convert-events
``` 