# MongoDB Collection Naming Update

## 🔄 Overview

The MongoDB storage system has been updated to use **team-based collection naming** instead of URL-based naming for better organization and easier identification of match data.

## 📊 Naming Format Changes

### **Before (URL-based)**
```
url_parimatchglobal_com_en_events_englandwestindies13348760
```

### **After (Team-based)**
```
england_westindies_20241215
```

## 🏗️ New Naming Convention

The new format follows this pattern:
```
{team1}_{team2}_{date}
```

Where:
- **team1, team2**: Team names in alphabetical order (lowercase, alphanumeric only)
- **date**: Match date in YYYYMMDD format

### **Examples:**
- `australia_india_20241215` - Australia vs India on Dec 15, 2024
- `england_pakistan_20241216` - England vs Pakistan on Dec 16, 2024
- `newzealand_southafrica_20241217` - New Zealand vs South Africa on Dec 17, 2024

## ✨ Benefits

### **1. Better Organization**
- Easy to identify which teams are playing
- Chronological sorting by date
- Consistent naming across different data sources

### **2. Reduced Duplication**
- Same match from different URLs maps to same collection
- Automatic consolidation of betting data
- No URL-specific fragmentation

### **3. Improved Queries**
- Find all matches for a specific team
- Query matches by date range
- Better database administration

## 🔧 Implementation Details

### **Automatic Detection**
The system automatically extracts team names from:
- Match titles: "England vs West Indies"
- Match names: "Team1 v Team2"
- Event details: "Team1 - Team2"

### **Fallback Mechanism**
If team-based naming fails, the system falls back to URL-based naming:
```javascript
// Team-based naming preferred
england_westindies_20241215

// URL-based fallback if team extraction fails
url_parimatchglobal_com_en_events_match123
```

### **Backward Compatibility**
- Existing URL-based collections continue to work
- New events use team-based naming when possible
- Migration tools available for existing data

## 🛠️ Technical Changes

### **Database Functions Updated**
1. **`getCollectionForUrl(sourceUrl, matchDetails)`**
   - Now accepts optional `matchDetails` parameter
   - Generates team-based names when possible
   - Returns both collection and collection name

2. **`upsertEvent(eventDetails, sourceUrl, matchDetails)`**
   - Passes match details for team-based naming
   - Stores source URL for reference
   - Tracks collection name in documents

3. **`generateTeamBasedCollectionName(matchDetails)`**
   - Extracts team names from match details
   - Handles various team name formats
   - Ensures consistent alphabetical ordering

### **Enhanced Indexing**
New collections include additional indexes:
```javascript
// Existing indexes
{ event_question: 1 }           // Unique event identifier
{ live: 1, last_seen_at: -1 }   // Live events query

// New indexes
{ source_url: 1 }               // Source URL reference
```

## 📋 Migration Guide

### **Step 1: List Existing Collections**
```bash
npm run migrate-collections list
```

### **Step 2: Test Collection Naming**
```bash
npm run migrate-collections test
```

### **Step 3: Configure Known Matches**
Edit `migrate-collections.js` and add your match details:
```javascript
const knownMatches = [
    {
        sourceUrl: 'https://parimatchglobal.com/en/events/englandwestindies13348760',
        matchDetails: {
            match_name: 'England vs West Indies',
            timestamp: '2024-12-15T10:00:00.000Z',
            event_id: 'englandwestindies13348760'
        }
    },
    // Add more matches...
];
```

### **Step 4: Run Migration**
```bash
npm run migrate-collections migrate
```

### **Migration Process:**
1. ✅ Identifies old URL-based collections
2. 🔄 Extracts team names from match details
3. 📝 Creates new team-based collection names
4. 🔄 Copies all documents with metadata
5. 📊 Ensures proper indexing
6. ✅ Provides migration summary

## 🔍 Querying Data

### **Find All Matches for a Team**
```javascript
// All England matches
db.listCollections().toArray().filter(c => c.name.includes('england'))

// All matches on specific date
db.listCollections().toArray().filter(c => c.name.endsWith('20241215'))
```

### **Query Events from Specific Source**
```javascript
// Events from specific URL in team-based collection
db.england_westindies_20241215.find({ source_url: "https://parimatchglobal.com/..." })

// All live events for the match
db.england_westindies_20241215.find({ live: true })
```

## 📈 Usage Statistics

### **Collection Count Optimization**
- **Before**: 1 collection per unique URL
- **After**: 1 collection per unique match

### **Example Improvement**
```
Old System:
- url_site1_com_match_eng_vs_wi_123
- url_site2_com_events_england_westindies_456
- url_site3_org_betting_eng_wi_789
Total: 3 collections for same match

New System:
- england_westindies_20241215
Total: 1 collection for same match
```

## 🚨 Important Notes

### **Data Consistency**
- Source URL is preserved in each document
- Original collection name tracked for reference
- Migration timestamp added to migrated documents

### **Error Handling**
- Failed team name extraction falls back to URL naming
- Duplicate documents handled gracefully during migration
- Comprehensive logging for troubleshooting

### **Performance Considerations**
- New collections have optimized indexes
- Source URL filtering ensures data isolation
- Efficient querying across consolidated data

## 🧪 Testing

### **Verify Collection Naming**
```bash
# Test name generation
npm run migrate-collections test

# Check specific match
node -e "
const dbUtils = require('./db-utils');
const matchDetails = {
    match_name: 'England vs West Indies',
    timestamp: '2024-12-15T10:00:00.000Z'
};
console.log(dbUtils.generateTeamBasedCollectionName(matchDetails));
"
```

### **Validate Migration**
```bash
# List collections before and after
npm run migrate-collections list

# Run migration with logging
npm run migrate-collections migrate
```

## 🔧 Configuration

### **Environment Variables**
```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=betting_data
MONGODB_COLLECTION_PREFIX=url_  # Still used for fallback naming
```

### **Customization Options**
- Date format: YYYYMMDD (can be modified in `generateTeamBasedCollectionName`)
- Team name cleaning: Alphanumeric only, lowercase
- Separator: Underscore between team names and date

## 📞 Support

### **Common Issues**

**Q: What if team names can't be extracted?**
A: System falls back to URL-based naming automatically.

**Q: How to handle duplicate team names?**
A: Teams are sorted alphabetically to ensure consistent naming.

**Q: What about historical data?**
A: Use the migration tool to convert existing collections.

**Q: Can I customize the naming format?**
A: Yes, modify `generateTeamBasedCollectionName` function in `db-utils.js`.

### **Troubleshooting**
1. Check match_name format in your data
2. Verify timestamp is valid ISO date string
3. Ensure MongoDB connection is working
4. Review console logs for detailed error messages

---

**🎉 The new team-based collection naming provides better organization, reduced duplication, and improved querying capabilities for your betting data platform!** 