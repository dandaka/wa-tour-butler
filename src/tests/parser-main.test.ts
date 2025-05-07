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

  // Test that the parser can detect registration messages
  test('should detect registration message and write to result.json', () => {
    // Call the parseTest function
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Write the result to the result.json file
    fs.writeFileSync(
      resultFilePath, 
      JSON.stringify(result, null, 2),
      'utf8'
    );
    
    // Verify that result was written correctly
    expect(fs.existsSync(resultFilePath)).toBe(true);
    
    // Read the result back to verify content
    const resultContent = JSON.parse(fs.readFileSync(resultFilePath, 'utf8'));
    
    // Check if the result has the expected structure
    expect(resultContent).toBeDefined();
    expect(typeof resultContent).toBe('object');
    
    // We expect the parser to find a registration message (found should be true)
    // If this test fails, it might be because:
    // 1. There's no registration message in the test data
    // 2. The detection logic failed
    // 3. The admin IDs don't match the sender of registration messages
    expect(resultContent.found).toBe(true);
    expect(resultContent.timestamp).toBeGreaterThan(0);
    expect(resultContent.message).toBeDefined();
    
    if (resultContent.found) {
      // If found, verify the message content contains registration keywords
      const messageContent = resultContent.message.content.toLowerCase();
      expect(
        messageContent.includes('registration') || 
        messageContent.includes('open') || 
        messageContent.includes('signup') ||
        messageContent.includes('inscripcion')
      ).toBe(true);
    }
  });
});
