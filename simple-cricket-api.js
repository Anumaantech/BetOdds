const express = require('express');
const cors = require('cors');
const dbUtils = require('./db-utils');

const app = express();
const PORT = process.env.PORT || 3005;

// Enable CORS
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper function to get all cricket collections from database
async function getAllCricketCollections() {
  try {
    const db = await dbUtils.connectDB();
    const collections = await db.listCollections().toArray();
    
    // Filter for cricket-related collections
    const cricketCollections = collections.filter(collection => {
      const name = collection.name;
      return name.includes('_') && !name.startsWith('system.') && name !== 'admin';
    });
    
    return cricketCollections.map(collection => ({
      id: collection.name,
      name: collection.name
    }));
  } catch (error) {
    console.error('Error fetching cricket collections:', error);
    throw error;
  }
}

// GET /api/sport/cricket - Get all cricket collections/IDs with basic info
app.get('/api/sport/cricket', async (req, res) => {
  try {
    console.log('📥 GET /api/sport/cricket - Fetching all cricket collections');
    
    const collections = await getAllCricketCollections();
    console.log(`Found ${collections.length} collections`);
    
    // Get basic info for each collection
    const collectionsWithInfo = await Promise.all(
      collections.map(async (collection) => {
        try {
          const db = await dbUtils.connectDB();
          const coll = db.collection(collection.id);
          
          // Get count of total events and live events
          const totalEvents = await coll.countDocuments();
          const liveEvents = await coll.countDocuments({ live: true });
          
          // Get latest event to extract match info
          const latestEvent = await coll.findOne(
            {},
            { sort: { last_seen_at: -1 } }
          );
          
          console.log(`  Collection ${collection.id}: ${totalEvents} total, ${liveEvents} live`);
          
          return {
            id: collection.id,
            name: collection.name,
            totalEvents,
            liveEvents,
            lastActivity: latestEvent?.last_seen_at || null,
            matchInfo: latestEvent ? {
              sourceUrl: latestEvent.source_url,
              collectionName: latestEvent.collection_name
            } : null
          };
        } catch (error) {
          console.error(`Error getting info for collection ${collection.id}:`, error);
          return {
            id: collection.id,
            name: collection.name,
            totalEvents: 0,
            liveEvents: 0,
            lastActivity: null,
            matchInfo: null,
            error: error.message
          };
        }
      })
    );
    
    const response = {
      success: true,
      data: {
        totalCollections: collectionsWithInfo.length,
        collections: collectionsWithInfo
      }
    };
    
    console.log('✅ Sending response with', collectionsWithInfo.length, 'collections');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error in GET /api/sport/cricket:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cricket collections'
    });
  }
});

// GET /api/sport/cricket/:id - Get specific cricket events from a collection
app.get('/api/sport/cricket/:id', async (req, res) => {
  const { id } = req.params;
  const { live, limit } = req.query;
  
  try {
    console.log(`📥 GET /api/sport/cricket/${id} - Fetching events from collection`);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Collection ID is required'
      });
    }
    
    const db = await dbUtils.connectDB();
    const collection = db.collection(id);
    
    // Check if collection exists
    const collectionExists = await db.listCollections({ name: id }).toArray();
    if (collectionExists.length === 0) {
      console.log(`❌ Collection ${id} not found`);
      return res.status(404).json({
        success: false,
        error: `Collection with ID '${id}' not found`
      });
    }
    
    // Build query based on parameters
    let query = {};
    if (live === 'true') {
      query.live = true;
      console.log('🔴 Filtering for live events only');
    }
    
    // Get events with optional limit
    const eventsQuery = collection.find(query).sort({ last_seen_at: -1 });
    if (limit && !isNaN(parseInt(limit))) {
      eventsQuery.limit(parseInt(limit));
      console.log(`📋 Limiting to ${limit} events`);
    }
    
    const events = await eventsQuery.toArray();
    
    // Get collection stats
    const totalEvents = await collection.countDocuments();
    const liveEvents = await collection.countDocuments({ live: true });
    
    console.log(`✅ Found ${events.length} events (${totalEvents} total, ${liveEvents} live)`);
    
    res.json({
      success: true,
      data: {
        collectionId: id,
        totalEvents,
        liveEvents,
        returnedEvents: events.length,
        events: events.map(event => ({
          id: event._id,
          eventQuestion: event.event_question,
          options: event.options,
          live: event.live,
          groupName: event.group_name,
          details: event.details || {},
          lastSeenAt: event.last_seen_at,
          lastUpdatedAt: event.last_updated_at,
          firstSeenAt: event.first_seen_at,
          originalMarketTitle: event.original_market_title,
          sourceUrl: event.source_url,
          collectionName: event.collection_name
        }))
      }
    });
    
  } catch (error) {
    console.error(`❌ Error in GET /api/sport/cricket/${id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cricket events'
    });
  }
});

// Start server
console.log('🚀 Starting Simple Cricket API Server...');

app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🏏 Cricket API: http://localhost:${PORT}/api/sport/cricket`);
  
  // Test MongoDB connection on startup
  try {
    const db = await dbUtils.connectDB();
    console.log('✅ MongoDB connection successful');
    
    // List collections for debugging
    const collections = await db.listCollections().toArray();
    console.log(`📂 Found ${collections.length} MongoDB collections`);
    
    const cricketCollections = collections.filter(collection => {
      const name = collection.name;
      return name.includes('_') && !name.startsWith('system.') && name !== 'admin';
    });
    console.log(`🏏 Found ${cricketCollections.length} cricket collections`);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('Note: Cricket data endpoints will not work without MongoDB connection');
  }
  
  console.log('\n🎯 Ready to serve cricket data!');
});

// Error handling
process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await dbUtils.closeDB();
  process.exit(0);
}); 