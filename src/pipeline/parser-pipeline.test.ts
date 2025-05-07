/**
 * Parser Pipeline Tests
 * 
 * Tests for the message parsing pipeline, focusing on real-world message detection.
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { MessageCommand, MsgParsed } from '../types/message-parsing';
import { ParserPipeline } from './parser-pipeline';
import { REGISTRATION_KEYWORDS } from '../constants';

// Specific test group ID
const TEST_GROUP_ID = '120363028202164779@g.us';
// Admin ID to test registration detection
const ADMIN_ID = '351918852769@s.whatsapp.net';

/**
 * Connect to the SQLite database
 */
function connectToTestDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'db', 'whatsapp.db');
  return new BetterSqlite3(dbPath, { readonly: true });
}

/**
 * Get messages from a specific group
 */
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

/**
 * Transform database message to a format compatible with our system
 */
function transformMessage(dbMessage: any) {
  return {
    id: dbMessage.key_id,
    timestamp: dbMessage.timestamp,
    sender: dbMessage.key_participant || dbMessage.key_remote_jid,
    content: dbMessage.data || '',
    fromMe: Boolean(dbMessage.key_from_me)
  };
}

describe('ParserPipeline', () => {
  let db: BetterSqlite3.Database;
  let messages: any[];
  let pipeline: ParserPipeline;
  
  beforeAll(() => {
    // Connect to database and load messages
    db = connectToTestDatabase();
    const dbMessages = getMessagesFromGroup(db, TEST_GROUP_ID);
    messages = dbMessages.map(transformMessage);
    
    // Initialize pipeline
    pipeline = new ParserPipeline();
  });
  
  afterAll(() => {
    // Close database connection
    if (db) {
      db.close();
    }
  });
  
  describe('Registration Detection', () => {
    test('should correctly identify registration opening messages from admin', () => {
      // Get admin messages only
      const adminMessages = messages.filter(msg => msg.sender === ADMIN_ID);
      
      // Process all messages
      const parsedMessages = adminMessages.map(msg => {
        // Add detection for registration keywords
        const result = pipeline.processMessage(msg);
        
        // Check if it contains registration keywords
        const hasRegistrationKeyword = REGISTRATION_KEYWORDS.some(keyword => 
          msg.content.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasRegistrationKeyword && msg.sender === ADMIN_ID) {
          console.log(`Found potential registration message: "${msg.content}"`);
        }
        
        return result;
      });
      
      // Find messages that were classified as registration openings
      const registrationMessages = parsedMessages.filter(
        msg => msg.modifier === MessageCommand.REGISTRATION_OPEN
      );
      
      // There should be at least one registration message
      expect(registrationMessages.length).toBeGreaterThan(0);
      
      // Log the found registration messages
      registrationMessages.forEach(msg => {
        console.log(`Registration opening message: "${msg.originalText}"`);
        console.log(`Timestamp: ${new Date(msg.timestamp * 1000).toISOString()}`);
      });
      
      // Check properties of the first registration message
      const firstRegistrationMsg = registrationMessages[0];
      expect(firstRegistrationMsg.sender).toBe(ADMIN_ID);
      
      // It should contain at least one of our registration keywords
      const hasKeyword = REGISTRATION_KEYWORDS.some(keyword => 
        firstRegistrationMsg.originalText.toLowerCase().includes(keyword.toLowerCase())
      );
      expect(hasKeyword).toBe(true);
    });
    
    test('should not flag non-admin messages as registration opening', () => {
      // Get non-admin messages
      const nonAdminMessages = messages.filter(msg => msg.sender !== ADMIN_ID);
      
      // Process messages
      const parsedNonAdminMessages = nonAdminMessages.map(msg => 
        pipeline.processMessage(msg)
      );
      
      // None should be classified as registration openings
      const wrongRegistrationMessages = parsedNonAdminMessages.filter(
        msg => msg.modifier === MessageCommand.REGISTRATION_OPEN
      );
      
      expect(wrongRegistrationMessages.length).toBe(0);
    });
  });
  
  describe('Message Filtering', () => {
    test('should correctly identify system messages', () => {
      const systemMessages = messages.filter(msg => 
        msg.content.startsWith('[') && msg.content.endsWith(']')
      );
      
      if (systemMessages.length > 0) {
        const parsedSystemMessages = systemMessages.map(msg => 
          pipeline.processMessage(msg)
        );
        
        parsedSystemMessages.forEach(msg => {
          expect(msg.modifier).toBe(MessageCommand.SYSTEM);
        });
      } else {
        console.log('No system messages found in the test group');
      }
    });
  });
});
