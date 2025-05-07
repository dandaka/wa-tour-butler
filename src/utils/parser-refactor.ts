/**
 * Registration Parser
 * Parses WhatsApp messages to extract player registrations for tournaments
 */

import * as fs from 'fs';
import * as path from 'path';

// Import types from the types directory
import { WhatsAppMessage } from '../types/messages';
import { Contact, Player, ParsedRegistration } from '../types/parser';

/**
 * Loads WhatsApp messages from a JSON file
 * @param filePath Path to the JSON file
 * @returns Array of WhatsApp messages
 */
export function loadMessages(filePath: string): WhatsAppMessage[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const messages = JSON.parse(fileContent);
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    console.error(`Error loading messages: ${error}`);
    return [];
  }
}

/**
 * Loads contact information from a JSON file
 * @param filePath Path to the JSON file
 * @returns Array of contacts
 */
export function loadContacts(filePath: string): Contact[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const contactsObj = JSON.parse(fileContent);
    
    // Convert the object format to an array of Contact objects
    return Object.entries(contactsObj).map(([phoneNumber, name]) => ({
      phoneNumber,
      name: name as string
    }));
  } catch (error) {
    console.error(`Error loading contacts: ${error}`);
    return [];
  }
}
