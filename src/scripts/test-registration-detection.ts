#!/usr/bin/env node
/**
 * Test Registration Detection
 * 
 * This script tests the detection of registration opening messages 
 * in a specific WhatsApp group using our new parser pipeline.
 */

import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { MessageCommand } from '../types/message-parsing';
import { formatDateYYYYMMDDHHMMSS } from '../utils/date';
// Registration keywords from constants.ts
const REGISTRATION_KEYWORDS = [
  'Inscrições abertas',
  'Inscrições',
  'abertas',
  'inscrição',
  'Registros'
];

// Test group ID from the user's request
const TEST_GROUP_ID = '120363028202164779@g.us';

// Connect to the SQLite database
function connectToDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'db', 'whatsapp.db');
  return new BetterSqlite3(dbPath, { readonly: true });
}

// Get admin ID for the group (hardcoded for simplicity)
function getGroupAdmin(db: BetterSqlite3.Database, groupId: string): string {
  // For the specific group ID provided
  if (groupId === '120363028202164779@g.us') {
    return '351918852769@s.whatsapp.net'; // Known admin for this group
  }
  return '';  
}

// Get messages from the group
function getMessagesFromGroup(db: BetterSqlite3.Database, groupId: string) {
  return db.prepare(`
    SELECT 
      m.id,
      m.key_id,
      m.key_from_me,
      m.key_remote_jid,
      m.key_participant,
      m.status,
      m.data,
      m.timestamp,
      m.media_url,
      m.media_mime_type,
      m.media_size,
      m.media_name,
      m.media_duration,
      m.media_hash,
      m.origin,
      m.latitude,
      m.longitude
    FROM messages AS m
    WHERE m.key_remote_jid = ?
    ORDER BY m.timestamp ASC
  `).all(groupId);
}

// Transform database message to our format
function transformMessage(dbMessage: any) {
  return {
    id: dbMessage.key_id,
    timestamp: dbMessage.timestamp,
    sender: dbMessage.key_participant || dbMessage.key_remote_jid,
    content: dbMessage.data || '',
    fromMe: Boolean(dbMessage.key_from_me)
  };
}

// Main function
async function main() {
  console.log(`Testing registration detection for group ${TEST_GROUP_ID}`);
  
  // Connect to database
  const db = connectToDatabase();
  
  try {
    // Get group admin
    const admin = getGroupAdmin(db, TEST_GROUP_ID);
    if (!admin) {
      console.error(`No admin found for group ${TEST_GROUP_ID}`);
      return;
    }
    
    console.log(`Group admin: ${admin}`);
    console.log(`Registration keywords: ${REGISTRATION_KEYWORDS.join(', ')}`);
    
    // Get messages from the group
    const dbMessages = getMessagesFromGroup(db, TEST_GROUP_ID);
    console.log(`Found ${dbMessages.length} messages in the group`);
    
    // Transform messages to our format
    const messages = dbMessages.map(transformMessage);
    
    // Initialize parser pipeline
    const pipeline = new ParserPipeline();
    
    // First, look for admin messages that might be registration openings
    const adminMessages = messages.filter(msg => msg.sender === admin);
    console.log(`Found ${adminMessages.length} messages from admin`);
    
    // Process admin messages through pipeline
    console.log('\nAnalyzing admin messages for registration keywords:');
    console.log('------------------------------------------------');
    
    let registrationMessages = [];
    
    for (const msg of adminMessages) {
      // Check if message contains any registration keywords
      const hasKeyword = REGISTRATION_KEYWORDS.some(
        keyword => msg.content.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasKeyword) {
        console.log(`\nPotential registration message found:`);
        console.log(`Date: ${formatDateYYYYMMDDHHMMSS(new Date(msg.timestamp * 1000))}`);
        console.log(`Message: "${msg.content}"`);
        
        // Process through pipeline
        const parsedMsg = pipeline.processMessage(msg);
        if (parsedMsg.modifier === MessageCommand.REGISTRATION_OPEN) {
          registrationMessages.push(parsedMsg);
        }
      }
    }
    
    // Results
    console.log('\n------------------------------------------------');
    console.log(`Found ${registrationMessages.length} registration opening messages`);
    
    if (registrationMessages.length > 0) {
      console.log('\nRegistration opening messages:');
      registrationMessages.forEach((msg, i) => {
        console.log(`\n${i+1}. Date: ${formatDateYYYYMMDDHHMMSS(new Date(msg.timestamp * 1000))}`);
        console.log(`   Message: "${msg.originalText}"`);
      });
    }
    
    // Process a sample of all messages
    console.log('\nProcessing sample of all messages:');
    console.log('--------------------------------');
    
    const sampleSize = Math.min(5, messages.length);
    const messageSample = messages.slice(0, sampleSize);
    
    for (const msg of messageSample) {
      console.log(`\nProcessing message: "${msg.content}"`);
      const parsedMsg = pipeline.processMessage(msg);
      console.log(`Detected command: ${parsedMsg.modifier}`);
      
      if (parsedMsg.players.length > 0) {
        console.log(`Detected players: ${parsedMsg.players.map(p => p.displayName).join(', ')}`);
      }
      
      if (parsedMsg.isTeam) {
        console.log(`Detected as team: ${parsedMsg.isTeam}`);
      }
      
      if (parsedMsg.batch) {
        console.log(`Detected batch: ${parsedMsg.batch}`);
      }
    }
    
  } finally {
    // Close database connection
    db.close();
  }
}

// Run the script
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
