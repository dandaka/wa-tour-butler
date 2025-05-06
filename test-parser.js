#!/usr/bin/env node

// Simple utility to test the parser with various reaction marker formats
const { parseSignupMessage } = require('./dist/utils/signup-parser');

function testParser(messageContent, sender = '351966314427@s.whatsapp.net') {
  console.log('\n-----------------------------------');
  console.log(`Testing message: "${messageContent}"`);
  console.log('-----------------------------------');
  
  const message = {
    content: messageContent,
    timestamp: Date.now() / 1000,
    sender
  };
  
  try {
    const result = parseSignupMessage(message);
    
    console.log('Parser Result:', result ? JSON.stringify(result, null, 2) : 'null');
    
    if (result) {
      // Check if it found Eric
      const hasEric = Array.isArray(result) 
        ? result.some(r => r.names.some(n => n.includes('Eric')))
        : result.names.some(n => n.includes('Eric'));
      
      if (hasEric) {
        console.log('✅ SUCCESS: Found Eric in the parsed result!');
      } else {
        console.log('❌ ERROR: Eric not found in parsed names');
      }
    } else {
      console.log('❌ ERROR: Message not parsed successfully');
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
}

// Test various formats of the message
const testCases = [
  'In com Eric',
  '[EDITEDMESSAGE] In com Eric',
  'In com Eric [REACTION]',
  '[🔥] In com Eric',
  'In com @Eric',
  '[EDITED] In com Eric',
  'In com Eric 17h'
];

// Run all test cases
testCases.forEach(testParser);

// Also allow testing from command line
if (process.argv.length > 2) {
  testParser(process.argv[2]);
}

console.log('\nTo test your own message formats, run:');
console.log('node test-parser.js "Your message here"');
