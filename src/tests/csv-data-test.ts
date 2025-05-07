/**
 * CSV Data Test
 * 
 * This test verifies that data specified in groups.csv is correctly
 * included in the result.json file after processing.
 */

import fs from 'fs';
import path from 'path';
import { findGroupInCsv } from '../utils/csv-reader';

// Paths
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const RESULT_JSON_PATH = path.join(TEST_DATA_DIR, 'result.json');
const GROUPS_CSV_PATH = path.join(process.cwd(), 'groups.csv');

/**
 * Verify that group metadata from CSV is included in result.json
 */
function testCsvDataInResult() {
  console.log('Testing CSV data inclusion in result.json...');
  
  try {
    // Read result.json
    const resultData = JSON.parse(fs.readFileSync(RESULT_JSON_PATH, 'utf8'));
    
    // Get group ID from result
    const groupId = resultData.groupInfo.id;
    console.log(`Group ID in result.json: ${groupId}`);
    
    // Find corresponding group in CSV
    const csvGroup = findGroupInCsv(groupId, GROUPS_CSV_PATH);
    
    if (!csvGroup) {
      console.error(`❌ Group ${groupId} not found in groups.csv!`);
      return false;
    }
    
    console.log(`Found group in CSV: ${csvGroup.name}`);
    
    // Verify group data is in result.json
    let allChecksPass = true;
    
    // Check group info matches
    if (resultData.groupInfo.name !== csvGroup.name) {
      console.error(`❌ Group name mismatch: ${resultData.groupInfo.name} vs ${csvGroup.name}`);
      allChecksPass = false;
    }
    
    if (resultData.groupInfo.admin !== csvGroup.admin) {
      console.error(`❌ Group admin mismatch: ${resultData.groupInfo.admin} vs ${csvGroup.admin}`);
      allChecksPass = false;
    }
    
    // Check metadata
    if (!resultData.metadata) {
      console.error('❌ Metadata section missing in result.json');
      allChecksPass = false;
    } else {
      // Check maxTeams
      if (csvGroup.maxTeams && resultData.metadata.maxTeams !== csvGroup.maxTeams) {
        console.error(`❌ maxTeams mismatch: ${resultData.metadata.maxTeams} vs ${csvGroup.maxTeams}`);
        allChecksPass = false;
      }
      
      // Check batches
      if (csvGroup.batches) {
        if (!resultData.metadata.batches || resultData.metadata.batches.length === 0) {
          console.error('❌ Batches missing in result.json metadata');
          allChecksPass = false;
        } else {
          const csvBatchesStr = csvGroup.batches.join(',');
          const resultBatchesStr = resultData.metadata.batches.join(',');
          
          if (csvBatchesStr !== resultBatchesStr) {
            console.error(`❌ Batches mismatch: ${resultBatchesStr} vs ${csvBatchesStr}`);
            allChecksPass = false;
          }
        }
      }
    }
    
    if (allChecksPass) {
      console.log('✅ All CSV data correctly included in result.json!');
      return true;
    } else {
      console.error('❌ Some CSV data is missing or incorrect in result.json');
      return false;
    }
    
  } catch (error) {
    console.error(`Error testing CSV data: ${error}`);
    return false;
  }
}

// Run the test
const testResult = testCsvDataInResult();
console.log(`Test ${testResult ? 'PASSED' : 'FAILED'}`);

// Exit with appropriate status code
process.exit(testResult ? 0 : 1);
