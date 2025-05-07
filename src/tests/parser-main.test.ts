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
    // Debug: Read messages file directly for inspection
    const messages = JSON.parse(fs.readFileSync(messagesFilePath, 'utf8'));
    
    // Find potential registration messages
    const registrationKeywords = ['inscrições', 'abertas', 'registration', 'open'];
    const potentialRegMessages = messages.filter((msg: any) => {
      const content = msg.content.toLowerCase();
      return registrationKeywords.some(keyword => content.includes(keyword.toLowerCase()));
    });
    
    console.log('Found', potentialRegMessages.length, 'potential registration messages');
    potentialRegMessages.forEach((msg: any, idx: number) => {
      console.log(`Msg ${idx + 1}:`, msg.content.substring(0, 40), '... from', msg.sender);
    });
    
    // Debug: Log group info
    const groupInfo = groupsData.find((g: any) => g.ID === targetGroupId);
    console.log('Group Admin IDs:', groupInfo.Admins);
    
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
    
    // We expect the parser to find a registration message (success should be true)
    // If this test fails, it might be because:
    // 1. There's no registration message in the test data
    // 2. The detection logic failed
    // 3. The admin IDs don't match the sender of registration messages
    expect(resultContent.success).toBe(true);
    
    if (resultContent.success) {
      expect(resultContent.timestamp).toBeGreaterThan(0);
      expect(resultContent.message).toBeDefined();
    }
    
  });
});
