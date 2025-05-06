#!/usr/bin/env node

// Script to show raw JSON data of messages after a specific timestamp
const betterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Group ID for the Kia4all group
const GROUP_ID = '351919755889-1528547030@g.us';

// Target timestamp - after the Carlos Lopes signup
// 5/5/2025, 4:08:14 PM converted to Unix timestamp
const TARGET_TIMESTAMP = 1746397694; // Use this as reference point

// Find the database file
function findDatabaseFile() {
  const dbPath = path.resolve(process.cwd(), 'data/group_messages.db');
  if (fs.existsSync(dbPath)) {
    console.log(`Found database file at ${dbPath}`);
    return dbPath;
  }
  throw new Error('Could not find messages database file');
}

// Get messages after the specified timestamp
function getMessagesAfterTimestamp(db, timestamp) {
  try {
    // Get all messages after the timestamp, ordered by time
    const query = "SELECT * FROM messages WHERE timestamp > ? ORDER BY timestamp ASC";
    return db.prepare(query).all(timestamp);
  } catch (error) {
    console.error(`Error fetching messages: ${error.message}`);
    return [];
  }
}

// Format timestamp as human-readable date
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}

// Main function
function main() {
  try {
    const dbPath = findDatabaseFile();
    const db = new betterSqlite3(dbPath, { readonly: true });
    
    console.log(`\nFetching messages after ${formatTimestamp(TARGET_TIMESTAMP)}`);
    
    const messages = getMessagesAfterTimestamp(db, TARGET_TIMESTAMP);
    console.log(`Found ${messages.length} messages after the target timestamp`);
    
    // Display messages in JSON format
    if (messages.length > 0) {
      messages.forEach((msg, i) => {
        console.log(`\n========================= MESSAGE #${i+1} =========================`);
        console.log(`TIME: ${formatTimestamp(msg.timestamp)}`);
        
        // Try to parse the message content if it exists and looks like JSON
        if (msg.message) {
          try {
            // First display the raw JSON
            console.log("RAW JSON:");
            console.log(msg.message);
            
            // Then try to parse and pretty-print it
            const parsed = JSON.parse(msg.message);
            console.log("\nPRETTY PRINTED:");
            console.log(JSON.stringify(parsed, null, 2));
            
            // Extract text content if possible
            if (parsed.conversation) {
              console.log("\nEXTRACTED TEXT: " + parsed.conversation);
            } else if (parsed.extendedTextMessage && parsed.extendedTextMessage.text) {
              console.log("\nEXTRACTED TEXT: " + parsed.extendedTextMessage.text);
            }
          } catch (e) {
            console.log("RAW CONTENT (not JSON):");
            console.log(msg.message);
          }
        }
        
        // Show other message metadata
        console.log("\nMETADATA:");
        const metadata = { ...msg };
        delete metadata.message; // Already displayed above
        console.log(JSON.stringify(metadata, null, 2));
      });
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Run the script
main();
