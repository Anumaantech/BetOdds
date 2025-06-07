require('dotenv').config(); // To load MONGODB_URI from .env file
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'betting_data';
// MONGODB_COLLECTION_PREFIX will be used to prefix dynamically generated collection names for URLs
const COLLECTION_PREFIX = process.env.MONGODB_COLLECTION_PREFIX || 'url_'; 

let client;
let db;

// Store for collection objects to avoid re-fetching and re-creating indexes every time
const collectionsCache = {};

async function connectDB() {
    if (db) {
        return db;
    }
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log(`   ✓ Successfully connected to MongoDB: ${DB_NAME}`);
        return db;
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error.message);
        throw error;
    }
}

async function closeDB() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        // Clear cache on close, though typically not strictly necessary for client.close()
        Object.keys(collectionsCache).forEach(key => delete collectionsCache[key]);
        console.log('   ✓ MongoDB connection closed.');
    }
}

function sanitizeUrlForCollectionName(url) {
    if (!url) return 'invalid_url';
    try {
        const urlObj = new URL(url);
        let name = (urlObj.hostname + urlObj.pathname + urlObj.search)
            .replace(/^www\./, '')       // Remove www.
            .replace(/\./g, '_')        // Replace . with _
            .replace(/\//g, '_')        // Replace / with _
            .replace(/\?/g, '_query_')   // Replace ? with _query_
            .replace(/=/g, '_eq_')      // Replace = with _eq_
            .replace(/&/g, '_and_')     // Replace & with _and_
            .replace(/%/g, '_pct_')     // Replace % with _pct_
            .replace(/[^a-zA-Z0-9_]/g, '') // Remove any other non-alphanumeric characters except _
            .slice(0, 100);           // Limit length to avoid overly long names
        return name.replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
    } catch (e) {
        // Fallback for invalid URLs
        return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0,100);
    }
}

function generateTeamBasedCollectionName(matchDetails) {
    if (!matchDetails || !matchDetails.match_name) {
        return null; // Return null if no match details available
    }

    const matchName = matchDetails.match_name;
    const timestamp = matchDetails.timestamp;
    
    // Extract team names from match_name with improved parsing
    let team1 = '', team2 = '';
    
    // Try different delimiters and extraction methods
    if (matchName.includes(' vs ')) {
        [team1, team2] = matchName.split(' vs ').map(t => t.trim());
    } else if (matchName.includes(' v ')) {
        [team1, team2] = matchName.split(' v ').map(t => t.trim());
    } else if (matchName.includes(' - ')) {
        [team1, team2] = matchName.split(' - ').map(t => t.trim());
    } else {
        // Try to extract team names from the beginning of the match name
        // Look for common cricket team names (order by length to catch multi-word teams first)
        const knownTeams = [
            'west indies', 'south africa', 'new zealand', 'sri lanka', // Multi-word teams first
            'england', 'india', 'australia', 'pakistan', 'bangladesh',
            'afghanistan', 'ireland', 'scotland', 'netherlands', 'zimbabwe', 
            'nepal', 'oman', 'usa'
        ];
        
        const lowerMatchName = matchName.toLowerCase();
        let foundTeams = [];
        
        // First pass: look for multi-word team names
        for (const team of knownTeams) {
            if (lowerMatchName.includes(team) && !foundTeams.includes(team)) {
                foundTeams.push(team);
                if (foundTeams.length === 2) break;
            }
        }
        
        if (foundTeams.length >= 2) {
            team1 = foundTeams[0];
            team2 = foundTeams[1];
        } else {
            // Fallback: try to extract first two words that look like team names
            const words = matchName.split(' ');
            const teamWords = words.filter(word => 
                word.length > 2 && 
                /^[A-Za-z]+$/.test(word) && 
                !['betting', 'odds', 'cricket', 'match', 'teams', 'twenty', 'parimatch', 'on'].includes(word.toLowerCase())
            );
            
            if (teamWords.length >= 2) {
                team1 = teamWords[0];
                team2 = teamWords[1];
            } else {
                return null;
            }
        }
    }
    
    // Clean and normalize team names - remove spaces and special characters
    team1 = team1.replace(/[^a-zA-Z]/g, '').toLowerCase();
    team2 = team2.replace(/[^a-zA-Z]/g, '').toLowerCase();
    
    // Extract date from timestamp in DDMMYYYY format
    let dateStr = '';
    if (timestamp) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            dateStr = `${day}${month}${year}`; // DDMMYYYY format
        }
    }
    
    if (!dateStr) {
        // Use current date as fallback
        const now = new Date();
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const year = now.getFullYear();
        dateStr = `${day}${month}${year}`;
    }
    
    if (team1 && team2) {
        // Ensure consistent ordering (alphabetical) to avoid duplicate collections
        const [firstTeam, secondTeam] = [team1, team2].sort();
        return `${firstTeam}_${secondTeam}_${dateStr}`;
    }
    
    return null;
}

