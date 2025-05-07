/**
 * Tests for the parser-main module
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseTest, loadMessages } from '../parser/parser-main';
import { WhatsAppMessage } from '../types/messages';

describe('Parser Main', () => {
  const testDataDir = path.resolve(__dirname, '../../data/test-data');
  const messagesFilePath = path.join(testDataDir, '120363028202164779-messages.json');
  const groupsFilePath = path.join(testDataDir, 'groups-test.json');
  const resultFilePath = path.join(testDataDir, 'result.json');
  
  // Load admin IDs from the groups file
  const groupsData = JSON.parse(fs.readFileSync(groupsFilePath, 'utf8'));
  const targetGroupId = '120363028202164779@g.us'; // This should match the messages file group ID
  
  // Find the target group in the groups data
  const group = groupsData.find((g: any) => g.ID === targetGroupId);
  
  // Extract admin IDs, removing the @s.whatsapp.net part if present
  const adminIds = group ? 
    group.Admins.map((admin: string) => admin.replace('@s.whatsapp.net', '')) : 
    ['351936836204']; // Fallback to a default in case the group isn't found 

  // Test that the parser can detect registration messages and end time
  test('should detect registration message, end time, and write to result.json', () => {
    // Debug: Read messages file directly for inspection - only for test verification
    const messages = JSON.parse(fs.readFileSync(messagesFilePath, 'utf8'));
    
    // Call the parseTest function - which now returns the comprehensive result
    const fullResult = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Write the comprehensive result to the result.json file
    fs.writeFileSync(
      resultFilePath, 
      JSON.stringify(fullResult, null, 2),
      'utf8'
    );
    
    // Verify that result was written correctly
    expect(fs.existsSync(resultFilePath)).toBe(true);
    
    // Read the result back to verify content
    const resultContent = JSON.parse(fs.readFileSync(resultFilePath, 'utf8'));
    
    // Check if the result has the expected structure
    expect(resultContent).toBeDefined();
    expect(typeof resultContent).toBe('object');
    
    // We expect the parser to find a registration message (success should be true)
    // If this test fails, it might be because:
    // 1. There's no registration message in the test data
    // 2. The detection logic failed
    // 3. The admin IDs don't match the sender of registration messages
    expect(resultContent.parsingResult.registrationStart.success).toBe(true);
    
    if (resultContent.parsingResult.registrationStart.success) {
      // Check registration start details
      expect(resultContent.parsingResult.registrationStart.timestamp).toBeGreaterThan(0);
      expect(resultContent.parsingResult.registrationStart.message).toBeDefined();
      expect(resultContent.registrationMessage).toBeDefined();
      expect(resultContent.registrationStartTime).toBeDefined();
      
      // Add detailed logging for debugging
      console.log('Registration start timestamp:', resultContent.registrationStartTime);
      console.log('Registration start date:', new Date(resultContent.registrationStartTime * 1000).toISOString());
      console.log('Registration end result:', JSON.stringify(resultContent.parsingResult.registrationEnd));
      
      // Log batch information
      if (resultContent.groupInfo.Batches) {
        console.log('Batches found:', resultContent.groupInfo.Batches.length);
        resultContent.groupInfo.Batches.forEach((batch: any, index: number) => {
          console.log(`Batch ${index}: name=${batch.name}, tournamentTime=${batch.TournamentTime || 'none'}`);
        });
      } else {
        console.log('No batches found in group info');
      }
      
      // Check if we have batch information with tournament times in the test data
      // This is needed for registration end detection to work
      if (resultContent.groupInfo.Batches && resultContent.groupInfo.Batches.some((batch: { TournamentTime?: string }) => batch.TournamentTime)) {
        console.log('Test data has batches with tournament times');
        // If test group has tournament times, we should have calculated an end time
        expect(resultContent.parsingResult.registrationEnd.success).toBe(true);
        expect(resultContent.registrationEndTime).toBeDefined();
        expect(resultContent.registrationEndTime).toBeGreaterThan(resultContent.registrationStartTime);
      } else {
        console.log('No batches with tournament times found in test data');
      }
    }
    
  });
});
