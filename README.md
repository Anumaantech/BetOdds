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

# Betting Odds Platform - Production Deployment

A comprehensive betting odds processing platform that extracts, processes, and serves cricket, tennis, and basketball events data via REST APIs.

## 🏗️ Architecture

- **Data Processing**: Automated extraction and conversion to binary Yes/No events
- **Database**: MongoDB Atlas (free tier)
- **API Server**: Express.js with comprehensive REST endpoints  
- **Hosting**: Render (production deployment)
- **Sports Supported**: Cricket, Tennis, Basketball, Soccer

## 🚀 Quick Deploy to Production

### 1. MongoDB Atlas Setup (Free Tier)

1. **Create MongoDB Atlas Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Create a free account
   - Choose the FREE tier (M0 Sandbox)

2. **Create Cluster**
   ```
   - Cluster Name: betting-odds-cluster
   - Cloud Provider: AWS (recommended)
   - Region: Closest to your users
   - Cluster Tier: M0 Sandbox (FREE)
   ```

3. **Configure Database Access**
   ```
   - Database Access → Add New Database User
   - Username: betting_admin
   - Password: [Generate secure password]
   - Built-in Role: Read and write to any database
   ```

4. **Configure Network Access**
   ```
   - Network Access → Add IP Address
   - Access List Entry: 0.0.0.0/0 (Allow access from anywhere)
   - Or add specific Render IP ranges for better security
   ```

5. **Get Connection String**
   ```
   - Clusters → Connect → Connect your application
   - Driver: Node.js
   - Copy the connection string:
   mongodb+srv://betting_admin:<password>@betting-odds-cluster.xxxxx.mongodb.net/betting_odds?retryWrites=true&w=majority
   ```

### 2. Render Deployment

1. **Prepare Repository**
   ```bash
   # Create production environment file
   cp env.example .env
   
   # Edit .env with your MongoDB connection string
   MONGODB_URI=mongodb+srv://betting_admin:<password>@betting-odds-cluster.xxxxx.mongodb.net/betting_odds?retryWrites=true&w=majority
   NODE_ENV=production
   PORT=3000
   ```

2. **Deploy to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     ```
     Name: betting-odds-api
     Environment: Node
     Build Command: npm install
     Start Command: npm start
     ```

3. **Environment Variables on Render**
   ```
   MONGODB_URI=mongodb+srv://betting_admin:<password>@betting-odds-cluster.xxxxx.mongodb.net/betting_odds?retryWrites=true&w=majority
   NODE_ENV=production
   PORT=3000
   CORS_ORIGIN=*
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy
   - Your API will be available at: `https://your-app-name.onrender.com`

## 📡 API Endpoints

### Base URL
```
Production: https://your-app-name.onrender.com
Local: http://localhost:3000
```

### Health Check
```http
GET /health
```

### Get All Events (with pagination)
```http
GET /api/events?page=1&limit=50&sport=cricket&eventGroup=match_level
```

### Get Events by Sport
```http
GET /api/events/sport/cricket
GET /api/events/sport/tennis  
GET /api/events/sport/basketball
GET /api/events/sport/soccer
```

### Get Events by Match
```http
GET /api/events/match/England%20vs%20Australia?sport=cricket
```

### Get Events by Group
```http
GET /api/events/group/match_level
GET /api/events/group/player_props
GET /api/events/group/over_specific
```

### Get Single Event
```http
GET /api/events/:eventId
```

### Get Statistics
```http
GET /api/stats
```

### Get Available Filters
```http
GET /api/filters
```

## 🔄 Running Data Processing

### Manual Processing
```bash
# Process once
npm run process

# Continuous monitoring (saves to database)
npm run monitor
```

### Automated Processing
Set up a cron job or use Render's cron jobs to run processing automatically:

```bash
# Every 30 minutes
*/30 * * * * cd /path/to/project && npm run process
```

## 🏃‍♂️ Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables**
   ```bash
   cp env.example .env
   # Edit .env with your MongoDB connection string
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Test API**
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/api/events?limit=5
   ```

## 📊 Event Data Structure

### Event Object
```json
{
  "eventId": "cricket_match123_abc_1703123456789",
  "event": "Will England win the match?",
  "options": {
    "Yes": 15.67,
    "No": 4.33
  },
  "sport": "cricket",
  "matchName": "England vs Australia",
  "eventGroup": "match_level",
  "eventType": "match_winner_3way_converted",
  "team1": "England",
  "team2": "Australia",
  "marketType": "3-way_to_2-way",
  "drawRedistributed": true,
  "extractedAt": "2023-12-21T10:30:00.000Z",
  "isActive": true
}
```

### Response Format
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalEvents": 500,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## 🔍 Key Features

### Sports Coverage
- **Cricket**: Match winners, over-specific events, player props, dismissals
- **Tennis**: Set winners, game totals, handicaps, player props  
- **Basketball**: Match winners, quarter/half markets, team totals
- **Soccer**: Match winners, goal totals, both teams to score, goalscorer markets

### 3-Way to Binary Conversion
- Automatically detects 3-way markets (Team1, Draw, Team2)
- Redistributes draw probability proportionally between teams
- Creates mathematically correct binary Yes/No events

### Event Categorization
- **match_level**: Overall match outcomes
- **over_specific**: Cricket over-by-over events
- **player_props**: Individual player performances
- **dismissal_events**: Cricket dismissal-related events
- **other_events**: Miscellaneous events

## 🛡️ Security Features

- Helmet.js for security headers
- CORS configuration
- Request compression
- Input validation
- Rate limiting ready

## 📈 Performance

- MongoDB indexes for fast queries
- Pagination for large datasets
- Lean queries for better performance
- Connection pooling
- Batch processing for bulk operations

## 🔧 Environment Variables

```bash
# Required
MONGODB_URI=mongodb+srv://...

# Optional
PORT=3000
NODE_ENV=production
CORS_ORIGIN=*
JWT_SECRET=your_jwt_secret
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📞 API Examples

### Fetch Cricket Events
```javascript
fetch('https://your-app.onrender.com/api/events/sport/cricket?limit=10')
  .then(response => response.json())
  .then(data => {
    console.log(`Found ${data.count} cricket events`);
    data.data.forEach(event => {
      console.log(`${event.event} - Yes: ${event.options.Yes}, No: ${event.options.No}`);
    });
  });
```

### Get Match Statistics
```javascript
fetch('https://your-app.onrender.com/api/stats')
  .then(response => response.json())
  .then(stats => {
    console.log(`Total events: ${stats.statistics.totalEvents}`);
    console.log('Events by sport:', stats.statistics.eventsBySport);
  });
```

## 🚨 Troubleshooting

### MongoDB Connection Issues
1. Check connection string format
2. Verify username/password
3. Ensure IP whitelist includes 0.0.0.0/0
4. Check cluster status in Atlas

### Render Deployment Issues
1. Check build logs in Render dashboard
2. Verify environment variables are set
3. Ensure package.json has correct start script
4. Check for missing dependencies

### API Not Responding
1. Check `/health` endpoint first
2. Verify MongoDB connection
3. Check Render service logs
4. Ensure PORT environment variable is set

## 🆘 Support

For issues with:
- **MongoDB Atlas**: Check [Atlas Documentation](https://docs.atlas.mongodb.com/)
- **Render**: Check [Render Documentation](https://render.com/docs)
- **Application**: Check server logs and database connectivity

## 📝 License

ISC License - See LICENSE file for details. 


