/**
 * WhatsApp Signup Message Parser
 * 
 * This module provides functionality to parse WhatsApp messages for tournament signups,
 * extracting player names, time slots, and signup status (IN/OUT).
 */

/**
 * Types for the parser
 */
export interface WhatsAppMessage {
  id?: string;
  chat_id?: string;
  sender: string;
  timestamp: number;
  content: string;
  is_from_me?: number;
}

export interface ParsedSignup {
  originalMessage: string;
  names: string[];
  time?: string;
  status: 'IN' | 'OUT';
  timestamp: number;
  sender: string;
}

/**
 * Parse a WhatsApp message to determine if it's a signup message
 * and extract relevant information
 */
export function parseSignupMessage(message: WhatsAppMessage): ParsedSignup | null {
  const content = message.content.trim();
  
  // Skip empty messages
  if (!content) return null;
  
  // Skip protocol and system messages
  if (isSystemMessage(content)) {
    return null;
  }

  // Skip messages that look like they're from the admin with registration info
  if (content.includes('Inscrições abertas')) {
    return null;
  }
  
  // Check if it's an OUT message
  const isOut = isOutMessage(content);
  
  // Extract time if present (common formats: 15h, 15:00, etc.)
  const timeMatch = extractTimePattern(content);
  const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
  
  // Try different parsing strategies in order
  
  // 1. Try team pattern first (e.g., "Name1 and Name2 15h")
  const teamResult = parseTeamMessage(content);
  if (teamResult) {
    return {
      originalMessage: content,
      names: teamResult,
      time,
      status: isOut ? 'OUT' : 'IN',
      timestamp: message.timestamp,
      sender: message.sender
    };
  }
  
  // 2. Try single player pattern (e.g., "Name in 15h")
  const singlePlayer = parseSinglePlayerMessage(content);
  if (singlePlayer) {
    return {
      originalMessage: content,
      names: [singlePlayer],
      time,
      status: isOut ? 'OUT' : 'IN',
      timestamp: message.timestamp,
      sender: message.sender
    };
  }
  
  // 3. Try general word splitting for other formats
  const names = parseGeneralMessage(content);
  
  // Only return a result if we found at least one name
  if (names.length === 0) {
    return null;
  }
  
  return {
    originalMessage: content,
    names,
    time,
    status: isOut ? 'OUT' : 'IN',
    timestamp: message.timestamp,
    sender: message.sender
  };
}

/**
 * Check if a message is a system or protocol message
 */
function isSystemMessage(content: string): boolean {
  return (
    content.includes('[PROTOCOLMESSAGE]') || 
    content.includes('[MESSAGECONTEXTINFO]') ||
    content.includes('[SENDERKEYDISTRIBUTIONMESSAGE]') ||
    content.match(/^(\d+)$/) !== null || // Just a number
    content.length < 3 // Too short to be meaningful
  );
}

/**
 * Check if a message indicates a player is dropping OUT
 */
function isOutMessage(content: string): boolean {
  return /\b(out|sai|saio|n[aã]o posso|can't make it|cancel)\b/i.test(content);
}

/**
 * Extract time pattern from message
 */
function extractTimePattern(content: string): RegExpMatchArray | null {
  // Try multiple patterns to cover different formats
  const patterns = [
    /\b(\d{1,2})[h:](\d{2})?\b|\b(\d{1,2})h\b/i,  // Common formats: 15h, 15:00
    /\b(\d{1,2})\.(\d{2})\b/i,                      // Format: 15.00
    /\b(\d{1,2})\s+(?:and|e)\s+(\d{1,2})\b/i,       // Format: 15 and 17
    /\b(\d{1,2})\b(?!\s*(?:and|e))/i                // Just a number not followed by 'and' or 'e'
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match;
    }
  }
  
  return null;
}

/**
 * Format extracted time matches into a consistent format
 */
