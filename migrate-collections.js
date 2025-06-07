require('dotenv').config();
const dbUtils = require('./db-utils');

/**
 * Migration script to convert old URL-based collection names to team_team_date format
 * 
 * This script helps migrate existing collections from the old naming scheme 
 * (url_parimatchglobal_com_en_events_englandwestindies13348760) 
 * to the new team-based format (england_westindies_20241215)
 */

// Configuration for known matches - add your match details here
const knownMatches = [
    {
        sourceUrl: 'https://parimatchglobal.com/en/events/englandwestindies13348760',
        matchDetails: {
            match_name: 'England vs West Indies',
            timestamp: '2024-12-15T10:00:00.000Z',
            event_id: 'englandwestindies13348760'
        }
    },
    // Add more matches as needed
    // {
    //     sourceUrl: 'https://example.com/match2',
    //     matchDetails: {
    //         match_name: 'Team1 vs Team2',
    //         timestamp: '2024-12-16T14:30:00.000Z',
    //         event_id: 'match2id'
    //     }
    // }
];

async function migrateAllKnownMatches() {
    console.log('🔄 Starting collection migration...');
    console.log(`📋 Found ${knownMatches.length} known matches to process`);
    
    try {
        await dbUtils.connectDB();
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const match of knownMatches) {
            console.log(`\n🏏 Processing: ${match.matchDetails.match_name}`);
            console.log(`   📍 Source URL: ${match.sourceUrl}`);
            
            try {
                const success = await dbUtils.migrateOldCollectionToTeamBased(
                    match.sourceUrl, 
                    match.matchDetails
                );
                
                if (success) {
                    successCount++;
                    console.log(`   ✅ Migration successful`);
                } else {
                    errorCount++;
                    console.log(`   ❌ Migration failed`);
                }
            } catch (error) {
                errorCount++;
                console.error(`   ❌ Migration error:`, error.message);
            }
        }
        
        console.log('\n📊 Migration Summary:');
        console.log(`   ✅ Successful migrations: ${successCount}`);
        console.log(`   ❌ Failed migrations: ${errorCount}`);
        console.log(`   📝 Total processed: ${knownMatches.length}`);
        
    } catch (error) {
        console.error('❌ Error during migration:', error.message);
    } finally {
        await dbUtils.closeDB();
        console.log('\n🏁 Migration process completed');
    }
}

async function listExistingCollections() {
    console.log('📋 Listing existing collections...');
    
    try {
        await dbUtils.connectDB();
        const db = require('mongodb').MongoClient.connect(
            process.env.MONGODB_URI || 'mongodb://localhost:27017'
        ).then(client => client.db(process.env.MONGODB_DB_NAME || 'betting_data'));
        
        const collections = await (await db).listCollections().toArray();
        const urlBasedCollections = collections.filter(col => 
            col.name.startsWith('url_')
        );
        
        console.log(`\n📊 Found ${urlBasedCollections.length} URL-based collections:`);
        urlBasedCollections.forEach((col, index) => {
            console.log(`   ${index + 1}. ${col.name}`);
        });
        
        console.log('\n💡 To migrate these collections:');
        console.log('   1. Add match details to the knownMatches array in this script');
        console.log('   2. Run: node migrate-collections.js migrate');
        
    } catch (error) {
        console.error('❌ Error listing collections:', error.message);
    } finally {
        await dbUtils.closeDB();
    }
}

async function testCollectionNaming() {
    console.log('🧪 Testing collection name generation...');
    
    const testMatches = [
        {
            match_name: 'England vs West Indies',
            timestamp: '2025-06-06T10:00:00.000Z'
        },
        {
            match_name: 'India vs Australia',
            timestamp: '2024-12-16T14:30:00.000Z'
        },
        {
            match_name: 'Pakistan v Sri Lanka',
            timestamp: '2024-12-17T09:00:00.000Z'
        },
        {
            match_name: 'England West Indies betting odds cricket twenty 20 1st match national teams 06/06/2025 on Parimatch',
            timestamp: '2025-06-06T10:00:00.000Z'
        },
        {
            match_name: 'Australia India cricket match betting odds 2024',
            timestamp: '2024-12-16T14:30:00.000Z'
        }
    ];
    
    testMatches.forEach((match, index) => {
        console.log(`\n${index + 1}. Testing: ${match.match_name}`);
        const collectionName = dbUtils.generateTeamBasedCollectionName(match);
        console.log(`   Generated name: ${collectionName || 'Failed to generate'}`);
        console.log(`   Expected format: teamname_teamname_DDMMYYYY`);
    });
}

// Command line interface
const command = process.argv[2];

switch (command) {
    case 'migrate':
        migrateAllKnownMatches();
        break;
    case 'list':
        listExistingCollections();
        break;
    case 'test':
        testCollectionNaming();
        break;
    default:
        console.log('📚 MongoDB Collection Migration Tool');
        console.log('\nUsage:');
        console.log('  node migrate-collections.js list     # List existing URL-based collections');
        console.log('  node migrate-collections.js test     # Test collection name generation');
        console.log('  node migrate-collections.js migrate  # Run migration for known matches');
        console.log('\n💡 Before migrating:');
        console.log('  1. Update the knownMatches array with your match details');
        console.log('  2. Test with "node migrate-collections.js test"');
        console.log('  3. List existing collections with "node migrate-collections.js list"');
        console.log('  4. Run migration with "node migrate-collections.js migrate"');
        break;
} 