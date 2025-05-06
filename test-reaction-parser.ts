/**
 * Test script to verify our parser correctly handles messages with reaction markers
 * - Test multiple formats of "In com Eric" message with various reaction markers
 * - Focus specifically on the format that would be expected from +351 966 314 427
 */

import { parseSignupMessage } from './src/utils/signup-parser';

interface TestMessage {
  content: string;
  sender: string;
  timestamp: number;
}

/**
 * Test the parser with a given message
 */
function testParser(content: string, sender: string = "351966314427@s.whatsapp.net") {
  console.log(`\n----- Testing: "${content}" -----`);
  
  // Create a test message object
  const message: TestMessage = {
    content,
    sender, 
    timestamp: Date.now() / 1000
  };
  
  try {
    // Parse the message
    const result = parseSignupMessage(message);
    console.log("Result:", JSON.stringify(result, null, 2));
    
    if (result) {
      // Check if Eric is in the names
      const names = Array.isArray(result) 
        ? result[0]?.names || []
        : result.names;
      
      if (names.some(name => name === 'Eric')) {
        console.log("✅ SUCCESS: 'Eric' found in the parsed result");
      } else {
        console.log("❌ ERROR: 'Eric' not found in the names:", names.join(", "));
      }
    } else {
      console.log("❌ ERROR: Message was not parsed successfully");
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
}

// Test various formats of the message
const testCases = [
  "In com Eric",
  "[EDITEDMESSAGE] In com Eric",
  "In com Eric [REACTION]",
  "[DELETED] In com Eric",
  "In com Eric 15h",
  "[EDITED] In com Eric"
];

// Run all test cases
console.log("\n=== TESTING REACTION MARKER PARSER ===");
testCases.forEach(testCase => testParser(testCase));

// Test an example with a different sender
testParser("In com Eric", "351987654321@s.whatsapp.net");