async function getCollectionForUrl(sourceUrl, matchDetails = null) {
    if (!db) await connectDB();
    
    let collectionName;
    
    // Try to generate team-based collection name first
    const teamBasedName = generateTeamBasedCollectionName(matchDetails);
    
    if (teamBasedName) {
        collectionName = teamBasedName;
        console.log(`   ✓ Using team-based collection name: ${collectionName}`);
    } else {
        // Fallback to URL-based naming
        const dynamicPart = sanitizeUrlForCollectionName(sourceUrl);
        collectionName = `${COLLECTION_PREFIX}${dynamicPart}`;
        console.log(`   ℹ️ Using URL-based collection name: ${collectionName}`);
    }

    if (collectionsCache[collectionName]) {
        return { collection: collectionsCache[collectionName], collectionName };
    }

    const collection = db.collection(collectionName);
    
    // Ensure indexes - good practice to do this when collection is first accessed
    try {
        // Unique index on event_question within this collection
        await collection.createIndex({ event_question: 1 }, { unique: true, name: "event_question_unique_idx" });
        // Index for querying live events, potentially sorted by last seen
        await collection.createIndex({ live: 1, last_seen_at: -1 }, { name: "live_events_idx" });
        // Add index for source_url in case we have mixed naming schemes
        await collection.createIndex({ source_url: 1 }, { name: "source_url_idx" });
        // console.log(`   ✓ Ensured indexes for collection: ${collectionName}`);
    } catch (indexError) {
        // It might fail if index exists with different options, or other reasons.
        // Log it but don't necessarily fail the whole operation if it's a common "index already exists" error.
        if (indexError.codeName !== 'IndexOptionsConflict' && indexError.codeName !== 'IndexAlreadyExists') {
            console.warn(`   ⚠️ Warning ensuring indexes for ${collectionName}:`, indexError.message);
        }
    }
    
    collectionsCache[collectionName] = collection;
    return { collection, collectionName };
}

async function upsertEvent(eventDetails, sourceUrl, matchDetails = null) {
    const { collection, collectionName } = await getCollectionForUrl(sourceUrl, matchDetails);
    if (!collection) throw new Error(`Failed to get collection for URL: ${sourceUrl}`);

    const { 
        event: question, 
        options: currentOptions, 
        group_name: groupName, 
        original_market_title: originalMarketTitle,
        details // This should be an object e.g., { innings, over, player_name, team_name, threshold, type }
    } = eventDetails;

    const filter = { event_question: question }; // event_question is unique within its collection
    const updateDoc = {
        $set: {
            options: currentOptions,
            live: true,
            group_name: groupName,
            details: details || {}, // Ensure details is at least an empty object
            last_seen_at: new Date(),
            last_updated_at: new Date(),
            original_market_title: originalMarketTitle,
            source_url: sourceUrl, // Keep source URL for reference
            collection_name: collectionName // Track which collection this event belongs to
        },
        $setOnInsert: {
            event_question: question,
            first_seen_at: new Date()
        }
    };
    const options = { upsert: true };

    try {
        const result = await collection.updateOne(filter, updateDoc, options);
        return result;
    } catch (error) {
        console.error(`Error upserting event "${question}" in collection "${collectionName}" for URL "${sourceUrl}":`, error.message);
        throw error;
    }
}

