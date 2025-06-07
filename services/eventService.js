const Event = require('../models/Event');
const { v4: uuidv4 } = require('uuid');

class EventService {
  constructor() {
    this.batchSize = 100; // Process events in batches
  }

  /**
   * Save events to MongoDB
   * @param {Array} events - Array of event objects
   * @param {Object} matchInfo - Match information
   * @param {String} sport - Sport type
   * @returns {Object} Save results
   */
  async saveEvents(events, matchInfo, sport) {
    try {
      console.log(`📊 Saving ${events.length} events to database...`);
      
      const savedEvents = [];
      const errors = [];
      const duplicates = [];

      // Process events in batches
      for (let i = 0; i < events.length; i += this.batchSize) {
        const batch = events.slice(i, i + this.batchSize);
        
        for (const eventData of batch) {
          try {
            // Create unique event ID based on content
            const eventContent = this.normalizeEventContent(eventData.event);
            const eventId = this.generateEventId(sport, matchInfo.matchId, eventContent);

            // Check if event already exists
            const existingEvent = await Event.findOne({ eventId });
            
            if (existingEvent) {
              // Update existing event with latest data
              existingEvent.options = eventData.options;
              existingEvent.processedAt = new Date();
              await existingEvent.save();
              duplicates.push(eventId);
              continue;
            }

            // Create new event
            const event = new Event({
              eventId,
              event: eventData.event,
              options: eventData.options,
              sport,
              matchName: matchInfo.matchName,
              matchId: matchInfo.matchId,
              eventGroup: this.determineEventGroup(eventData),
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
              processedAt: new Date(),
              tags: this.generateTags(eventData, sport)
            });

            const savedEvent = await event.save();
            savedEvents.push(savedEvent.eventId);
            
          } catch (error) {
            console.error(`❌ Error saving event: ${eventData.event}`, error.message);
            errors.push({
              event: eventData.event,
              error: error.message
            });
          }
        }
      }

      const result = {
        success: true,
        saved: savedEvents.length,
        updated: duplicates.length,
        errors: errors.length,
        total: events.length,
        details: {
          savedEventIds: savedEvents,
          duplicateEventIds: duplicates,
          errors
        }
      };

      console.log(`✅ Database save completed:`, {
        saved: result.saved,
        updated: result.updated,
        errors: result.errors,
        total: result.total
      });

      return result;

    } catch (error) {
      console.error('❌ Critical error in saveEvents:', error);
      return {
        success: false,
        error: error.message,
        saved: 0,
        updated: 0,
        errors: events.length
      };
    }
  }

  /**
   * Generate unique event ID
   */
  generateEventId(sport, matchId, eventContent) {
    const timestamp = Date.now();
    const hash = this.simpleHash(eventContent);
    return `${sport}_${matchId}_${hash}_${timestamp}`;
  }

  /**
   * Simple hash function for content
   */
  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Normalize event content for comparison
   */
  normalizeEventContent(eventText) {
    return eventText
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Determine event group from event data
   */
  determineEventGroup(eventData) {
    if (eventData.group) return eventData.group;
    
    const event = eventData.event.toLowerCase();
    
    if (event.includes('win the match') || event.includes('toss')) {
      return 'match_level';
    } else if (event.includes('over #') || event.includes('delivery')) {
      return 'over_specific';
    } else if (event.includes('dismissal') || event.includes('caught')) {
      return 'dismissal_events';
    } else if (eventData.player_name || event.includes('sabalenka') || event.includes('gauff')) {
      return 'player_props';
    } else {
      return 'other_events';
    }
  }

  /**
   * Generate tags for better categorization
   */
  generateTags(eventData, sport) {
    const tags = [sport];
    
    const event = eventData.event.toLowerCase();
    
    // Add type-based tags
    if (event.includes('over ')) tags.push('over_under');
    if (event.includes('win')) tags.push('winner');
    if (event.includes('handicap')) tags.push('handicap');
    if (event.includes('total')) tags.push('total');
    if (event.includes('set ')) tags.push('set_specific');
    if (event.includes('quarter') || event.includes('half')) tags.push('period_specific');
    if (eventData.draw_redistributed) tags.push('3way_converted');
    
    // Add team tags
    if (eventData.team1) tags.push(`team_${eventData.team1.toLowerCase().replace(/\s+/g, '_')}`);
    if (eventData.team2) tags.push(`team_${eventData.team2.toLowerCase().replace(/\s+/g, '_')}`);
    
    return tags;
  }

  /**
   * Get events by criteria
   */
  async getEvents(criteria = {}, options = {}) {
    try {
      const query = { isActive: true, ...criteria };
      const sort = options.sort || { extractedAt: -1 };
      const limit = options.limit || 100;
      const skip = options.skip || 0;

      const events = await Event.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      return {
        success: true,
        count: events.length,
        data: events
      };
    } catch (error) {
      console.error('❌ Error fetching events:', error);
      return {
        success: false,
        error: error.message,
        count: 0,
        data: []
      };
    }
  }

  /**
   * Deactivate old events (for cleanup)
   */
  async deactivateOldEvents(daysOld = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Event.updateMany(
        { 
          extractedAt: { $lt: cutoffDate },
          isActive: true 
        },
        { 
          isActive: false,
          deactivatedAt: new Date()
        }
      );

      console.log(`🧹 Deactivated ${result.modifiedCount} old events older than ${daysOld} days`);
      return result;
    } catch (error) {
      console.error('❌ Error deactivating old events:', error);
      return { modifiedCount: 0 };
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const [
        totalEvents,
        activeEvents,
        sportStats,
        groupStats,
        recentEvents
      ] = await Promise.all([
        Event.countDocuments(),
        Event.countDocuments({ isActive: true }),
        Event.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$sport', count: { $sum: 1 } } }
        ]),
        Event.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$eventGroup', count: { $sum: 1 } } }
        ]),
        Event.countDocuments({
          isActive: true,
          extractedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      return {
        totalEvents,
        activeEvents,
        inactiveEvents: totalEvents - activeEvents,
        recentEvents,
        sportDistribution: sportStats,
        groupDistribution: groupStats
      };
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      return null;
    }
  }
}

module.exports = new EventService(); 