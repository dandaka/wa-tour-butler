// Use require for BetterSqlite3 to avoid type issues
const BetterSqlite3 = require('better-sqlite3');
type Database = any; // Simplified type for this script
import { parseSignupMessage } from '../utils/signup-parser';

// Define the types here since we don't have direct access to a types file
interface WhatsAppMessage {
  content: string;
  timestamp: number;
  sender: string;
  groupId: string;
}

// Simple console logger function
function createLogger(name: string) {
  return {
    info: (message: string) => console.log(`[${name}] ${message}`),
    error: (message: string) => console.error(`[${name}] ERROR: ${message}`)
  };
}

// Database access function - simplified from the project
function openDatabase(): Database {
  const betterSqlite3 = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.resolve(process.cwd(), 'session/messages.db');
  return new betterSqlite3(dbPath, { readonly: true });
}

const logger = createLogger('find-specific-message');

// Function to extract messages from a specific number containing "In com Eric"
function findSpecificMessage(db: Database, groupId: string) {
  console.log(`\nLooking for messages in group: ${groupId}`);
  
  // Get all messages from the group
  const stmt = db.prepare('SELECT * FROM messages WHERE groupId = ? ORDER BY timestamp ASC');
  const messages = stmt.all(groupId) as WhatsAppMessage[];
  console.log(`Found ${messages.length} total messages in this group`);
  
  // Filter messages from the specific phone number
  const phoneNumber = '351966314427';
  const messagesFromNumber = messages.filter(m => m.sender.includes(phoneNumber));
  console.log(`\n✨ Found ${messagesFromNumber.length} messages from +${phoneNumber}:`);
  
  if (messagesFromNumber.length > 0) {
    messagesFromNumber.forEach(m => {
      const date = new Date(m.timestamp * 1000);
      console.log(`[${date.toLocaleString()}] "${m.content}"`);
    });
  }
  
  // Find messages containing "In com Eric" or similar variants
  const inComEricMessages = messages.filter(m => {
    const content = m.content.toLowerCase();
    return content.includes('in com') && content.includes('eric');
  });
  
  console.log(`\n🔍 Found ${inComEricMessages.length} messages containing "In com Eric":`);
  
  if (inComEricMessages.length > 0) {
    inComEricMessages.forEach(m => {
      const date = new Date(m.timestamp * 1000);
      console.log(`\n--- MESSAGE DETAILS ---`);
      console.log(`Timestamp: ${date.toLocaleString()}`);
      console.log(`Sender: ${m.sender}`);
      console.log(`Content: "${m.content}"`);
      
      // Try to parse the message with our updated parser
      const parsedResult = parseSignupMessage(m);
      console.log(`Parser Result: ${parsedResult ? JSON.stringify(parsedResult, null, 2) : 'null'}`);
      
      // If we have a result, check if Eric is in the names
      if (parsedResult) {
        const result = Array.isArray(parsedResult) ? parsedResult[0] : parsedResult;
        if (result.names.some(name => name.includes('Eric'))) {
          console.log(`✅ SUCCESS: Found Eric in the parsed result!`);
        } else {
          console.log(`❌ ERROR: Eric not found in parsed names: ${result.names.join(', ')}`);
        }
      } else {
        console.log(`❌ ERROR: Message not parsed successfully`);
      }
    });
  }
  
  // Check for messages with reaction markers that might contain "In com Eric"
  const bracketMessages = messages.filter(m => 
    m.content.includes('[') && 
    m.content.includes(']') && 
    m.content.toLowerCase().includes('in com')
  );
  
  console.log(`\n🔍 Found ${bracketMessages.length} messages with reaction markers possibly containing "In com":`);
  
  if (bracketMessages.length > 0) {
    bracketMessages.forEach(m => {
      const date = new Date(m.timestamp * 1000);
      console.log(`\n--- REACTION MESSAGE DETAILS ---`);
      console.log(`Timestamp: ${date.toLocaleString()}`);
      console.log(`Sender: ${m.sender}`);
      console.log(`Content: "${m.content}"`);
      
      // Try to parse the message with our updated parser
      const parsedResult = parseSignupMessage(m);
      if (parsedResult) {
        const result = Array.isArray(parsedResult) ? parsedResult[0] : parsedResult;
        console.log(`Parsed names: ${result.names.join(', ')}`);
        console.log(`Is team: ${result.isTeam}`);
        console.log(`Status: ${result.status}`);
      } else {
        console.log(`❌ ERROR: Message not parsed successfully`);
      }
    });
  }
}

// Main function
async function main() {
  try {
    // Open the database
    const db = openDatabase();
    
    // Group ID for Kia4all group
    const groupId = '351919755889-1528547030@g.us'; // Kia4all - 6ªf - 19h - M3
    
    // Find and log the specific message
    findSpecificMessage(db, groupId);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
main().catch(console.error);
