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
  teamNumber?: number; // Team number for teams (1, 2, 3, etc.)
  isTeam: boolean; // Flag to indicate if this signup represents a team
}

/**
 * Extract a user-friendly name from a WhatsApp phone number
 */
function extractNameFromPhoneNumber(phoneNumber: string): string {
  // Remove the @s.whatsapp.net suffix if present
  const cleanPhone = phoneNumber.replace('@s.whatsapp.net', '');
  // Format it with last 9 digits
  const lastNine = cleanPhone.substring(Math.max(0, cleanPhone.length - 9));
  return lastNine;
}

/**
 * Core parsing function that processes a single message line
 */
function parseSignupMessageSingle(message: WhatsAppMessage): ParsedSignup | null {
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
  
  // Special case for just "In [time]" with no name
  const inTimePattern = /^\s*in\s+\d+\s*(?:h|:|\.)\s*/i;
  if (inTimePattern.test(content) && time) {
    const senderName = extractNameFromPhoneNumber(message.sender);
    return {
      originalMessage: content,
      names: [senderName],
      time,
      status: 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: false // Single player is not a team
    };
  }
  
  // Special case for handling all variations of slash notation:
  // - "Julien / Mark - 15h" (spaces around slash)
  // - "Mike/Ben 15h" (no spaces)
  // - "Mike /Ben" (space before slash but not after)
  // - "Mike/ Ben" (space after slash but not before)
  
  // Flexible slash pattern that handles all spacing variations
  const slashPattern = /^([A-Za-z\u00C0-\u017F\s'\-\.]+?)\s*\/\s*([A-Za-z\u00C0-\u017F\s'\-\.]+?)(?:\s*-?\s*(\d{1,2}(?:[h:.]\d{0,2})?)|$)/i;
  
  const slashTimeMatch = content.match(slashPattern);
  if (slashTimeMatch && slashTimeMatch[1] && slashTimeMatch[2]) {
    // Don't clean the names to preserve the exact name structure
    const name1 = slashTimeMatch[1].trim();
    const name2 = slashTimeMatch[2].trim();
    
    // If we found names with slash pattern
    if (name1.length > 1 && name2.length > 1) {
      return {
        originalMessage: content,
        names: [name1, name2],
        time,
        status: isOut ? 'OUT' : 'IN',
        timestamp: message.timestamp,
        sender: message.sender,
        isTeam: true // Two players with slash notation is a team
      };
    }
  }
  
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
      sender: message.sender,
      isTeam: processedNames.length > 1 // It's a team if there's more than one name
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
        sender: message.sender,
        isTeam: true // Player with partner is a team
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
        sender: message.sender,
        isTeam: true // Player with partner is a team
      };
    }
    
    return {
      originalMessage: content,
      names: [singlePlayer],
      time,
      status: isOut ? 'OUT' : 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: false // Single player is not a team
    };
  }
  
  // 3. Try general word splitting for other formats
  const names = parseGeneralMessage(content);
  
  // Special case for just "In [time]" messages
  // When we can extract time but no names, use the sender's phone number
  if (names.length === 0 && time) {
    // Check if it looks like a registration intent message with no name
    if (/^\s*in\b/i.test(content.trim()) || content.includes('15')) {
      const senderName = extractNameFromPhoneNumber(message.sender);
      return {
        originalMessage: content,
        names: [senderName],
        time,
        status: 'IN',
        timestamp: message.timestamp,
        sender: message.sender,
        isTeam: false // Single player is not a team
      };
    }
    return null;
  }
  
  // General case - only return a result if we found at least one name
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
    sender: message.sender,
    isTeam: processedNames.length > 1 // It's a team if there's more than one name
  };
}

/**
 * Parse a WhatsApp message to determine if it's a signup message
 * and extract relevant information. For multi-line messages,
 * each line is processed separately and an array of results is returned.
 */
