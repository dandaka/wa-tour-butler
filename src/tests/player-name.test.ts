/**
 * Jest Test for Player Name Resolution
 * 
 * This test verifies that player display names correctly use contact information
 * from contacts.json.
 */

import fs from 'fs';
import path from 'path';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { loadContacts } from '../utils/contact-loader';
import { MsgParsed, MessageCommand } from '../types/message-parsing';

// Paths
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const RESULT_PATH = path.join(TEST_DATA_DIR, 'result.json');
const CONTACTS_PATH = path.join(TEST_DATA_DIR, 'contacts.json');

// Test cases
const TEST_CASES = [
  {
    sender: "351935780509@s.whatsapp.net", 
    expected_name: "Giulio",
    message: "In 15h",
    modifier: MessageCommand.IN
  },
  {
    sender: "351936836204@s.whatsapp.net", 
    expected_name: "André Silva",
    message: "In",
    modifier: MessageCommand.IN
  },
  {
    sender: "31641316698@s.whatsapp.net", 
    expected_name: "Bob Stolk",
    message: "Out 15h",
    modifier: MessageCommand.OUT
  },
  {
    sender: "351914186974@s.whatsapp.net", 
    expected_name: "Rudi Ullon",
    message: "Me and Peter in 15",
    modifier: MessageCommand.IN
  }
];

describe('Player Name Tests', () => {
  let contacts: Record<string, string>;
  let pipeline: ParserPipeline;
  
  // Set up before all tests
  beforeAll(() => {
    contacts = loadContacts(CONTACTS_PATH);
    pipeline = new ParserPipeline();
  });
  
  test('contacts.json should load correctly', () => {
    expect(contacts).toBeDefined();
    expect(Object.keys(contacts).length).toBeGreaterThan(0);
  });
  
  test('ParserPipeline should add correct player display names', () => {
    // Create test messages
    const testMessages = TEST_CASES.map(test => ({
      id: Math.random().toString(36).substring(7),
      sender: test.sender,
      content: test.message,
      timestamp: Date.now(),
      fromMe: false
    }));
    
    // Process messages
    const processedMessages = pipeline.processMessages(testMessages);
    
    // For each test case, check if the display name matches expectation
    TEST_CASES.forEach((testCase, index) => {
      const message = processedMessages[index];
      
      // All messages should have a players array
      expect(message.players).toBeDefined();
      
      // The sender should be the first player for simple IN/OUT messages
      const senderPhoneNumber = testCase.sender.replace('@s.whatsapp.net', '');
      
      // For IN and OUT messages, the sender should be the first player
      if (testCase.modifier === MessageCommand.IN || testCase.modifier === MessageCommand.OUT) {
        // Find player with the sender's phone number
        const playerWithSenderNumber = message.players.find(
          p => p.phoneNumber === senderPhoneNumber
        );
        
        expect(playerWithSenderNumber).toBeDefined();
        expect(playerWithSenderNumber?.displayName).toBe(testCase.expected_name);
      }
    });
  });
  
  test('result.json should have correct player display names', () => {
    // Skip if result.json doesn't exist
    if (!fs.existsSync(RESULT_PATH)) {
      console.warn('result.json not found, skipping test');
      return;
    }
    
    const resultData = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
    
    // Verify filtered messages contain players with display names
    expect(resultData.filteredMessages).toBeDefined();
    expect(resultData.filteredMessages.length).toBeGreaterThan(0);
    
    // Find Giulio's message as a specific example to check
    const giulioMessage = resultData.filteredMessages.find(
      (msg: any) => msg.sender === '351935780509@s.whatsapp.net' && 
                    msg.originalText.includes('15h')
    );
    
    if (giulioMessage) {
      expect(giulioMessage.players[0].displayName).toBe('Giulio');
    }
    
    // Count messages where sender_name matches player displayName
    const messagesWithPlayers = resultData.filteredMessages.filter(
      (msg: any) => msg.players && msg.players.length > 0 && msg.sender_name
    );
    
    if (messagesWithPlayers.length > 0) {
      const matchingMessages = messagesWithPlayers.filter((msg: any) => {
        const senderPhone = msg.sender.replace('@s.whatsapp.net', '');
        const senderPlayer = msg.players.find((p: any) => p.phoneNumber === senderPhone);
        return senderPlayer && senderPlayer.displayName === msg.sender_name;
      });
      
      // At least 90% of messages should have matching names
      const matchPercentage = (matchingMessages.length / messagesWithPlayers.length) * 100;
      expect(matchPercentage).toBeGreaterThanOrEqual(90);
    }
  });
});
