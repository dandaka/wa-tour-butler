/**
 * CSV Reader Tests
 * 
 * This test suite verifies that the CSV reader correctly parses group information,
 * with special attention to quoted fields, comma-separated values, and batches.
 */

import fs from 'fs';
import path from 'path';
import { readGroupsFromCsv, findGroupInCsv } from '../utils/csv-reader';
import { GroupInfo } from '../types/signups';

// Test directory paths
const TEST_DIR = path.join(process.cwd(), 'data', 'test-data');
const TEST_CSV_PATH = path.join(TEST_DIR, 'test-groups.csv');

// Create a temporary CSV file for testing
function createTestCsv(content: string) {
  fs.writeFileSync(TEST_CSV_PATH, content, 'utf8');
  console.log(`Created test CSV file at: ${TEST_CSV_PATH}`);
}

// Delete the test CSV file
function deleteTestCsv() {
  if (fs.existsSync(TEST_CSV_PATH)) {
    fs.unlinkSync(TEST_CSV_PATH);
    console.log(`Deleted test CSV file: ${TEST_CSV_PATH}`);
  }
}

// Test suite
function runTests() {
  console.log('Running CSV reader tests...\n');
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Simple CSV with no quotes
    console.log('Test 1: Simple CSV with no quotes');
    const simpleCSV = 
`ID,Name,Admin,TournamentTime,SignupStartTime,MaxTeams,Batches
group1,Group 1,admin1,,0 15 * * 1,8,15:00
group2,Group 2,admin2,,0 16 * * 2,10,16:00`;
    
    createTestCsv(simpleCSV);
    const simpleGroups = readGroupsFromCsv(TEST_CSV_PATH);
    
    if (simpleGroups.length === 2) {
      console.log('✅ Found 2 groups');
      testsPassed++;
    } else {
      console.error(`❌ Expected 2 groups, found ${simpleGroups.length}`);
      testsFailed++;
    }
    
    const group1 = simpleGroups[0];
    if (group1.batches && group1.batches.length === 1 && group1.batches[0] === '15:00') {
      console.log('✅ Batches parsed correctly for group1');
      testsPassed++;
    } else {
      console.error(`❌ Incorrect batches for group1: ${JSON.stringify(group1.batches)}`);
      testsFailed++;
    }
    console.log();
    
    // Test 2: CSV with quoted fields
    console.log('Test 2: CSV with quoted fields');
    const quotedCSV = 
`ID,Name,Admin,TournamentTime,SignupStartTime,MaxTeams,Batches
"group1","Group, with comma",admin1,,"0 15 * * 1",8,"15:00"
"group2","Group 2",admin2,,"0 16 * * 2",10,"16:00"`;
    
    createTestCsv(quotedCSV);
    const quotedGroups = readGroupsFromCsv(TEST_CSV_PATH);
    
    if (quotedGroups[0].name === 'Group, with comma') {
      console.log('✅ Quoted field with comma parsed correctly');
      testsPassed++;
    } else {
      console.error(`❌ Failed to parse quoted field with comma: ${quotedGroups[0].name}`);
      testsFailed++;
    }
    console.log();
    
    // Test 3: CSV with quoted batches containing commas
    console.log('Test 3: CSV with quoted batches containing commas');
    const batchesCSV = 
`ID,Name,Admin,TournamentTime,SignupStartTime,MaxTeams,Batches
group1,Group 1,admin1,,"0 15 * * 1",8,"15:00,16:00"
group2,Group 2,admin2,,"0 16 * * 2",10,"17:00,18:30,20:00"`;
    
    createTestCsv(batchesCSV);
    const batchesGroups = readGroupsFromCsv(TEST_CSV_PATH);
    
    if (batchesGroups[0].batches && batchesGroups[0].batches.length === 2) {
      console.log('✅ Found 2 batches for group1');
      testsPassed++;
    } else {
      console.error(`❌ Expected 2 batches for group1, found ${batchesGroups[0].batches?.length}`);
      testsFailed++;
    }
    
    if (batchesGroups[1].batches && batchesGroups[1].batches.length === 3) {
      console.log('✅ Found 3 batches for group2');
      testsPassed++;
    } else {
      console.error(`❌ Expected 3 batches for group2, found ${batchesGroups[1].batches?.length}`);
      testsFailed++;
    }
    
    if (batchesGroups[1].batches && 
        batchesGroups[1].batches[0] === '17:00' && 
        batchesGroups[1].batches[1] === '18:30' && 
        batchesGroups[1].batches[2] === '20:00') {
      console.log('✅ Batch values parsed correctly for group2');
      testsPassed++;
    } else {
      console.error(`❌ Incorrect batch values for group2: ${JSON.stringify(batchesGroups[1].batches)}`);
      testsFailed++;
    }
    console.log();
    
    // Test 4: CSV with missing values
    console.log('Test 4: CSV with missing values');
    const missingValuesCSV = 
`ID,Name,Admin,TournamentTime,SignupStartTime,MaxTeams,Batches
group1,Group 1,admin1,,"0 15 * * 1",,
group2,Group 2,admin2,,"0 16 * * 2",10,`;
    
    createTestCsv(missingValuesCSV);
    const missingValuesGroups = readGroupsFromCsv(TEST_CSV_PATH);
    
    if (!missingValuesGroups[0].batches) {
      console.log('✅ Correctly handled missing batches field');
      testsPassed++;
    } else {
      console.error(`❌ Expected undefined batches, found ${JSON.stringify(missingValuesGroups[0].batches)}`);
      testsFailed++;
    }
    
    if (!missingValuesGroups[0].maxTeams) {
      console.log('✅ Correctly handled missing maxTeams field');
      testsPassed++;
    } else {
      console.error(`❌ Expected undefined maxTeams, found ${missingValuesGroups[0].maxTeams}`);
      testsFailed++;
    }
    console.log();
    
    // Test 5: Find group in CSV
    console.log('Test 5: Find group in CSV');
    const findGroupCSV = 
`ID,Name,Admin,TournamentTime,SignupStartTime,MaxTeams,Batches
group1,Group 1,admin1,,"0 15 * * 1",8,"15:00,16:00"
group2,Group 2,admin2,,"0 16 * * 2",10,"17:00,18:30"
group3,Group 3,admin3,,"0 17 * * 3",12,"19:00,20:30"`;
    
    createTestCsv(findGroupCSV);
    
    const foundGroup = findGroupInCsv('group2', TEST_CSV_PATH);
    
    if (foundGroup && foundGroup.name === 'Group 2') {
      console.log('✅ Found correct group by ID');
      testsPassed++;
    } else {
      console.error(`❌ Failed to find group or incorrect group found: ${JSON.stringify(foundGroup)}`);
      testsFailed++;
    }
    
    const notFoundGroup = findGroupInCsv('non-existent', TEST_CSV_PATH);
    
    if (!notFoundGroup) {
      console.log('✅ Correctly returned null for non-existent group');
      testsPassed++;
    } else {
      console.error(`❌ Expected null for non-existent group, found ${JSON.stringify(notFoundGroup)}`);
      testsFailed++;
    }
    console.log();
    
    // Test 6: Real groups.csv format
    console.log('Test 6: Real groups.csv format');
    const realFormatCSV = 
`ID,Name,Admin,TournamentTime,SignupStartTime,MaxTeams,Batches
351915435544-1593092500@g.us,Sao Bento Mix,351936836204,,"0 19 * * 1",14,
120363028202164779@g.us,Sao Bento P4ALL Saturday,351936836204,,"0 19 * * 1",14,"15:00,17:00"
351919755889-1528547030@g.us,Kia4all - 6ªf - 19h - M3,351916949231,,"0 16 * * 1",8,`;
    
    createTestCsv(realFormatCSV);
    const realGroups = readGroupsFromCsv(TEST_CSV_PATH);
    
    const targetGroup = realGroups.find(g => g.id === '120363028202164779@g.us');
    
    if (targetGroup && 
        targetGroup.batches && 
        targetGroup.batches.length === 2 && 
        targetGroup.batches[0] === '15:00' && 
        targetGroup.batches[1] === '17:00') {
      console.log('✅ Correctly parsed actual groups.csv format with batches');
      testsPassed++;
    } else {
      console.error(`❌ Failed to parse actual groups.csv format: ${JSON.stringify(targetGroup?.batches)}`);
      testsFailed++;
    }
    
  } catch (error) {
    console.error(`Error running tests: ${error}`);
    testsFailed++;
  } finally {
    deleteTestCsv();
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log(`Total tests: ${testsPassed + testsFailed}`);
  
  return testsFailed === 0;
}

// Run the tests
const allTestsPassed = runTests();

// Exit with appropriate status code
process.exit(allTestsPassed ? 0 : 1);
