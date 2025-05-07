/**
 * Player Name Test
 * 
 * This test verifies that player display names correctly use contact information
 * from contacts.json.
 */

import fs from 'fs';
import path from 'path';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { loadContacts } from '../utils/contact-loader';

// Paths
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const RESULT_PATH = path.join(TEST_DATA_DIR, 'result.json');
const CONTACTS_PATH = path.join(TEST_DATA_DIR, 'contacts.json');

// Test cases - specific players that should have their display names from contacts
const TEST_CASES = [
  {
    sender: "351935780509@s.whatsapp.net", 
    expected_name: "Giulio",
    message: "In 15h"
  },
  {
    sender: "351936836204@s.whatsapp.net", 
    expected_name: "André Silva",
    message: "In"
  },
  {
    sender: "31641316698@s.whatsapp.net", 
    expected_name: "Bob Stolk",
    message: "Out 15h"
  },
  {
    sender: "351914186974@s.whatsapp.net", 
    expected_name: "Rudi Ullon",
    message: "Me and Peter in 15"
  },
  {
    sender: "120363028202164779@g.us", 
    expected_name: "Pedro Costa",
    message: "Team registration"
  }
];

/**
 * Run the parser on our test messages and verify display names
 */
function testPlayerNames() {
  console.log('Testing player display name resolution...\n');
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // Load contacts for verification
    const contacts = loadContacts(CONTACTS_PATH);
    console.log(`Loaded ${Object.keys(contacts).length} contacts for verification\n`);
    
    // Create test messages
    const testMessages = TEST_CASES.map(test => ({
      id: Math.random().toString(36).substring(7),
      sender: test.sender,
      content: test.message,
      timestamp: Date.now(),
      fromMe: false
    }));
    
    // Process with pipeline
    const pipeline = new ParserPipeline();
    const processedMessages = pipeline.processMessages(testMessages);
    
    // Verify each message's players have correct display names
    TEST_CASES.forEach((testCase, index) => {
      console.log(`Test case ${index + 1}: ${testCase.message} from ${testCase.sender}`);
      const message = processedMessages[index];
      
      // Verify message has players array
      if (!message.players || message.players.length === 0) {
        console.error(`❌ Message has no players`);
        testsFailed++;
        return;
      }
      
      // Find player with the sender's phone number
      const senderPhoneNumber = testCase.sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const playerWithSenderNumber = message.players.find(
        p => p.phoneNumber === senderPhoneNumber
      );
      
      if (!playerWithSenderNumber) {
        console.error(`❌ Could not find player with sender's number: ${senderPhoneNumber}`);
        testsFailed++;
        return;
      }
      
      // Verify displayName matches expected
      if (playerWithSenderNumber.displayName === testCase.expected_name) {
        console.log(`✅ Player has correct display name: ${playerWithSenderNumber.displayName}`);
        testsPassed++;
      } else {
        console.error(`❌ Player has incorrect display name: ${playerWithSenderNumber.displayName} (expected ${testCase.expected_name})`);
        testsFailed++;
      }
      
      console.log('');
    });
    
    // Check result.json for real data
    console.log('Checking result.json for player display names...');
    if (fs.existsSync(RESULT_PATH)) {
      const resultData = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
      
      if (resultData.filteredMessages && resultData.filteredMessages.length > 0) {
        const messagesWithPlayers = resultData.filteredMessages.filter(
          (msg: any) => msg.players && msg.players.length > 0
        );
        
        if (messagesWithPlayers.length === 0) {
          console.error('❌ No messages with players found in result.json');
          testsFailed++;
        } else {
          // Find a specific example - Giulio's message
          const giulioMessage = resultData.filteredMessages.find(
            (msg: any) => msg.sender === '351935780509@s.whatsapp.net' && 
                          msg.originalText.includes('15h')
          );
          
          if (giulioMessage) {
            const player = giulioMessage.players[0];
            if (player.displayName === 'Giulio') {
              console.log(`✅ Giulio's message has correct player display name: ${player.displayName}`);
              testsPassed++;
            } else {
              console.error(`❌ Giulio's message has incorrect player display name: ${player.displayName} (expected Giulio)`);
              testsFailed++;
            }
          }
          
          // Check that at least some messages have matching sender_name and player displayName
          let matchCount = 0;
          messagesWithPlayers.forEach((msg: any) => {
            if (msg.sender_name && 
                msg.players[0].phoneNumber === msg.sender.replace('@s.whatsapp.net', '') &&
                msg.players[0].displayName === msg.sender_name) {
              matchCount++;
            }
          });
          
          const matchPercentage = (matchCount / messagesWithPlayers.length) * 100;
          console.log(`Messages with matching sender_name and player displayName: ${matchCount}/${messagesWithPlayers.length} (${matchPercentage.toFixed(1)}%)`);
          
          if (matchPercentage > 90) {
            console.log('✅ Most messages have matching sender_name and player displayName');
            testsPassed++;
          } else {
            console.error('❌ Many messages have mismatched sender_name and player displayName');
            testsFailed++;
          }
        }
      }
    } else {
      console.warn('result.json not found, skipping real data test');
    }
    
  } catch (error) {
    console.error(`Error running tests: ${error}`);
    testsFailed++;
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log(`Total tests: ${testsPassed + testsFailed}`);
  
  return testsFailed === 0;
}

// Run the tests
const allTestsPassed = testPlayerNames();
process.exit(allTestsPassed ? 0 : 1);
