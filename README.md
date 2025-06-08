# Cricket Betting Data Extractor

A comprehensive tool to extract betting data from online sportsbook websites, particularly Parimatch Global.

## Installation

1. Ensure you have Node.js installed
2. Clone this repository
3. Install dependencies:
```
npm install
```

## Configuration

### Environment Variables

This project uses environment variables to manage URLs and API configuration. 

1. Copy the example environment file:
```
cp .env.example .env
```

2. Edit the `.env` file and set your target URL:
```
TARGET_URL=https://parimatchglobal.com/en/events/your-match-id
API_PORT=3005
API_URL=http://localhost:3005
```

3. Alternatively, use the set-url script to quickly update the URL:
```
npm run set-url https://parimatchglobal.com/en/events/your-match-id
```

**Note:** The `.env` file is ignored by git to keep your configuration private.

## Usage

### Basic Extraction (Original Method)

To extract basic betting data:

1. Start the API server:
```
npm run api
```

2. In a separate terminal, run the client:
```
npm run client
```

The client will automatically use the URL from your `.env` file.

### Complete Extraction (New Method)

To extract all data from the event-markets container:

1. Start the API server:
```
npm run api
```

2. In a separate terminal, run the client with the complete option:
```
npm run client -- --complete --output complete_data.json
```

3. Parse the raw HTML data:
```
npm run parse
```

4. Display a nicely formatted summary of all markets:
```
npm run display
```

### All-in-One Commands

For convenience, you can use these combined commands:

- Extract complete data (launches API server in new window and runs client):
```
npm run extract-all
```

- Process the extracted data (parse and display):
```
npm run full-process
```

## Output Files

- `extracted_data.json`: Basic extraction output
- `complete_data.json`: Complete extraction output with raw HTML
- `parsed_data.json`: Parsed data from raw HTML with all markets and outcomes

## Advanced Options

- Override the URL from .env file:
```
npm run client -- --url=https://parimatchglobal.com/en/events/your-match-id
```

- Specify a custom output file:
```
npm run client -- --output=your-output-file.json
```

- Get JSON output to stdout:
```
npm run client -- --json
```

## Troubleshooting

If you get an "address already in use" error, it means the API server is already running. You can:

1. Use the existing server
2. Kill the existing server with:
```
taskkill /F /IM node.exe
```
(On Windows) or:
```
pkill -f node
```
(On Linux/Mac) 