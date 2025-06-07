/**
 * Test MongoDB Collection Naming Function
 * 
 * This script tests the generateTeamBasedCollectionName function
 * to ensure it produces the correct format: teamname_teamname_DDMMYYYY
 */

const dbUtils = require('./db-utils');

console.log('🧪 Testing MongoDB Collection Name Generation');
console.log('═══════════════════════════════════════════════════════════════');

const testCases = [
    // Standard formats
    {
        name: 'Standard vs format',
        match_name: 'England vs West Indies',
        timestamp: '2025-06-06T10:00:00.000Z',
        expected: 'england_westindies_06062025'
    },
    {
        name: 'Standard v format',
        match_name: 'India v Australia',
        timestamp: '2024-12-16T14:30:00.000Z',
        expected: 'australia_india_16122024'
    },
    {
        name: 'Dash format',
        match_name: 'Pakistan - Sri Lanka',
        timestamp: '2024-12-17T09:00:00.000Z',
        expected: 'pakistan_srilanka_17122024'
    },
    // Complex formats (like your current issue)
    {
        name: 'Complex betting format',
        match_name: 'England West Indies betting odds cricket twenty 20 1st match national teams 06/06/2025 on Parimatch',
        timestamp: '2025-06-06T10:00:00.000Z',
        expected: 'england_westindies_06062025'
    },
    {
        name: 'Another complex format',
        match_name: 'Australia India cricket match betting odds live streaming 2024',
        timestamp: '2024-12-16T14:30:00.000Z',
        expected: 'australia_india_16122024'
    },
    {
        name: 'With team keywords',
        match_name: 'New Zealand South Africa teams match cricket betting',
        timestamp: '2024-12-18T11:00:00.000Z',
        expected: 'newzealand_southafrica_18122024'
    }
];

console.log('Running test cases...\n');

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
    console.log(`${index + 1}. ${testCase.name}`);
    console.log(`   Input: "${testCase.match_name}"`);
    console.log(`   Date: ${testCase.timestamp}`);
    
    const result = dbUtils.generateTeamBasedCollectionName({
        match_name: testCase.match_name,
        timestamp: testCase.timestamp
    });
    
    console.log(`   Generated: ${result || 'NULL'}`);
    console.log(`   Expected:  ${testCase.expected}`);
    
    if (result === testCase.expected) {
        console.log(`   ✅ PASS`);
        passed++;
    } else {
        console.log(`   ❌ FAIL`);
        failed++;
    }
    console.log('');
});

console.log('═══════════════════════════════════════════════════════════════');
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('🎉 All tests passed! Collection naming is working correctly.');
} else {
    console.log('⚠️ Some tests failed. Check the function implementation.');
}

// Test edge cases
console.log('\n🔍 Testing edge cases...');

const edgeCases = [
    { match_name: '', timestamp: '2025-06-06T10:00:00.000Z' },
    { match_name: 'Single Team Name', timestamp: '2025-06-06T10:00:00.000Z' },
    { match_name: 'betting odds cricket match', timestamp: '2025-06-06T10:00:00.000Z' },
    { match_name: 'England vs West Indies', timestamp: null },
    { match_name: 'England vs West Indies', timestamp: 'invalid-date' }
];

edgeCases.forEach((edge, index) => {
    console.log(`Edge case ${index + 1}: "${edge.match_name}"`);
    const result = dbUtils.generateTeamBasedCollectionName(edge);
    console.log(`   Result: ${result || 'NULL (fallback to URL-based naming)'}`);
});

console.log('\n💡 If any edge cases return NULL, the system will fallback to URL-based naming.'); 