export function formatTimeMatch(timeMatch: RegExpMatchArray): string {
  // Format depends on the regex that matched
  if (timeMatch[0].includes('.')) {
    // Format like "15.00"
    return `${timeMatch[1]}:${timeMatch[2] || '00'}`;
  } else if (timeMatch[3]) {
    // Format like "15h"
    return `${timeMatch[3]}:00`;
  } else if (timeMatch[1] && timeMatch[2]) {
    // Format like "15:00" or "15 and 17"
    if (timeMatch[0].match(/\b(?:and|e)\b/i)) {
      // For "15 and 17" pattern, just return the first time
      return `${timeMatch[1]}:00`;
    }
    return `${timeMatch[1]}:${timeMatch[2].padEnd(2, '0')}`;
  } else if (timeMatch[1]) {
    // Format like "15"
    return `${timeMatch[1]}:00`;
  }
  return "";
}

/**
 * Parse a message that appears to contain a team (two people)
 * e.g., "Name1 and Name2 15h"
 */
function parseTeamMessage(content: string): string[] | null {
  // Pattern for team messages: "Name1 and Name2", "Name1 & Name2", etc.
  const teamPattern = /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+[&\/]\s+|\s+e\s+|\s+and\s+|\s+\+)([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+.*)?$/i;
  const teamMatch = content.match(teamPattern);
  
  if (teamMatch) {
    const name1 = teamMatch[1].trim();
    const name2 = teamMatch[3].trim();
    
    // Only if both parts look like names (2+ chars, not just numbers/times)
    if (name1.length > 1 && name2.length > 1 && 
        !/^\d+[h:]\d*$/.test(name1) && !/^\d+[h:]\d*$/.test(name2)) {
      return [name1, name2];
    }
  }
  
  return null;
}

/**
 * Parse a message that appears to contain a single player
 * e.g., "Name 15h" or "Name in 15h"
 */
function parseSinglePlayerMessage(content: string): string | null {
  // Pattern for single player messages: "Name in 15h", "Name 15h"
  const singlePlayerPattern = /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+in\s+|\s+)(\d+[h:]?\d*|\b)?$/i;
  const singleMatch = content.match(singlePlayerPattern);
  
  if (singleMatch && singleMatch[1].trim().length > 1) {
    return cleanName(singleMatch[1].trim());
  }
  
  return null;
}

/**
 * Parse a general message by splitting it into parts based on common separators
 */
function parseGeneralMessage(content: string): string[] {
  const separators = /\s*(?:[&+,\/]|e|and)\s*/i;
  const parts = content.split(separators);
  const names: string[] = [];
  
  for (const part of parts) {
    // Skip parts that might be just time or other info
    if (
      /^\d+[h:]?\d*$/.test(part) || // Skip time patterns
      /^in$|^out$|^sim$|^yes$|^no$|^não$/i.test(part) || // Skip yes/no words
      /^\s*$/.test(part) || // Skip empty parts
      /^\d\d?:\d\d$/.test(part) || // Skip time format HH:MM
      /^\d\d?h\d\d?$/.test(part) || // Skip time format HHhMM
      /^\d\d?[:-]\d\d?$/.test(part) // Skip any time-like format
    ) {
      continue;
    }
    
    const cleanedName = cleanName(part);
    
    // Only add if it looks like a name (not just a single character or symbol)
    if (cleanedName.length > 1 && !/^[\d\W]+$/.test(cleanedName)) {
      names.push(cleanedName);
    }
  }
  
  return names;
}

/**
 * Clean a name by removing special characters, symbols, and words like "in"/"out"
 */
function cleanName(name: string): string {
  return name.trim()
    .replace(/^\s*[-•]?\s*/, '') // Remove leading dashes or bullets
    .replace(/\s+/, ' ') // Normalize spaces
    .replace(/\bin\b|\bout\b/i, '') // Remove standalone in/out words
    .replace(/[\d:]+h?/, '') // Remove time patterns
    .replace(/\s*@\s*/, '') // Remove @ symbol
    .replace(/\s*-\s*/, '') // Remove dashes
    .replace(/\s*\/\s*/, '') // Remove slashes
    .replace(/[\d\.]+/, '') // Remove numbers
    .trim();
}