export function parseSignupMessage(message: WhatsAppMessage): ParsedSignup | ParsedSignup[] | null {
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
  
  // Check for newlines - if found, process each line separately
  if (content.includes('\n')) {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const results: ParsedSignup[] = [];
    
    for (const line of lines) {
      // Create a new message object for each line
      const lineMessage: WhatsAppMessage = { 
        ...message, 
        content: line.trim() 
      };
      
      // Process the line
      const lineResult = parseSignupMessageSingle(lineMessage);
      if (lineResult) {
        results.push(lineResult);
      }
    }
    
    // Only return results if we found at least one valid signup
    return results.length > 0 ? results : null;
  }
  
  // If no newlines, process as a single message
  return parseSignupMessageSingle(message);
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
  // Handle "at" in messages like "Martin and Peter at 15h"
  const atTimePattern = /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+and\s+|\s+e\s+|\s+&\s+)(.*?)\s+at\s+/i;
  const atTimeMatch = content.match(atTimePattern);
  if (atTimeMatch) {
    let name1 = atTimeMatch[1].trim();
    let name2 = atTimeMatch[3].trim();
    
    // Clean up names
    name1 = cleanName(name1);
    name2 = cleanName(name2);
    
    if (name1.length > 1 && name2.length > 1) {
      return [name1, name2];
    }
  }
  
  // Pattern for team messages: "Name1 and Name2", "Name1 & Name2", etc.
  const teamPattern = /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+[&\/]\s+|\s+e\s+|\s+and\s+|\s+\+)([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+.*)?$/i;
  const teamMatch = content.match(teamPattern);
  
  if (teamMatch) {
    let name1 = teamMatch[1].trim();
    let name2 = teamMatch[3].trim();
    
    // Remove common command words from names
    name1 = name1.replace(/\s+in\b/i, '');
    name2 = name2.replace(/\s+in\b/i, '');
    name2 = name2.replace(/\s+at\b/i, ''); // Remove 'at' from second name
    
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
 * Processes each part of a divided message to extract potential player names
 * @returns An array of extracted names
 */
function parseGeneralMessage(content: string): string[] {
  // Skip messages that don't look like signups - prevent non-name phrases from being parsed
  if (/^can you|^please add|^could you|^would you/i.test(content)) {
    return [];
  }
  
  // Special case for just "In" commands without names
  if (/^\s*in\s+\d+\s*(?:h|:|\.)\s*/i.test(content)) {
    // Don't extract any names for plain "in 15h" messages
    // We'll handle this at the caller level
    return [];
  }
  
  // Special case for just a name (no time, no separators, no commands)
  // This addresses the "philipp effinger" case being incorrectly split
  if (!content.match(/\b(?:and|e|&|\+|\/|in|out|at)\b/i) && // No team separators or commands
      !content.match(/\d+[h:.]\d*/) && // No time format
      content.trim().length > 0) { // Not empty
    return [content.trim()]; // Return the whole message as a single name
  }
  
  // Handle special cases first
  // 1. Pattern for Giu+partner format
  const partnerPlusPattern = /([A-Za-z\u00C0-\u017F]+)\s*[+]\s*partner/i;
  const partnerPlusMatch = content.match(partnerPlusPattern);
  if (partnerPlusMatch) {
    const name = partnerPlusMatch[1].trim();
    return [name, `${name}'s partner`];
  }

  // Special case for handling Ruben in @ 17.00 style messages
  const atTimePattern = /^([A-Za-z\u00C0-\u017F\s]+)\s+in\s+@\s+\d/i;
  const atTimeMatch = content.match(atTimePattern);
  if (atTimeMatch) {
    return [atTimeMatch[1].trim()];
  }

  // Make sure 'e' is only treated as a separator when it's surrounded by spaces (like "Player1 e Player2")
  // not when it's part of a name (like "Mike")
  const separators = /\s*(?:[&+,\/]|\s+e\s+|and)\s*/i;
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
      /^partner$/i.test(part) || // Skip standalone partner word
      /^please$/i.test(part) || // Skip common words in requests/questions
      /^thanks$/i.test(part) || 
      /^thank you$/i.test(part) ||
      /^group$/i.test(part) ||
      /^add$/i.test(part) ||
      /^to$/i.test(part) ||
      /^the$/i.test(part)
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
    .replace(/\s+at\b/i, '') // Remove 'at' as it's usually related to time
    .replace(/[\d:]+h?/, '') // Remove time patterns
    .replace(/\s*-\s*/, '') // Remove dashes
    // Don't remove slashes from names, as they can be important in team names
    // .replace(/\s*\/\s*/, '') // This line was causing name truncation
    .replace(/[\d\.]+/, '') // Remove numbers
    .trim();
}
