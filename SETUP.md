# MongoDB Atlas Setup Guide

## 🔗 Your MongoDB Connection String

Your cluster URL has been identified. Here's how to set it up:

### 1. Create Environment File

Create a `.env` file in your project root with:

```bash
# MongoDB Atlas Configuration
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@events.gshkxun.mongodb.net/betting_odds?retryWrites=true&w=majority&appName=Events

# Server Configuration  
PORT=3000
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=*
```

### 2. Replace Placeholders

In the `.env` file, replace:
- `<db_username>` with your MongoDB Atlas username
- `<db_password>` with your MongoDB Atlas password

Example:
```bash
MONGODB_URI=mongodb+srv://betting_admin:MySecurePassword123@events.gshkxun.mongodb.net/betting_odds?retryWrites=true&w=majority&appName=Events
```

### 3. Database Setup in MongoDB Atlas

1. **Create Database User** (if not done):
   - Go to MongoDB Atlas Dashboard
   - Database Access → Add New Database User
   - Username: `betting_admin` (or your choice)
   - Password: Generate a secure password
   - Role: "Read and write to any database"

2. **Configure Network Access**:
   - Network Access → Add IP Address
   - Choose "Allow access from anywhere" (0.0.0.0/0)
   - Or add specific IPs for better security

3. **Database Will Be Created Automatically**:
   - Database name: `betting_odds`
   - Collection: `betting_events`
   - Indexes will be created automatically when first data is saved

### 4. Test Connection

```bash
# Install dependencies
npm install

# Test the connection
npm run dev

# Check health endpoint
curl http://localhost:3000/health

# Test database connection by processing some data
npm run process
```

### 5. Deploy to Render

When deploying to Render, add the same environment variables:

```
MONGODB_URI=mongodb+srv://betting_admin:YourPassword@events.gshkxun.mongodb.net/betting_odds?retryWrites=true&w=majority&appName=Events
NODE_ENV=production
PORT=3000
CORS_ORIGIN=*
```

## 🆕 New Soccer Support

The system now supports **Soccer/Football** events with:
- Match winner markets (3-way to binary conversion)
- Goal totals (over/under)
- Both teams to score
- Goalscorer markets
- Correct score events

Soccer events will be automatically detected using keywords like:
- `football`, `soccer`, `fifa`, `uefa`
- `premier league`, `la liga`, `serie a`, `bundesliga`
- `champions league`, `world cup`, etc.

## 🚀 Quick Test

Once your `.env` is set up:

```bash
# Start development server
npm run dev

# In another terminal, test some endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/events?limit=5
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/filters
```

## 🔒 Security Notes

- Never commit your `.env` file to version control
- Use strong passwords for your MongoDB user
- Consider IP whitelisting instead of allowing all IPs (0.0.0.0/0)
- Keep your connection string secure

## 📊 Expected Database Collections

After processing data, you'll see:
- **Collection**: `betting_events`
- **Documents**: Each betting event as a separate document
- **Indexes**: Automatically created for optimal performance

Sample document structure:
```json
{
  "eventId": "soccer_match123_abc_1703123456789",
  "event": "Will Manchester United win the match?",
  "options": { "Yes": 15.67, "No": 4.33 },
  "sport": "soccer",
  "matchName": "Manchester United vs Liverpool",
  "eventGroup": "match_level",
  "team1": "Manchester United",
  "team2": "Liverpool",
  "extractedAt": "2023-12-21T10:30:00.000Z"
}
``` 