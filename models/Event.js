const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  // Event identification
  eventId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Event details
  event: {
    type: String,
    required: true
  },
  
  // Odds
  options: {
    Yes: {
      type: Number,
      required: true
    },
    No: {
      type: Number,
      required: true
    }
  },
  
  // Sport and match information
  sport: {
    type: String,
    required: true,
    enum: ['cricket', 'tennis', 'basketball', 'soccer']
  },
  
  matchName: {
    type: String,
    required: true
  },
  
  matchId: {
    type: String,
    required: true
  },
  
  // Event categorization
  eventGroup: {
    type: String,
    required: true,
    enum: ['match_level', 'over_specific', 'player_props', 'dismissal_events', 'other_events']
  },
  
  eventType: {
    type: String,
    required: true
  },
  
  // Team/player information
  team1: {
    type: String
  },
  
  team2: {
    type: String
  },
  
  playerName: {
    type: String
  },
  
  // Context information
  innings: {
    type: String
  },
  
  over: {
    type: String
  },
  
  setNumber: {
    type: String
  },
  
  period: {
    type: String
  },
  
  threshold: {
    type: String
  },
  
  handicap: {
    type: String
  },
  
  // Market information
  originalMarketTitle: {
    type: String,
    required: true
  },
  
  marketType: {
    type: String,
    enum: ['2-way', '3-way', '3-way_to_2-way', 'over_under', 'yes_no']
  },
  
  drawRedistributed: {
    type: Boolean,
    default: false
  },
  
  // Processing metadata
  extractedAt: {
    type: Date,
    default: Date.now
  },
  
  processedAt: {
    type: Date,
    default: Date.now
  },
  
  dataSource: {
    type: String,
    default: '1xbet'
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Additional metadata
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 1.0
  },
  
  tags: [{
    type: String
  }]
}, {
  timestamps: true,
  collection: 'betting_events'
});

// Indexes for better query performance
EventSchema.index({ sport: 1, matchName: 1 });
EventSchema.index({ eventGroup: 1, eventType: 1 });
EventSchema.index({ extractedAt: -1 });
EventSchema.index({ matchId: 1 });
EventSchema.index({ team1: 1, team2: 1 });
EventSchema.index({ isActive: 1 });

// Virtual for odds calculation
EventSchema.virtual('totalProbability').get(function() {
  return (1 / this.options.Yes * 10) + (1 / this.options.No * 10);
});

// Static methods
EventSchema.statics.findByMatch = function(matchName, sport) {
  return this.find({ 
    matchName: new RegExp(matchName, 'i'),
    sport: sport,
    isActive: true 
  }).sort({ extractedAt: -1 });
};

EventSchema.statics.findBySport = function(sport, limit = 100) {
  return this.find({ 
    sport: sport,
    isActive: true 
  })
  .sort({ extractedAt: -1 })
  .limit(limit);
};

EventSchema.statics.findByEventGroup = function(eventGroup, limit = 100) {
  return this.find({ 
    eventGroup: eventGroup,
    isActive: true 
  })
  .sort({ extractedAt: -1 })
  .limit(limit);
};

// Instance methods
EventSchema.methods.getFormattedOdds = function() {
  return {
    yes: this.options.Yes,
    no: this.options.No,
    yesImpliedProb: (1 / (this.options.Yes / 10) * 100).toFixed(2) + '%',
    noImpliedProb: (1 / (this.options.No / 10) * 100).toFixed(2) + '%'
  };
};

module.exports = mongoose.model('Event', EventSchema); 