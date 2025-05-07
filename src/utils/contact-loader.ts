/**
 * Contact Loader Utility
 * 
 * This module provides utilities for loading and using contacts data
 * to convert phone numbers to display names.
 */

import fs from 'fs';
import path from 'path';

// Type for contacts mapping
export type ContactsMap = Record<string, string>;

/**
 * Load contacts from a JSON file
 * 
 * @param filePath Path to the contacts JSON file
 * @returns Map of phone numbers to display names
 */
export function loadContacts(filePath: string): ContactsMap {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Contacts file not found: ${filePath}`);
      return {};
    }
    
    const contactsData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(contactsData);
  } catch (error) {
    console.error(`Error loading contacts: ${error}`);
    return {};
  }
}

/**
 * Get a display name for a phone number or JID
 * 
 * @param phoneOrJid Phone number or WhatsApp JID
 * @param contacts Contacts map
 * @returns Display name or original phone/JID if not found
 */
export function getDisplayName(phoneOrJid: string, contacts: ContactsMap): string {
  // Clean the JID to get just the phone number
  const phoneNumber = phoneOrJid.replace('@s.whatsapp.net', '');
  
  // Try to find the contact
  return contacts[phoneNumber] || phoneNumber;
}

/**
 * Add display names to MsgParsed objects
 * 
 * @param messages Array of parsed messages
 * @param contacts Contacts map
 * @returns Messages with sender_name added
 */
export function addDisplayNames(messages: any[], contacts: ContactsMap): any[] {
  return messages.map(msg => {
    if (msg.sender) {
      const cleanSender = msg.sender.replace('@s.whatsapp.net', '');
      return {
        ...msg,
        sender_name: contacts[cleanSender] || cleanSender
      };
    }
    return msg;
  });
}
