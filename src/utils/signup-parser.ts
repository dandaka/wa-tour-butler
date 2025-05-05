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
    // Handle partner cases for teams
    const processedNames = processPartnerNames(teamResult);
    
    return {
      originalMessage: content,
      names: processedNames,
      time,
      status: isOut ? 'OUT' : 'IN',
      timestamp: message.timestamp,
      sender: message.sender
    };
  }
  
  // 2. Try single player pattern (e.g., "Name in 15h")
  const singlePlayer = parseSinglePlayerMessage(content);
  if (singlePlayer) {
    // Handle special case for "with partner" explicitly
    const withPartnerPattern = /^([A-Za-z\u00C0-\u017F]+)[\s\w]*(?:with|com)\s+partner/i;
    const withPartnerMatch = content.match(withPartnerPattern);
    
    if (withPartnerMatch) {
      const name = withPartnerMatch[1].trim();
      return {
        originalMessage: content,
        names: [name, `${name}'s partner`],
        time,
        status: isOut ? 'OUT' : 'IN',
        timestamp: message.timestamp,
        sender: message.sender
      };
    }
    
    // Check if this is a player with partner (other patterns)
    if (content.toLowerCase().includes('with partner') || 
        content.toLowerCase().includes('com partner') ||
        content.toLowerCase().includes('+ partner')) {
      const playerName = singlePlayer.replace(/\s+with\s+partner/i, '');
      return {
        originalMessage: content,
        names: [playerName, `${playerName}'s partner`],
        time,
        status: isOut ? 'OUT' : 'IN',
        timestamp: message.timestamp,
        sender: message.sender
      };
    }
    
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
  
  // Process partner names in general messages too
  const processedNames = processPartnerNames(names);
  
  return {
    originalMessage: content,
    names: processedNames,
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
 * Helper function to process partner names
 * Converts generic "partner" to "[PlayerName]'s partner"
 */
function processPartnerNames(names: string[]): string[] {
  const result: string[] = [];
  let lastRealName = "";
  
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    
    // Keep track of the last real name (not a partner)
    if (name.toLowerCase() !== 'partner' && !name.toLowerCase().includes('partner')) {
      lastRealName = name;
    }
    
    // Check if this is a generic partner name or contains the word "partner"
    if (name.toLowerCase() === 'partner' && lastRealName) {
      // Use the previous player's name to create a more descriptive partner name
      result.push(`${lastRealName}'s partner`);
    } else if (name.toLowerCase().includes('partner') && name.toLowerCase() !== 'partner' && lastRealName) {
      // If it includes "partner" but isn't just "partner", replace it
      if (name.match(/\s+with\s+partner/i)) {
        result.push(name.replace(/\s+with\s+partner/i, ''));
        result.push(`${lastRealName}'s partner`);
      } else {
        result.push(name);
      }
    } else {
      result.push(name);
    }
  }
  
  return result;
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
    let name1 = teamMatch[1].trim();
    let name2 = teamMatch[3].trim();
    
    // Check if either name ends with "in" command word and remove it
    name1 = name1.replace(/\s+in\b/i, '');
    name2 = name2.replace(/\s+in\b/i, '');
    
    // Special case for "Name+partner" or "Name & partner"
    if (name2.toLowerCase() === 'partner') {
      name2 = `${name1}'s partner`;
    }
    
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
    // Remove the "in" command if it's part of the name
    let name = singleMatch[1].trim();
    name = name.replace(/\s+in\b/i, '');
    return cleanName(name);
  }
  
  return null;
}

/**
 * Parse a general message by splitting it into parts based on common separators
 */
function parseGeneralMessage(content: string): string[] {
  // Handle special cases first
  // 1. Pattern for Giu+partner format
  const partnerPlusPattern = /([A-Za-z\u00C0-\u017F]+)\s*[+]\s*partner/i;
  const partnerPlusMatch = content.match(partnerPlusPattern);
  if (partnerPlusMatch) {
    const name = partnerPlusMatch[1].trim();
    return [name, `${name}'s partner`];
  }

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
      /^\d\d?[:-]\d\d?$/.test(part) || // Skip any time-like format
      /^partner$/i.test(part) // Skip standalone partner word
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
    .replace(/\s+in\b|\s+out\b/i, '') // Remove trailing in/out words
    .replace(/[\d:]+h?/, '') // Remove time patterns
    .replace(/\s*@\s*/, '') // Remove @ symbol
    .replace(/\s*-\s*/, '') // Remove dashes
    .replace(/\s*\/\s*/, '') // Remove slashes
    .replace(/[\d\.]+/, '') // Remove numbers
    .trim();
}
