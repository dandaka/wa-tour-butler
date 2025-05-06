#!/usr/bin/env node

// Script to search whatsapp_messages.db for messages after Carlos Lopes signup
const betterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Constants
const DATABASE_PATH = path.resolve(process.cwd(), 'data/whatsapp_messages.db');
const GROUP_ID = '351919755889-1528547030@g.us'; // Kia4all group ID
const TARGET_PHONE = '351966314427';
const CARLOS_LOPES_TIMESTAMP = 1746397694; // 5/5/2025, 4:08:14 PM
const SEARCH_KEYWORDS = ["eric", "in com"];

// Format timestamp as human-readable date
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}

// Main function
function main() {
  try {
    if (!fs.existsSync(DATABASE_PATH)) {
      console.error(`Database not found at ${DATABASE_PATH}`);
      return;
    }
    
    console.log(`Opening WhatsApp messages database at ${DATABASE_PATH}`);
    const db = new betterSqlite3(DATABASE_PATH, { readonly: true });
    
    // 1. Find messages from the Kia4all group
    console.log(`\nFinding messages from the Kia4all group (${GROUP_ID})`);
    const groupMessages = db.prepare(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC"
    ).all(GROUP_ID);
    
    console.log(`Found ${groupMessages.length} messages from the Kia4all group`);
    
    if (groupMessages.length === 0) {
      // Try to find the actual group ID from the database
      const groups = db.prepare(
        "SELECT DISTINCT chat_id FROM messages WHERE chat_id LIKE '%@g.us'"
      ).all();
      
      console.log(`\nAvailable group IDs in the database:`);
      groups.forEach(g => console.log(` - ${g.chat_id}`));
      
      // If we have group IDs, use the first one
      if (groups.length > 0) {
        const firstGroupId = groups[0].chat_id;
        console.log(`\nUsing first available group ID: ${firstGroupId}`);
        
        const firstGroupMessages = db.prepare(
          "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC"
        ).all(firstGroupId);
        
        console.log(`Found ${firstGroupMessages.length} messages in this group`);
        
        // Use these messages going forward if the intended group wasn't found
        if (firstGroupMessages.length > 0) {
          console.log(`Using messages from this group instead.`);
          groupMessages.push(...firstGroupMessages);
        }
      }
    }
    
    // 2. Find messages after the Carlos Lopes signup
    console.log(`\nFinding messages after ${formatTimestamp(CARLOS_LOPES_TIMESTAMP)}`);
    const messagesAfterSignup = groupMessages.filter(msg => 
      msg.timestamp >= CARLOS_LOPES_TIMESTAMP
    );
    
    console.log(`Found ${messagesAfterSignup.length} messages after the Carlos Lopes signup`);
    
    if (messagesAfterSignup.length > 0) {
      // Display these messages
      console.log("\n=== MESSAGES AFTER CARLOS LOPES SIGNUP ===");
      messagesAfterSignup.forEach((msg, i) => {
        console.log(`\nMessage #${i+1} - ${formatTimestamp(msg.timestamp)}`);
        console.log(`From: ${msg.sender}`);
        console.log(`Content: "${msg.content}"`);
      });
    }
    
    // 3. Search for messages containing our search keywords
    console.log(`\n\nSearching for messages containing "${SEARCH_KEYWORDS.join('" AND "')}"`);
    
    // First try in the Kia4all group
    let matchingMessages = groupMessages.filter(msg => 
      SEARCH_KEYWORDS.every(keyword => 
        msg.content && msg.content.toLowerCase().includes(keyword.toLowerCase())
      )
    );
    
    // If no matches in the target group, search all messages
    if (matchingMessages.length === 0) {
      console.log("No matches in the target group, searching all messages...");
      
      const allMessages = db.prepare(
        "SELECT * FROM messages WHERE content IS NOT NULL ORDER BY timestamp ASC"
      ).all();
      
      matchingMessages = allMessages.filter(msg => 
        SEARCH_KEYWORDS.every(keyword => 
          msg.content && msg.content.toLowerCase().includes(keyword.toLowerCase())
        )
      );
    }
    
    console.log(`Found ${matchingMessages.length} messages containing all search keywords`);
    
    if (matchingMessages.length > 0) {
      console.log("\n=== MATCHING MESSAGES ===");
      matchingMessages.forEach((msg, i) => {
        console.log(`\nMatch #${i+1} - ${formatTimestamp(msg.timestamp)}`);
        console.log(`Group: ${msg.chat_id}`);
        console.log(`From: ${msg.sender}`);
        console.log(`Content: "${msg.content}"`);
        
        // Check if it contains bracket markers
        if (msg.content.includes('[') || msg.content.includes(']')) {
          console.log("📝 CONTAINS BRACKETS - Likely edited or has reactions");
        }
      });
    }
    
    // 4. Search for messages from the specific phone number
    console.log(`\n\nSearching for messages from ${TARGET_PHONE}`);
    
    const phoneMessages = db.prepare(
      "SELECT * FROM messages WHERE sender LIKE ? ORDER BY timestamp ASC"
    ).all(`%${TARGET_PHONE}%`);
    
    console.log(`Found ${phoneMessages.length} messages from ${TARGET_PHONE}`);
    
    if (phoneMessages.length > 0) {
      console.log("\n=== MESSAGES FROM TARGET PHONE ===");
      phoneMessages.forEach((msg, i) => {
        console.log(`\nPhone Message #${i+1} - ${formatTimestamp(msg.timestamp)}`);
        console.log(`Group: ${msg.chat_id}`);
        console.log(`Content: "${msg.content}"`);
        
        // Check if this could be the specific message we're looking for
        if (msg.content.toLowerCase().includes('eric') || 
            msg.content.toLowerCase().includes('in com')) {
          console.log("⭐ POTENTIAL TARGET MESSAGE");
        }
      });
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the script
main();
