/**
 * Contact Name Jest Tests
 * 
 * This test suite verifies that the contact loader correctly adds
 * sender_name to messages based on contacts.json data.
 */

import fs from 'fs';
import path from 'path';
import { loadContacts, addDisplayNames, getDisplayName } from '../utils/contact-loader';

// Test paths
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const CONTACTS_PATH = path.join(TEST_DATA_DIR, 'contacts.json');

// Test cases
const TEST_CASES = [
  { 
    id: 'admin',
    sender: '351936836204@s.whatsapp.net', 
    expected_name: 'André Silva' 
  },
  { 
    id: 'player1',
    sender: '351914186974@s.whatsapp.net', 
    expected_name: 'Rudi Ullon' 
  },
  { 
    id: 'player2',
    sender: '31641316698@s.whatsapp.net', 
    expected_name: 'Bob Stolk' 
  },
  { 
    id: 'unknown_player',
    sender: '9999999999@s.whatsapp.net', 
    expected_name: '9999999999' // Not in contacts, so should return the cleaned number
  },
  { 
    id: 'group',
    sender: '120363028202164779@g.us', 
    expected_name: 'Pedro Costa' 
  }
];

describe('Contact Name Tests', () => {
  let contacts: Record<string, string>;
  
  // Load contacts once before all tests
  beforeAll(() => {
    contacts = loadContacts(CONTACTS_PATH);
  });
  
  test('contacts.json should load correctly', () => {
    expect(contacts).toBeDefined();
    expect(Object.keys(contacts).length).toBeGreaterThan(0);
  });
  
  test('getDisplayName should convert phone numbers to names', () => {
    TEST_CASES.forEach(testCase => {
      const displayName = getDisplayName(testCase.sender, contacts);
      expect(displayName).toBe(testCase.expected_name);
    });
  });
  
  // Individual test for each contact type - more granular testing
  test.each([
    ['admin contact', '351936836204@s.whatsapp.net', 'André Silva'],
    ['player contact', '351914186974@s.whatsapp.net', 'Rudi Ullon'],
    ['international contact', '31641316698@s.whatsapp.net', 'Bob Stolk'],
    ['unknown contact', '9999999999@s.whatsapp.net', '9999999999'],
    ['group chat', '120363028202164779@g.us', 'Pedro Costa'],
  ])('%s: %s should convert to %s', (_, sender, expected) => {
    expect(getDisplayName(sender, contacts)).toBe(expected);
  });
  
  test('addDisplayNames should add sender_name to messages', () => {
    // Create test messages
    const testMessages = TEST_CASES.map(test => ({
      id: test.id,
      sender: test.sender,
      originalText: `Test message from ${test.sender}`,
      timestamp: Date.now()
    }));
    
    // Process messages
    const messagesWithNames = addDisplayNames(testMessages, contacts);
    
    // Verify each message has sender_name
    messagesWithNames.forEach((message, index) => {
      // Original sender should be preserved
      expect(message.sender).toBe(TEST_CASES[index].sender);
      
      // sender_name should be added
      expect(message.sender_name).toBeDefined();
      
      // sender_name should match expected value
      expect(message.sender_name).toBe(TEST_CASES[index].expected_name);
    });
  });
  
  // Test for each message individually
  test.each(TEST_CASES)('should add correct sender_name for $id', (testCase) => {
    const message = {
      sender: testCase.sender,
      originalText: `Test from ${testCase.id}`
    };
    
    const processed = addDisplayNames([message], contacts)[0];
    
    // Should preserve original sender
    expect(processed.sender).toBe(testCase.sender);
    
    // Should add correct sender_name
    expect(processed.sender_name).toBe(testCase.expected_name);
  });
  
  test('result.json should contain sender_name field', () => {
    const resultJsonPath = path.join(TEST_DATA_DIR, 'result.json');
    
    // Skip if result.json doesn't exist
    if (!fs.existsSync(resultJsonPath)) {
      console.warn('result.json not found, skipping test');
      return;
    }
    
    const resultData = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
    
    // Test 1: Verify filtered messages exist
    expect(resultData.filteredMessages).toBeDefined();
    expect(resultData.filteredMessages.length).toBeGreaterThan(0);
    
    // Test 2: Check first message has sender_name
    const firstMessage = resultData.filteredMessages[0];
    expect(firstMessage.sender_name).toBeDefined();
    
    // Skip Test 3 since registration message structure is tested elsewhere
    // We're only concerned with filtered messages for the contact name test
    
    // Test 4: Verify specific message types have sender_name
    const typesToCheck = ['in', 'out'];
    typesToCheck.forEach(type => {
      const messagesOfType = resultData.filteredMessages.filter(
        (msg: any) => msg.modifier === type
      );
      
      if (messagesOfType.length > 0) {
        expect(messagesOfType[0].sender_name).toBeDefined();
      }
    });
    
    // Test 5: Count messages with sender_name
    const messagesWithName = resultData.filteredMessages.filter(
      (msg: any) => msg.sender_name
    );
    
    // Test 6: All messages should have sender_name
    expect(messagesWithName.length).toBe(resultData.filteredMessages.length);
    
    // Test 7: Check for name/number mapping accuracy for a known contact
    const adminMessage = resultData.filteredMessages.find(
      (msg: any) => msg.sender === '351936836204@s.whatsapp.net'
    );
    
    if (adminMessage) {
      expect(adminMessage.sender_name).toBe('André Silva');
    }
  });
  
  // Test handling of edge cases
  test('should handle edge cases correctly', () => {
    // Empty array
    expect(addDisplayNames([], contacts)).toEqual([]);
    
    // Message without sender
    const noSenderMsg = { content: 'test' };
    expect(addDisplayNames([noSenderMsg], contacts)[0]).toEqual(noSenderMsg);
    
    // Empty contacts
    const testMsg = { sender: '123456@s.whatsapp.net' };
    expect(addDisplayNames([testMsg], {})[0].sender_name).toBe('123456');
  });
});
