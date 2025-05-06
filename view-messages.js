#!/usr/bin/env node

// Script to view all messages from a WhatsApp group after registration time
const betterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Configuration
const groupId = '351919755889-1528547030@g.us'; // Kia4all group ID
const dbPath = path.resolve(process.cwd(), 'session/messages.db');

// Functions for data access
function openDatabase() {
  return new betterSqlite3(dbPath, { readonly: true });
}

function getGroupMessagesAfterRegistration(db, groupId) {
  // First get registration timestamp (approximate)
  // For Kia4all, we know registration is typically opened around 6-7 PM on Friday
  const fridayTimestamp = getLastFridayTimestamp();
  
  console.log(`Using reference timestamp: ${new Date(fridayTimestamp * 1000).toLocaleString()}`);
  
  // Get all messages after this timestamp
  const stmt = db.prepare(
    'SELECT * FROM messages WHERE groupId = ? AND timestamp >= ? ORDER BY timestamp ASC'
  );
  return stmt.all(groupId, fridayTimestamp);
}

function getLastFridayTimestamp() {
  // Use a hardcoded timestamp that's early enough to capture registration
  // This timestamp is 5 PM on a recent Friday
  return 1719086400; // Use this as a starting point
}

// Main function
function main() {
  try {
    console.log(`Opening database at ${dbPath}`);
    const db = openDatabase();
    
    // Get messages
    const messages = getGroupMessagesAfterRegistration(db, groupId);
    console.log(`Found ${messages.length} messages in the Kia4all group after reference time`);
    
    // Print all messages with relevant details
    messages.forEach((message, index) => {
      const date = new Date(message.timestamp * 1000);
      console.log(`\n--- Message #${index + 1} ---`);
      console.log(`Time: ${date.toLocaleString()}`);
      console.log(`Sender: ${message.sender}`);
      console.log(`Content: "${message.content}"`);
      
      // Highlight messages related to "In com Eric"
      if (
        (message.content.toLowerCase().includes('in com') && 
         message.content.toLowerCase().includes('eric')) ||
        message.sender.includes('351966314427')
      ) {
        console.log(`>>> IMPORTANT MESSAGE <<<`);
      }
    });
    
    // Output a separate list of just messages from the specific number
    const specificMessages = messages.filter(m => m.sender.includes('351966314427'));
    console.log(`\n\n===== MESSAGES FROM +351 966 314 427 =====`);
    console.log(`Found ${specificMessages.length} messages`);
    
    specificMessages.forEach((message, index) => {
      const date = new Date(message.timestamp * 1000);
      console.log(`\n${index + 1}. [${date.toLocaleString()}] "${message.content}"`);
    });
    
    // Output messages containing "in com" and "eric"
    const ericMessages = messages.filter(m => 
      m.content.toLowerCase().includes('in com') && 
      m.content.toLowerCase().includes('eric')
    );
    
    console.log(`\n\n===== MESSAGES CONTAINING "IN COM ERIC" =====`);
    console.log(`Found ${ericMessages.length} messages`);
    
    ericMessages.forEach((message, index) => {
      const date = new Date(message.timestamp * 1000);
      console.log(`\n${index + 1}. [${date.toLocaleString()}] From: ${message.sender} | "${message.content}"`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
main();
