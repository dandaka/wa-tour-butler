#!/usr/bin/env node
/**
 * Extract Test Messages
 * 
 * This script extracts messages from a specified WhatsApp group
 * for the last week (or specified time period) and saves them to a JSON file.
 * These messages can then be used for testing the parser pipeline.
 */

import path from 'path';
import fs from 'fs';
import BetterSqlite3 from 'better-sqlite3';
import { formatDateYYYYMMDDHHMMSS } from '../utils/date';

// Test group ID
const DEFAULT_GROUP_ID = '120363028202164779@g.us';

// Database connection
function connectToDatabase() {
  // Paths to potential database files (in order of preference)
  const potentialDbPaths = [
    path.join(process.cwd(), 'data', 'whatsapp_messages.db'),
    path.join(process.cwd(), 'data', 'messages.db'),
    path.join(process.cwd(), 'data', 'group_messages.db')
  ];
  
  // Find the first existing database file
  let dbPath = null;
  for (const potentialPath of potentialDbPaths) {
    if (fs.existsSync(potentialPath)) {
      dbPath = potentialPath;
      console.log(`Using database: ${dbPath}`);
      break;
    }
  }
  
  if (!dbPath) {
    console.error('No valid database file found!');
    process.exit(1);
  }
  
  return new BetterSqlite3(dbPath, { readonly: true });
}

// Extract messages from the last N days
function extractRecentMessages(db: BetterSqlite3.Database, groupId: string, days: number = 7) {
  // Calculate timestamp for X days ago
  const now = new Date();
  const daysAgoTimestamp = Math.floor(new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).getTime() / 1000);
  
  console.log(`Extracting messages since: ${formatDateYYYYMMDDHHMMSS(new Date(daysAgoTimestamp * 1000))}`);
  
  return db.prepare(`
    SELECT 
      id,
      chat_id,
      sender,
      timestamp,
      message_type,
      content,
      is_from_me,
      raw_data,
      created_at
    FROM messages
    WHERE chat_id = ? AND timestamp >= ?
    ORDER BY timestamp ASC
  `).all(groupId, daysAgoTimestamp);
}

// Transform database message to our format for testing
function transformMessages(dbMessages: any[]) {
  return dbMessages.map(msg => ({
    id: msg.id,
    timestamp: msg.timestamp,
    sender: msg.sender || msg.chat_id,
    content: msg.content || '',
    fromMe: Boolean(msg.is_from_me)
  }));
}

// Save messages to file
function saveMessagesToFile(messages: any[], filePath: string) {
  const dirPath = path.dirname(filePath);
  
  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
  console.log(`Saved ${messages.length} messages to: ${filePath}`);
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const groupId = args[0] || DEFAULT_GROUP_ID;
  const days = args[1] ? parseInt(args[1], 10) : 7;
  const outputPath = args[2] || path.join(process.cwd(), 'data', 'test-data', `${groupId.split('@')[0]}-messages.json`);
  
  console.log(`Extracting messages for group: ${groupId}`);
  console.log(`Time period: last ${days} days`);
  console.log(`Output path: ${outputPath}`);
  
  // Connect to database
  const db = connectToDatabase();
  
  try {
    // Extract messages
    const dbMessages = extractRecentMessages(db, groupId, days);
    console.log(`Found ${dbMessages.length} messages`);
    
    // Transform to simplified format
    const messages = transformMessages(dbMessages);
    
    // Save to file
    saveMessagesToFile(messages, outputPath);
    
    // Print a sample message for verification
    if (messages.length > 0) {
      console.log('\nSample message:');
      console.log(messages[0]);
    }
    
    console.log('\nExtraction complete!');
  } catch (error) {
    console.error('Error extracting messages:', error);
  } finally {
    // Close database connection
    db.close();
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
