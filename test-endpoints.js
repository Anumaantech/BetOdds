const dbUtils = require('./db-utils');

async function testMongoConnection() {
  try {
    console.log('Testing MongoDB connection...');
    const db = await dbUtils.connectDB();
    console.log('✓ MongoDB connection successful');
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('Available collections:');
    collections.forEach(coll => {
      console.log(`  - ${coll.name}`);
    });
    
    // Filter cricket collections
    const cricketCollections = collections.filter(collection => {
      const name = collection.name;
      return name.includes('_') && !name.startsWith('system.') && name !== 'admin';
    });
    
    console.log(`\nFound ${cricketCollections.length} cricket collections:`);
    cricketCollections.forEach(coll => {
      console.log(`  - ${coll.name}`);
    });
    
    // Test getting data from first collection if exists
    if (cricketCollections.length > 0) {
      const firstCollection = cricketCollections[0].name;
      console.log(`\nTesting data from collection: ${firstCollection}`);
      
      const collection = db.collection(firstCollection);
      const totalEvents = await collection.countDocuments();
      const liveEvents = await collection.countDocuments({ live: true });
      
      console.log(`  Total events: ${totalEvents}`);
      console.log(`  Live events: ${liveEvents}`);
      
      // Get sample events
      const sampleEvents = await collection.find({}).limit(3).toArray();
      console.log(`  Sample events:`);
      sampleEvents.forEach((event, index) => {
        console.log(`    ${index + 1}. ${event.event_question} (live: ${event.live})`);
      });
    }
    
    await dbUtils.closeDB();
    console.log('\n✓ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Error testing MongoDB:', error.message);
    console.error('Full error:', error);
  }
}

testMongoConnection(); 