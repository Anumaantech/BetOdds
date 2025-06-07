const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const connectDB = require('./config/database');
const Event = require('./models/Event');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Gzip compression
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes

// Get all events with pagination and filtering
app.get('/api/events', async (req, res) => {
  try {
    const {
      sport,
      eventGroup,
      eventType,
      matchName,
      page = 1,
      limit = 50,
      sortBy = 'extractedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { isActive: true };
    
    // Add filters
    if (sport) query.sport = sport;
    if (eventGroup) query.eventGroup = eventGroup;
    if (eventType) query.eventType = eventType;
    if (matchName) query.matchName = new RegExp(matchName, 'i');

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const events = await Event.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Event.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: events,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalEvents: total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events',
      message: error.message
    });
  }
});

// Get events by sport
app.get('/api/events/sport/:sport', async (req, res) => {
  try {
    const { sport } = req.params;
    const { limit = 100 } = req.query;

    if (!['cricket', 'tennis', 'basketball', 'soccer'].includes(sport)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sport. Must be cricket, tennis, basketball, or soccer'
      });
    }

    const events = await Event.findBySport(sport, parseInt(limit));
    
    res.json({
      success: true,
      sport,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events by sport:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events by sport',
      message: error.message
    });
  }
});

// Get events by match
app.get('/api/events/match/:matchName', async (req, res) => {
  try {
    const { matchName } = req.params;
    const { sport } = req.query;

    const events = await Event.findByMatch(matchName, sport);
    
    res.json({
      success: true,
      matchName,
      sport: sport || 'all',
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events by match:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events by match',
      message: error.message
    });
  }
});

// Get events by event group
app.get('/api/events/group/:eventGroup', async (req, res) => {
  try {
    const { eventGroup } = req.params;
    const { limit = 100 } = req.query;

    const validGroups = ['match_level', 'over_specific', 'player_props', 'dismissal_events', 'other_events'];
    if (!validGroups.includes(eventGroup)) {
      return res.status(400).json({
        success: false,
        error: `Invalid event group. Must be one of: ${validGroups.join(', ')}`
      });
    }

    const events = await Event.findByEventGroup(eventGroup, parseInt(limit));
    
    res.json({
      success: true,
      eventGroup,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events by group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events by group',
      message: error.message
    });
  }
});

// Get single event by ID
app.get('/api/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const event = await Event.findOne({ 
      $or: [
        { eventId: eventId },
        { _id: eventId }
      ],
      isActive: true 
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event',
      message: error.message
    });
  }
});

// Get event statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await Promise.all([
      Event.countDocuments({ isActive: true }),
      Event.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$sport', count: { $sum: 1 } } }
      ]),
      Event.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$eventGroup', count: { $sum: 1 } } }
      ]),
      Event.find({ isActive: true }).sort({ extractedAt: -1 }).limit(1)
    ]);

    const [totalEvents, sportStats, groupStats, latestEvent] = stats;

    res.json({
      success: true,
      statistics: {
        totalEvents,
        eventsBySport: sportStats,
        eventsByGroup: groupStats,
        latestEventTime: latestEvent[0]?.extractedAt || null
      }
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

// Internal API for saving events (used by the processing system)
app.post('/api/events/save', async (req, res) => {
  try {
    const { events, matchInfo, sport } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        error: 'Events array is required'
      });
    }

    const savedEvents = [];
    const errors = [];

    for (const eventData of events) {
      try {
        // Create unique event ID
        const eventId = `${sport}_${matchInfo.matchId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const event = new Event({
          eventId,
          event: eventData.event,
          options: eventData.options,
          sport,
          matchName: matchInfo.matchName,
          matchId: matchInfo.matchId,
          eventGroup: eventData.group || 'other_events',
          eventType: eventData.type || 'unknown',
          team1: eventData.team1,
          team2: eventData.team2,
          playerName: eventData.player_name,
          innings: eventData.innings,
          over: eventData.over,
          setNumber: eventData.set_number,
          period: eventData.period,
          threshold: eventData.threshold,
          handicap: eventData.handicap,
          originalMarketTitle: eventData.original_market_title,
          marketType: eventData.market_type,
          drawRedistributed: eventData.draw_redistributed || false,
          extractedAt: new Date(),
          processedAt: new Date()
        });

        const savedEvent = await event.save();
        savedEvents.push(savedEvent);
      } catch (error) {
        errors.push({
          event: eventData.event,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      saved: savedEvents.length,
      errors: errors.length,
      data: {
        savedEvents: savedEvents.map(e => e.eventId),
        errors
      }
    });
  } catch (error) {
    console.error('Error saving events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save events',
      message: error.message
    });
  }
});

// Get available filters/options
app.get('/api/filters', async (req, res) => {
  try {
    const [sports, eventGroups, eventTypes] = await Promise.all([
      Event.distinct('sport', { isActive: true }),
      Event.distinct('eventGroup', { isActive: true }),
      Event.distinct('eventType', { isActive: true })
    ]);

    res.json({
      success: true,
      filters: {
        sports,
        eventGroups,
        eventTypes
      }
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filters',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/events',
      'GET /api/events/sport/:sport',
      'GET /api/events/match/:matchName',
      'GET /api/events/group/:eventGroup',
      'GET /api/events/:eventId',
      'GET /api/stats',
      'POST /api/events/save',
      'GET /api/filters'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 API Base URL: http://localhost:${PORT}/api`);
  console.log(`📊 Health Check: http://localhost:${PORT}/health`);
}); 