/**
 * Text Formatting Utilities
 * 
 * This module provides utility functions for text formatting,
 * including name cleaning and message content formatting.
 */

import { NAME_PATTERNS } from '../../constants';

/**
 * Clean a name string by removing extraneous information
 * and standardizing format
 * 
 * @param name The name to clean
 * @returns The cleaned name
 */
export function cleanName(name: string): string {
  if (!name) return '';
  
  // Trim whitespace
  let cleanedName = name.trim();
  
  // Remove common command words
  cleanedName = cleanedName.replace(/\s+in\b|\bin\s+/i, '');
  cleanedName = cleanedName.replace(/\s+out\b|\bout\s+/i, '');
  cleanedName = cleanedName.replace(/\s+at\b|\bat\s+/i, '');
  
  // Remove time information if present (e.g., 15h, 15:00, etc.)
  cleanedName = cleanedName.replace(/\s*\d{1,2}[h:.]?\d{0,2}\b/g, '');
  
  // Remove common prefixes and special characters
  cleanedName = cleanedName.replace(/^\s*[-•]?\s*/, '');
  cleanedName = cleanedName.replace(/\s*-\s*/, '');
  
  // Normalize whitespace
  cleanedName = cleanedName.replace(/\s+/g, ' ');
  
  return cleanedName.trim();
}

/**
 * Clean message content by removing reaction markers, emojis, 
 * and other extraneous content
 * 
 * @param content The message content to clean
 * @returns The cleaned message content
 */
export function cleanMessageContent(content: string): string {
  if (!content) return '';
  
  // Remove WhatsApp reaction markers and quoted messages
  let cleanedContent = content
    .replace(/^\s*\[.*?\]\s*/g, '') // Remove reaction markers like [EDITEDMESSAGE] or [🔥]
    .replace(/^\s*\(.*?\)\s*/g, '') // Remove parenthetical marks
    .replace(/^>\s.*?\n/gm, '')  // Remove quoted messages (lines starting with >)
    .trim();
    
  // Handle emojis that might be used as reaction markers
  cleanedContent = cleanedContent.replace(/^\s*[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}]\s*/gu, '');
  
  return cleanedContent;
}

/**
 * Extract name from a phone number
 * 
 * @param phoneNumber WhatsApp phone number
 * @returns Cleaned phone number
 */
export function extractNameFromPhoneNumber(phoneNumber: string): string {
  // Remove the @s.whatsapp.net suffix if present
  const cleanPhone = phoneNumber.replace('@s.whatsapp.net', '');
  // Return the full phone number (including country code) to maintain proper identification
  return cleanPhone;
}

/**
 * Check if a name is likely a real name and not a system message or other text
 * 
 * @param name Name to check
 * @returns True if it looks like a valid player name
 */
export function isValidPlayerName(name: string): boolean {
  if (!name || name.length < 2) return false;
  
  // Exclude common non-name strings
  const nonNamePatterns = [
    /^system$/i,
    /^protocol$/i,
    /^\d+$/,      // Just numbers
    /^[<>{}()\[\]]/,  // Starts with brackets or other syntax
    /^https?:/i,  // URLs
  ];
  
  for (const pattern of nonNamePatterns) {
    if (pattern.test(name)) return false;
  }
  
  return true;
}
