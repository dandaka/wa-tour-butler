/**
 * Contact Name Test
 * 
 * This test verifies that sender names from contacts.json are correctly
 * added to messages in the result.json file.
 */

import fs from 'fs';
import path from 'path';
import { loadContacts, addDisplayNames, ContactsMap } from '../utils/contact-loader';

// Paths
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const CONTACTS_PATH = path.join(TEST_DATA_DIR, 'contacts.json');
const TEST_OUTPUT_PATH = path.join(TEST_DATA_DIR, 'contact-test-output.json');

// Test cases - 5 different examples with sender and expected display name
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

/**
 * Run tests for contacts functionality
 */
function testContactNames() {
  console.log('Testing contact name functionality...\n');
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // 1. Load contacts
    console.log(`Loading contacts from: ${CONTACTS_PATH}`);
    const contacts = loadContacts(CONTACTS_PATH);
    console.log(`Loaded ${Object.keys(contacts).length} contacts\n`);
    
    if (Object.keys(contacts).length === 0) {
      console.error('❌ No contacts loaded, test failed');
      return false;
    }
    
    // 2. Create test messages
    const testMessages = TEST_CASES.map(test => ({
      id: test.id,
      sender: test.sender,
      originalText: `Test message from ${test.sender}`,
      timestamp: Date.now()
    }));
    
    // 3. Add display names
    const messagesWithNames = addDisplayNames(testMessages, contacts);
    
    // Save test output for inspection
    fs.writeFileSync(TEST_OUTPUT_PATH, JSON.stringify(messagesWithNames, null, 2), 'utf8');
    console.log(`Saved test output to: ${TEST_OUTPUT_PATH}\n`);
    
    // 4. Verify each test case
    TEST_CASES.forEach((testCase, index) => {
      console.log(`Test case ${index + 1}: ${testCase.id}`);
      const message = messagesWithNames[index];
      
      // Check sender is preserved
      if (message.sender === testCase.sender) {
        console.log(`✅ Original sender preserved: ${message.sender}`);
        testsPassed++;
      } else {
        console.error(`❌ Original sender changed: ${message.sender} (expected ${testCase.sender})`);
        testsFailed++;
      }
      
      // Check sender_name is added
      if (message.sender_name) {
        console.log(`✅ sender_name added: ${message.sender_name}`);
        testsPassed++;
      } else {
        console.error('❌ sender_name not added');
        testsFailed++;
      }
      
      // Check sender_name is correct
      if (message.sender_name === testCase.expected_name) {
        console.log(`✅ sender_name correct: ${message.sender_name} (expected ${testCase.expected_name})`);
        testsPassed++;
      } else {
        console.error(`❌ sender_name incorrect: ${message.sender_name} (expected ${testCase.expected_name})`);
        testsFailed++;
      }
      
      console.log('');
    });
    
    // 5. Test the registration parser output (result.json)
    console.log('Testing result.json');
    const resultJsonPath = path.join(TEST_DATA_DIR, 'result.json');
    
    if (fs.existsSync(resultJsonPath)) {
      const resultData = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
      
      if (resultData.filteredMessages && resultData.filteredMessages.length > 0) {
        // Check if sender_name exists in the first message
        const firstMessage = resultData.filteredMessages[0];
        if (firstMessage.sender_name) {
          console.log(`✅ result.json contains sender_name: ${firstMessage.sender_name}`);
          testsPassed++;
        } else {
          console.error('❌ result.json does not contain sender_name');
          testsFailed++;
        }
        
        // Count messages with sender_name
        const messagesWithSenderName = resultData.filteredMessages.filter(
          (msg: any) => msg.sender_name
        ).length;
        
        console.log(`Messages with sender_name: ${messagesWithSenderName}/${resultData.filteredMessages.length}`);
        
        if (messagesWithSenderName === resultData.filteredMessages.length) {
          console.log('✅ All messages have sender_name');
          testsPassed++;
        } else {
          console.error(`❌ Not all messages have sender_name (${messagesWithSenderName}/${resultData.filteredMessages.length})`);
          testsFailed++;
        }
      }
    } else {
      console.error(`❌ result.json not found at ${resultJsonPath}`);
      testsFailed++;
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

// Run tests
const success = testContactNames();
process.exit(success ? 0 : 1);
