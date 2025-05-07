/**
 * Contacts Service
 * 
 * This module provides functionality for working with WhatsApp contacts,
 * including retrieving contact names from the database.
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

type DatabaseType = ReturnType<typeof BetterSqlite3>;

// Interface for contact information
interface ContactInfo {
  name?: string;
  notify?: string;
  push_name?: string;
  is_group?: boolean;
}

// Path to the WhatsApp messages database that contains contact information
const WHATSAPP_DB_PATH = path.join(process.cwd(), 'data', 'whatsapp_messages.db');

/**
 * Connect to the WhatsApp messages database
 * @returns Database connection to the WhatsApp database
 */
export function connectToWhatsAppDatabase(): DatabaseType {
  try {
    return new BetterSqlite3(WHATSAPP_DB_PATH);
  } catch (error) {
    console.error(`Error connecting to WhatsApp database at ${WHATSAPP_DB_PATH}:`, error);
    throw error;
  }
}

/**
 * Get contact display name from a WhatsApp JID (phone number or group ID)
 * 
 * @param jid WhatsApp ID (phone number + @s.whatsapp.net or group ID + @g.us)
 * @returns Best available name for the contact or formatted JID if no name available
 */
export function getContactDisplayName(jid: string): string {
  try {
    // Connect to the WhatsApp messages database
    const db = connectToWhatsAppDatabase();
    
    try {
      // First try to get the name from the contacts table
      const contactInfo = db.prepare(`
        SELECT name, notify, push_name, is_group 
        FROM contacts 
        WHERE jid = ?
      `).get(jid) as ContactInfo | undefined;
    
    if (contactInfo) {
      // Use the best available name
      if (contactInfo.name) {
        return contactInfo.name;
      } else if (contactInfo.notify) {
        return contactInfo.notify;
      } else if (contactInfo.push_name) {
        return contactInfo.push_name;
      }
    }
    
      // If we don't have the contact info, fall back to formatting the JID
      // Check if it's a group chat
      if (jid.endsWith('@g.us')) {
        // Extract group information from JID if possible
        const isNumericGroup = /^\d+-\d+@g\.us$/.test(jid);
        if (isNumericGroup) {
          // Extract the creation timestamp part which might help identify the group
          const parts = jid.split('@')[0].split('-');
          if (parts.length >= 2) {
            // Format as "Group by XXXXX"
            const phoneNumber = parts[0].substring(Math.max(0, parts[0].length - 5));
            return `Group by ${phoneNumber}`;
          }
        }
        return 'Unknown Group';
      }
      
      // For individual contacts, extract the phone number
      return jid.replace('@s.whatsapp.net', '');
    } finally {
      // Always close the database connection
      db.close();
    }
  } catch (error) {
    console.error(`Error getting contact display name for ${jid}:`, error);
    // Fall back to just the JID without suffix
    return jid.split('@')[0];
  }
}

/**
 * Check if a WhatsApp database has contacts data available
 * 
 * @param db Database connection
 * @returns True if contacts are available, false otherwise
 */
export function hasContactsData(db: DatabaseType): boolean {
  try {
    const contactsCount = db.prepare(`
      SELECT COUNT(*) as count FROM contacts
      WHERE name IS NOT NULL OR notify IS NOT NULL OR push_name IS NOT NULL
    `).get() as { count: number };
    
    return contactsCount.count > 0;
  } catch (error) {
    console.error('Error checking contacts data:', error);
    return false;
  }
}