async function markOldEventsAsNotLive(currentEventsFromPage, sourceUrl, matchDetails = null) {
    const { collection, collectionName } = await getCollectionForUrl(sourceUrl, matchDetails);
    if (!collection) throw new Error(`Failed to get collection for URL: ${sourceUrl}`);

    const currentEventQuestions = currentEventsFromPage.map(e => e.event);

    const filter = {
        source_url: sourceUrl, // Filter by source URL to ensure we only affect events from this source
        event_question: { $nin: currentEventQuestions }, 
        live: true 
    };
    const updateDoc = {
        $set: {
            live: false,
            last_updated_at: new Date()
        }
    };

    try {
        const result = await collection.updateMany(filter, updateDoc);
        return result;
    } catch (error) {
        console.error(`Error marking old events as not live in collection "${collectionName}" for URL "${sourceUrl}":`, error.message);
        throw error;
    }
}

async function getAllLiveEvents(sourceUrl, matchDetails = null) { // sourceUrl is now mandatory to select the collection
    if (!sourceUrl) {
        console.error('Error: sourceUrl is required to get live events.');
        return []; // Or throw error
    }
    const { collection, collectionName } = await getCollectionForUrl(sourceUrl, matchDetails);
    if (!collection) return []; // Or throw error if collection couldn't be obtained
    
    try {
        const query = { 
            live: true,
            source_url: sourceUrl // Filter by source URL to get events from this specific source
        };
        return await collection.find(query).toArray();
    } catch (error) {
        console.error(`Error fetching live events from collection "${collectionName}" for URL "${sourceUrl}":`, error.message);
        throw error;
    }
}

// Helper function to migrate events from old URL-based collections to new team-based collections
async function migrateOldCollectionToTeamBased(sourceUrl, matchDetails) {
    if (!matchDetails) {
        console.log('   ⚠️ Cannot migrate - no match details provided');
        return false;
    }
    
    const teamBasedName = generateTeamBasedCollectionName(matchDetails);
    if (!teamBasedName) {
        console.log('   ⚠️ Cannot migrate - unable to generate team-based collection name');
        return false;
    }
    
    const oldDynamicPart = sanitizeUrlForCollectionName(sourceUrl);
    const oldCollectionName = `${COLLECTION_PREFIX}${oldDynamicPart}`;
    
    if (oldCollectionName === teamBasedName) {
        console.log('   ℹ️ Collection names are the same, no migration needed');
        return true;
    }
    
    try {
        if (!db) await connectDB();
        
        const oldCollection = db.collection(oldCollectionName);
        const newCollection = db.collection(teamBasedName);
        
        // Check if old collection exists and has documents
        const oldCount = await oldCollection.countDocuments();
        if (oldCount === 0) {
            console.log(`   ℹ️ No documents found in old collection: ${oldCollectionName}`);
            return true;
        }
        
        console.log(`   🔄 Migrating ${oldCount} documents from ${oldCollectionName} to ${teamBasedName}...`);
        
        // Get all documents from old collection
        const documents = await oldCollection.find({}).toArray();
        
        // Update each document to include source_url and collection_name
        const updatedDocuments = documents.map(doc => ({
            ...doc,
            source_url: sourceUrl,
            collection_name: teamBasedName,
            migrated_at: new Date(),
            original_collection: oldCollectionName
        }));
        
        // Insert into new collection (use ordered: false to continue on duplicates)
        if (updatedDocuments.length > 0) {
            try {
                await newCollection.insertMany(updatedDocuments, { ordered: false });
                console.log(`   ✓ Successfully migrated ${updatedDocuments.length} documents`);
            } catch (error) {
                if (error.code === 11000) {
                    // Duplicate key errors are expected for documents that already exist
                    console.log(`   ✓ Migration completed with some duplicates (expected behavior)`);
                } else {
                    throw error;
                }
            }
        }
        
        // Ensure indexes on new collection
        await newCollection.createIndex({ event_question: 1 }, { unique: true, name: "event_question_unique_idx" });
        await newCollection.createIndex({ live: 1, last_seen_at: -1 }, { name: "live_events_idx" });
        await newCollection.createIndex({ source_url: 1 }, { name: "source_url_idx" });
        
        console.log(`   ✓ Migration completed: ${oldCollectionName} → ${teamBasedName}`);
        return true;
        
    } catch (error) {
        console.error(`   ❌ Error migrating collection:`, error.message);
        return false;
    }
}

module.exports = {
    connectDB,
    closeDB,
    upsertEvent,
    markOldEventsAsNotLive,
    getAllLiveEvents,
    getCollectionForUrl, // Exporting for potential direct use or testing
    generateTeamBasedCollectionName, // Export for testing
    migrateOldCollectionToTeamBased // Export for manual migration
}; 