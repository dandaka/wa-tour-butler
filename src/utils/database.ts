/**
 * Database utility functions for the WhatsApp Tournament Butler
 */

import BetterSqlite3 from 'better-sqlite3';
import { WhatsAppMessage } from '../types/messages';
import { DB_PATH } from '../constants';

type DatabaseType = ReturnType<typeof BetterSqlite3>;

// Interface for messages retrieved from the database
export interface DatabaseMessage extends WhatsAppMessage {
  id: string;
  chat_id: string;
  is_from_me: number;
}

/**
 * Connect to the SQLite database
 * @returns Database connection
 */
export function connectToDatabase(): DatabaseType {
  return new BetterSqlite3(DB_PATH);
}

/**
 * Get all messages from a specific WhatsApp group
 * @param db Database connection
 * @param groupId WhatsApp group ID
 * @returns Array of messages from the group
 */
export function getMessagesFromGroup(db: DatabaseType, groupId: string): DatabaseMessage[] {
  const query = `
    SELECT id, chat_id, sender, timestamp, content, is_from_me
    FROM messages
    WHERE chat_id = ?
    ORDER BY timestamp ASC
  `;
  
  return db.prepare(query).all(groupId) as DatabaseMessage[];
}

/**
 * Get messages from a specific sender in a group
 * @param db Database connection
 * @param groupId WhatsApp group ID
 * @param sender Sender's phone number
 * @returns Array of messages from the specified sender
 */
export function getMessagesFromSender(db: DatabaseType, groupId: string, sender: string): DatabaseMessage[] {
  const query = `
    SELECT id, chat_id, sender, timestamp, content, is_from_me
    FROM messages
    WHERE chat_id = ? AND sender LIKE ?
    ORDER BY timestamp ASC
  `;
  
  // Handle both formats: with and without @s.whatsapp.net suffix
  const senderPattern = sender.includes('@') ? sender : `%${sender}%`;
  
  return db.prepare(query).all(groupId, senderPattern) as DatabaseMessage[];
}

/**
 * Get messages after a specific timestamp
 * @param db Database connection
 * @param groupId WhatsApp group ID
 * @param timestamp Unix timestamp (seconds)
 * @returns Array of messages after the timestamp
 */
export function getMessagesAfterTimestamp(db: DatabaseType, groupId: string, timestamp: number): DatabaseMessage[] {
  const query = `
    SELECT id, chat_id, sender, timestamp, content, is_from_me
    FROM messages
    WHERE chat_id = ? AND timestamp >= ?
    ORDER BY timestamp ASC
  `;
  
  return db.prepare(query).all(groupId, timestamp) as DatabaseMessage[];
}

/**
 * Search for messages containing specific text
 * @param db Database connection
 * @param groupId WhatsApp group ID
 * @param searchText Text to search for
 * @returns Array of messages matching the search
 */
export function searchMessages(db: DatabaseType, groupId: string, searchText: string): DatabaseMessage[] {
  const query = `
    SELECT id, chat_id, sender, timestamp, content, is_from_me
    FROM messages
    WHERE chat_id = ? AND content LIKE ?
    ORDER BY timestamp ASC
  `;
  
  return db.prepare(query).all(groupId, `%${searchText}%`) as DatabaseMessage[];
}
