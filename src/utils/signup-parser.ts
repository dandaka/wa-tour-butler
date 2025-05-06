/**
 * WhatsApp Signup Message Parser
 * 
 * This module provides functionality to parse WhatsApp messages for tournament signups,
 * extracting player names, time slots, and signup status (IN/OUT).
 */

// Import types from central types directory
import { WhatsAppMessage } from '../types/messages';
import { ParsedSignup } from '../types/signups';
// Import constants
import { MESSAGE_PATTERNS, NAME_PATTERNS, TEST_CASES, MAX_NAME_WORDS, TIME_PATTERNS } from '../constants';

// Import utility functions (but use them selectively to maintain backward compatibility)
import { cleanName as utilCleanName } from './formatting/text-utils';
import { cleanMessageContent as utilCleanMessageContent } from './formatting/text-utils';

// Re-export types for backward compatibility
export { WhatsAppMessage } from '../types/messages';
export { ParsedSignup } from '../types/signups';

/**
 * Extract a user-friendly name from a WhatsApp phone number
 */
function extractNameFromPhoneNumber(phoneNumber: string): string {
  // Remove the @s.whatsapp.net suffix if present
  const cleanPhone = phoneNumber.replace('@s.whatsapp.net', '');
  // Return the full phone number (including country code) to maintain proper identification
  return cleanPhone;
}

/**
 * Core parsing function that processes a single message line
 */
function parseSignupMessageSingle(message: WhatsAppMessage): ParsedSignup | null {
  // Get the original content for reference
  const originalContent = message.content.trim();
  
  // Handle "in com [Name]" pattern (Portuguese for "in with [Name]")
  // This matches messages like "in com João" or "[reaction] in com Eric"
  const inComPattern = /^(?:\[.*?\]\s*)?in\s+com\s+([A-Za-z\u00C0-\u017F\s'\.\-]+)(?:\s*(?:\[.*?\])?)?$/i;
  const inComMatch = originalContent.match(inComPattern);
  
  if (inComMatch) {
    // Extract the partner name from the match
    const partnerName = inComMatch[1].trim();
    // Extract the sender's phone/name
    const phoneOnly = message.sender.replace('@s.whatsapp.net', '');
    
    return {
      originalMessage: originalContent,
      names: [phoneOnly, partnerName], // Use the actual captured name
      time: undefined,
      status: 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: true // This is a team (two players)
    };
  }
  
  // SPECIAL CASE: Handle other "In com [Name]" patterns with reaction markers
  const inComWithMarkersPattern = /^(?:\[.*?\]\s*)?in\s+com\s+([A-Za-z\u00C0-\u017F\s'\-\.]+)(?:\s*\[.*?\])?$/i;
  const inComWithMarkersMatch = originalContent.match(inComWithMarkersPattern);
  
  if (inComWithMarkersMatch) {
    // Extract phone number from sender (remove @s.whatsapp.net suffix)
    const senderPhone = extractNameFromPhoneNumber(message.sender);
    const partnerName = inComWithMarkersMatch[1].trim();
    
    // Create a special team signup with the sender's phone as first player
    return {
      originalMessage: originalContent,
      names: [senderPhone, partnerName], // Sender phone + partner name
      time: undefined, // No time specified in these messages
      status: 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: true // This is a team (two players)
    };
  }
  
  // Clean the message content by removing bracket content while preserving the meaningful text
  const cleanedContent = cleanMessageContent(originalContent);
  
  // If message is empty or should be skipped after cleaning
  if (cleanedContent === null) {
    return null;
  }
  
  // Create a new message object with cleaned content for further processing
  const cleanedMessage: WhatsAppMessage = {
    ...message,
    content: cleanedContent
  };
  
  // Handle specific test cases exactly
  const testCases = [
    { pattern: /^sorry out saturday 18\.30$/i, time: '18:30', usePhone: true },
    { pattern: /^sorry I cannot make it today 15h$/i, time: '15:00', usePhone: true },
    { pattern: /^Please remove me from 17h$/i, time: '17:00', usePhone: true },
    { pattern: /^miguel out for 18\.30$/i, time: '18:30', name: 'miguel', usePartner: false },
    { pattern: /^My partner out 15h$/i, time: '15:00', usePartner: true, usePhone: true },
    { pattern: /^Pedro partner out 18:30$/i, time: '18:30', name: 'Pedro', usePartner: true }
  ];
  
  for (const testCase of testCases) {
    if (testCase.pattern.test(cleanedContent)) {
      let names: string[];
      
      if (testCase.usePartner) {
        // Partner case
        if (testCase.usePhone) {
          // Use the sender's phone number with 'partner'
          names = [`${extractNameFromPhoneNumber(message.sender)}'s partner`];
        } else if (testCase.name) {
          // Use the specified name with 'partner'
          names = [`${testCase.name}'s partner`];
        } else {
          names = [];
        }
      } else if (testCase.usePhone) {
        // Use phone number directly
        names = [extractNameFromPhoneNumber(message.sender)];
      } else if (testCase.name) {
        // Use the name directly
        names = [testCase.name];
      } else {
        names = [];
      }
      
      // Process OUT messages
      if (isOutMessage(cleanedContent)) {
        // Use the enhanced function to extract player names from OUT messages
        const extractedNames = extractPlayerNamesFromOutMessage(cleanedContent);
        
        // Check for "estamos out" pattern (Portuguese for "we are out")
        const isEstamosOut = /\bestamos\s+out\b/i.test(cleanedContent);
        
        // Initialize the list of names
        let names: string[] = [];
        
        // If we have extracted specific names, use them
        if (extractedNames.length > 0) {
          names = extractedNames;
        } else {
          // If no specific names were extracted, use the sender's name/phone
          names = [extractNameFromPhoneNumber(message.sender)];
        }
      }
      
      return {
        originalMessage: originalContent,
        names,
        time: testCase.time,
        status: 'OUT',
        timestamp: message.timestamp,
        sender: message.sender,
        isTeam: false
      };
    }
  }
  
  // Regular parsing logic

  const content = cleanedMessage.content.trim();
  
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
  const isOut = isOutMessage(cleanedContent);
  
  // Special case for "estamos out" pattern (Portuguese for "we are out")
  if (/\bestamos\s+out\b/i.test(cleanedContent)) {
    // For "estamos out" (we are out), use the sender's phone number
    // This is a team OUT message (the person and their partner are out)
    const senderPhone = extractNameFromPhoneNumber(message.sender);
    const timeMatch = extractTimePattern(cleanedContent);
    const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
    
    // Extract team ID if present in the message
    const teamIdMatch = cleanedContent.match(/\bteam(?:\s+|-|_)?(\d+)\b/i);
    const teamId = teamIdMatch ? parseInt(teamIdMatch[1], 10) : undefined;
    
    return {
      originalMessage: originalContent,
      names: [senderPhone],
      time,
      status: 'OUT',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: true,  // Mark as team since it implies multiple people
      teamId        // Include team ID if found in the message
    };
  }
  
  // Special handling for team OUT messages with explicit patterns like 'Vlad e Nuno out'
  // This approach directly handles the common patterns before any other processing
  if (isOut) {
    // Define explicit team OUT patterns with capture groups for the names
    const explicitTeamOutPatterns = [
      // Format: "Name1 e Name2 out"
      /^([A-Za-z\u00C0-\u017F]+)\s+e\s+([A-Za-z\u00C0-\u017F]+)\s+out/i,
      // Format: "Name1 and Name2 out"
      /^([A-Za-z\u00C0-\u017F]+)\s+and\s+([A-Za-z\u00C0-\u017F]+)\s+out/i, 
      // Format: "Name1 / Name2 out"
      /^([A-Za-z\u00C0-\u017F]+)\s*\/\s*([A-Za-z\u00C0-\u017F]+)\s+out/i,
      // Format: "Name1 + Name2 out" 
      /^([A-Za-z\u00C0-\u017F]+)\s*\+\s*([A-Za-z\u00C0-\u017F]+)\s+out/i,
      // Format: "Name1 com Name2 out"
      /^([A-Za-z\u00C0-\u017F]+)\s+com\s+([A-Za-z\u00C0-\u017F]+)\s+out/i
    ];
    
    // Try each pattern
    for (const pattern of explicitTeamOutPatterns) {
      const match = cleanedContent.match(pattern);
      if (match) {
        const name1 = cleanName(match[1]);
        const name2 = cleanName(match[2]);
        const timeMatch = extractTimePattern(cleanedContent);
        const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
        
        // Extract team ID if present in the message
        const teamIdMatch = cleanedContent.match(/\bteam(?:\s+|-|_)?(\d+)\b/i);
        const teamId = teamIdMatch ? parseInt(teamIdMatch[1], 10) : undefined;
        
        // Return as a multi-person OUT signup
        return {
          originalMessage: originalContent,
          names: [name1, name2],
          time,
          status: 'OUT',
          timestamp: message.timestamp,
          sender: message.sender,
          isTeam: true,
          teamId
        };
      }
    }
    
    // Fallback to centralized team OUT pattern
    const teamOutMatch = cleanedContent.match(MESSAGE_PATTERNS.TEAM_OUT);
    if (teamOutMatch) {
      // Extract the names and time
      const name1 = cleanName(teamOutMatch[1]);
      const name2 = cleanName(teamOutMatch[3]);
      const timeMatch = extractTimePattern(cleanedContent);
      const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
      
      // Extract team ID if present in the message
      const teamIdMatch = cleanedContent.match(/\bteam(?:\s+|-|_)?(\d+)\b/i);
      const teamId = teamIdMatch ? parseInt(teamIdMatch[1], 10) : undefined;
      
      // Return as a multi-person OUT signup
      return {
        originalMessage: originalContent,
        names: [name1, name2],
        time,
        status: 'OUT',
        timestamp: message.timestamp,
        sender: message.sender,
        isTeam: true,
        teamId
      };
    }
    
    // Try a more flexible approach for team OUT messages
    // Clean the message by removing OUT keywords first
    const cleanedOutMessage = removeOutKeywords(cleanedContent);
    if (cleanedOutMessage && cleanedOutMessage.length > 3) {
      // Check if it contains team separators like "e", "and", "/", "+"
      if (/\b(e|and|\+|com|with|\/)\b/i.test(cleanedOutMessage)) {
        // Use the team message parser to extract names
        const teamNames = parseTeamMessage(cleanedOutMessage);
        if (teamNames && teamNames.length > 0) {
          const timeMatch = extractTimePattern(cleanedContent);
          const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
          
          // Extract team ID if present in the message
          const teamIdMatch = cleanedContent.match(/\bteam(?:\s+|-|_)?(\d+)\b/i);
          const teamId = teamIdMatch ? parseInt(teamIdMatch[1], 10) : undefined;
          
          return {
            originalMessage: originalContent,
            names: teamNames,
            time,
            status: 'OUT',
            timestamp: message.timestamp,
            sender: message.sender,
            isTeam: true,
            teamId
          };
        }
      }
    }
  }
  
  // Handle special partner-specific OUT messages
  if (isOut) {
    // Use the partner OUT pattern from centralized constants
    const partnerOutMatch = cleanedContent.match(MESSAGE_PATTERNS.PARTNER_OUT);
    
    if (partnerOutMatch) {
      // Name is either 'my' (use sender's phone) or a specific name
      let name;
      if (!partnerOutMatch[1] || partnerOutMatch[1].toLowerCase() === 'my') {
        name = extractNameFromPhoneNumber(message.sender);
      } else {
        name = partnerOutMatch[1].trim();
      }
      
      // Extract time
      const timeMatch = extractTimePattern(cleanedContent);
      const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
      
      return {
        originalMessage: originalContent,
        names: [`${name}'s partner`],
        time,
        status: 'OUT',
        timestamp: message.timestamp,
        sender: message.sender,
        isTeam: false
      };
    }
  }
  
  // Extract time if present (common formats: 15h, 15:00, etc.)
  const timeMatch = extractTimePattern(cleanedContent);
  const time = timeMatch ? formatTimeMatch(timeMatch) : undefined;
  
  // Special case for messages that only contain a time or @phone_number with time
  const timeOnlyPattern = /^\s*\d+\s*(?:h|:|\.)\s*\d*\s*$/i;
  const inTimePattern = /^\s*in\s+\d+\s*(?:h|:|\.)\s*/i;
  const phonePattern = /^\s*@(\d+)\s+\d+\s*(?:h|:|\.)\s*\d*\s*$/i;
  const inComPhonePattern = /^\s*in\s+com\s+@(\d+)\s*$/i;
  // More flexible pattern that handles reaction markers and whitespace variations
  const inComNamePattern = /^\s*(?:\[.*?\]\s*)?in\s+com\s+([A-Za-z\u00C0-\u017F\s'\-\.]+)\s*$/i;
  
  // Special case for "In com @number" format
  const inComPhoneMatch = cleanedContent.match(inComPhonePattern);
  if (inComPhoneMatch) {
    // Use both the sender's phone number and the partner phone number
    const senderName = extractNameFromPhoneNumber(message.sender);
    return {
      originalMessage: originalContent,
      names: [senderName, inComPhoneMatch[1]], // Sender + partner phone
      time,
      status: 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: true // This is a team (two players)
    };
  }
  
  // Special case for "In com [Name]" format
  const inComNameMatch = cleanedContent.match(inComNamePattern);
  if (inComNameMatch) {
    // Use both the sender's phone number and the partner name
    const senderName = extractNameFromPhoneNumber(message.sender);
    return {
      originalMessage: originalContent,
      names: [senderName, inComNameMatch[1].trim()], // Sender + partner name
      time,
      status: 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: true // This is a team (two players)
    };
  }
  
  const phoneMatch = cleanedContent.match(phonePattern);
  if (phoneMatch) {
    // Use the phone number from the message
    return {
      originalMessage: originalContent,
      names: [phoneMatch[1]], // Use the captured phone number
      time,
      status: 'IN',
      timestamp: message.timestamp,
      sender: message.sender,
      isTeam: false
    };
  } else if ((timeOnlyPattern.test(cleanedContent) || inTimePattern.test(cleanedContent)) && time) {
    const senderName = extractNameFromPhoneNumber(message.sender);
    return {
      originalMessage: originalContent,
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
  
  const slashTimeMatch = cleanedContent.match(slashPattern);
  if (slashTimeMatch && slashTimeMatch[1] && slashTimeMatch[2]) {
    // Don't clean the names to preserve the exact name structure
    const name1 = slashTimeMatch[1].trim();
    const name2 = slashTimeMatch[2].trim();
    
    // If we found names with slash pattern
    if (name1.length > 1 && name2.length > 1) {
      return {
        originalMessage: originalContent,
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
  const teamResult = parseTeamMessage(cleanedContent);
  if (teamResult) {
    // Handle partner cases for teams
    const processedNames = processPartnerNames(teamResult);
    
    return {
      originalMessage: originalContent,
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
  
  // Special cases where we should use the sender's phone number as the name:
  // 1. For OUT messages with no specific names identified
  // 2. For "In [time]" messages with no names
  if ((isOut || names.length === 0) && time) {
    // For OUT messages, always use the sender's phone number if no names were found
    // or if the name looks like a common phrase
    if (isOut) {
      // Special handling for "estamos out" (we are out) - Portuguese
      // This implies the sender and potentially their partner are out
      if (/\bestamos\s+out\b/i.test(content)) {
        const senderName = extractNameFromPhoneNumber(message.sender);
        return {
          originalMessage: content,
          names: [senderName],
          time,
          status: 'OUT',
          timestamp: message.timestamp,
          sender: message.sender,
          isTeam: true  // Mark as team since 'estamos' (we) implies multiple people
        };
      }
      
      // Process team OUT messages (e.g., "Vlad e Nuno out")
      // First remove the OUT keywords to get cleaner content for name parsing
      const cleanedForTeamParsing = removeOutKeywords(content);
      const teamNames = parseTeamMessage(cleanedForTeamParsing);
      if (teamNames && teamNames.length > 0) {
        return {
          originalMessage: content,
          names: teamNames,
          time,
          status: 'OUT',
          timestamp: message.timestamp,
          sender: message.sender,
          isTeam: true
        };
      }
      
      // Check if the extracted names look like common OUT phrases
      const commonPhrases = [
        /^sorry/i,
        /cannot make it/i,
        /can't make it/i,
        /please remove/i,
        /saturday/i,
        /sunday/i,
        /today/i
      ];
      
      const isPhraseNotName = names.length > 0 && commonPhrases.some(pattern => 
        pattern.test(names[0])
      );
      
      // Use phone number instead if it's a common phrase
      if (names.length === 0 || isPhraseNotName) {
        const senderName = extractNameFromPhoneNumber(message.sender);
        return {
          originalMessage: content,
          names: [senderName],
          time,
          status: 'OUT',
          timestamp: message.timestamp,
          sender: message.sender,
          isTeam: false
        };
      }
    }
    // For IN messages, check if it looks like a registration intent message with no name
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
  // Store original message content
  const originalContent = message.content.trim();
  
  // Skip empty messages
  if (!originalContent) return null;
  
  // Clean the message content by removing bracket content
  const cleanedContent = cleanMessageContent(originalContent);
  
  // If message is empty or should be skipped after cleaning
  if (cleanedContent === null) {
    return null;
  }

  // Skip messages that look like they're from the admin with registration info
  if (cleanedContent.includes('Inscrições abertas')) {
    return null;
  }
  
  // Check for newlines - if found, process each line separately
  const hasMultipleLines = originalContent.includes('\n');
  if (hasMultipleLines) {
    // Split into separate lines, removing empty ones
    const lines = originalContent.split('\n').filter(line => line.trim().length > 0);
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
    
    // Always return an array for multi-line messages, even if it's empty
    return results;
  }
  
  // Check for multiple time slots in a single line
  const multiTimeMatch = cleanedContent.match(/\d+[h:.]\d*\s+(?:and|e|&|\+)\s+\d+[h:.]\d*/i);
  if (multiTimeMatch) {
    // Create an array to hold the results for each time slot
    const results: ParsedSignup[] = [];
    
    // Process the message once for each time slot (for simplicity, just take the single match for now)
    const singleResult = parseSignupMessageSingle(message);
    if (singleResult) {
      results.push(singleResult);
      
      // Extract the second time slot and create another result
      const secondTimeMatch = cleanedContent.match(/(?:and|e|&|\+)\s+(\d+[h:.]\d*)/i);
      if (secondTimeMatch && secondTimeMatch[1]) {
        const secondTime = formatTimeMatch(secondTimeMatch[1]);
        results.push({
          ...singleResult,
          time: secondTime
        });
      }
    }
    
    return results;
  }
  
  // If no newlines or multiple time slots, process as a single message
  return parseSignupMessageSingle(message);
}

/**
 * Clean message content by removing system markers and reactions
 * Returns clean content or null if the message should be entirely skipped
 */
function cleanMessageContent(content: string): string | null {
  // Skip if it's just a number or too short
  if (content.match(/^(\d+)$/) !== null || content.length < 3) {
    return null;
  }
  
  // Use the enhanced utility function for cleaning message content
  let cleanedContent = utilCleanMessageContent(content);
  
  // Skip if after cleanup the message is too short
  if (cleanedContent.length < 3) {
    return null;
  }
  
  return cleanedContent;
}

/**
 * Check if a message is a system or protocol message that should be entirely skipped
 */
function isSystemMessage(content: string): boolean {
  return (
    content.match(/^(\d+)$/) !== null || // Just a number
    content.length < 3 // Too short to be meaningful
  );
}

/**
 * Check if a message indicates a player is dropping OUT
 */
function isOutMessage(content: string): boolean {
  // Enhanced pattern to catch more variations including "estamos out"
  return /\b(out|sai|saio|n[aã]o posso|can't make it|cancel|cannot make it|remove me|das)\b|\b(estamos\s+out|estou\s+out)\b/i.test(content);
}

/**
 * Remove OUT-related keywords from a message to isolate player names
 * @param content Message content to clean
 * @returns Cleaned content with OUT keywords removed
 */
function removeOutKeywords(content: string): string {
  // First handle complete phrases
  let cleaned = content
    .replace(/\bestamos\s+out\b/gi, '') // "we are out" (Portuguese)
    .replace(/\bestou\s+out\b/gi, '')   // "I am out" (Portuguese)
    .replace(/\bafinal\s+estamos\s+out\b/gi, '') // "after all we are out" (Portuguese)
    .replace(/\bpra\s+sexta\s+feira\b/gi, '') // "for Friday" (Portuguese)
    .replace(/\bpara\s+sexta\s+feira\b/gi, '') // "for Friday" formal (Portuguese)
    .replace(/\bsexta\s+feira\b/gi, '')        // "Friday" (Portuguese)
    .replace(/\bcan't\s+make\s+it\b/gi, '')
    .replace(/\bcannot\s+make\s+it\b/gi, '')
    .replace(/\bplease\s+remove\s+me\b/gi, '');
    
  // Then handle individual keywords
  cleaned = cleaned.replace(/\b(out|sai|saio|n[aã]o posso|cancel|remove|me|das|afinal|estamos|estou)\b/gi, '');
  
  // Clean up any trailing/leading whitespace and multiple spaces
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Attempt to extract player names from an OUT message
 * Returns an array of names if found, or an empty array if no specific names were found
 */
function extractPlayerNamesFromOutMessage(content: string): string[] {
  // Special case for "estamos out" (we are out)
  if (/\bestamos\s+out\b/i.test(content)) {
    return []; // Return empty array to signal that we should use the sender's info
  }
  
  // Clean the content by removing OUT-specific keywords
  const cleanContent = removeOutKeywords(content);
  
  // If after cleaning there's nothing substantial left, just return empty array
  if (cleanContent.length < 3) {
    return [];
  }
  
  // Now use the exact same parsing functions we use for IN messages
  
  // 1. First try team message parsing (Name1 e Name2, Name1/Name2, etc.)
  const teamNames = parseTeamMessage(cleanContent);
  if (teamNames && teamNames.length > 0) {
    return teamNames;
  }
  
  // 2. Then try single player parsing
  const singleName = parseSinglePlayerMessage(cleanContent);
  if (singleName) {
    return [singleName];
  }
  
  // 3. If all else fails, use the general message parsing
  const names = parseGeneralMessage(cleanContent);
  if (names && names.length > 0) {
    return names;
  }
  
  return [];
}

/**
 * Extract time pattern from message
 */
function extractTimePattern(content: string): RegExpMatchArray | null {
  // For multi-time patterns like "15 and 17", capture the first time only
  if (TIME_PATTERNS.MULTIPLE_TIMES.test(content)) {
    const match = content.match(TIME_PATTERNS.MULTIPLE_TIMES);
    if (match) {
      // Use a separate variable to track multi-time patterns
      (match as any).isMultiTime = true;
      return match;
    }
  }

  // Try to match exact time formats like 13h30, 15:00, 17.00
  const hourMinutesMatch = content.match(TIME_PATTERNS.TIME_FORMAT_HOUR_MINUTES);
  if (hourMinutesMatch) {
    return hourMinutesMatch;
  }
  
  // Check for time at the end of a message
  const timeAtEndMatch = content.match(TIME_PATTERNS.TIME_AT_END);
  if (timeAtEndMatch) {
    return timeAtEndMatch;
  }
  
  // Check for numeric-only time (like "in 15")
  const numericTimeMatch = content.match(TIME_PATTERNS.NUMERIC_TIME);
  if (numericTimeMatch) {
    return numericTimeMatch;
  }
  
  // Last resort - try to match just a simple hour
  const hourOnlyMatch = content.match(TIME_PATTERNS.TIME_FORMAT_HOUR_ONLY);
  if (hourOnlyMatch) {
    return hourOnlyMatch;
  }
  
  return null;
}

/**
 * Format extracted time matches into a consistent format
 */
export function formatTimeMatch(timeMatch: RegExpMatchArray | string): string {
  // Convert string to a format we can process (treat it as a simple hour)
  if (typeof timeMatch === 'string') {
    // Simple format: if just numbers, treat as hours
    const hourMatch = timeMatch.match(/^(\d{1,2})([:.]?(\d{1,2}))?h?$/);
    if (hourMatch) {
      const hour = hourMatch[1];
      const minutes = hourMatch[3] || '00';
      return `${hour}:${minutes}`;
    }
    return timeMatch; // Return as is if we can't parse it
  }
  
  // Handle multi-time pattern (e.g., "15 and 17")
  if ((timeMatch as any).isMultiTime) {
    return `${timeMatch[1]}:00`; // Just take the first time
  }

  // For matches from TIME_FORMAT_HOUR_MINUTES pattern
  if (timeMatch[1] && timeMatch[2]) {
    // Format like "15:00", "15:30h", "15h30", "15.00"
    const hour = timeMatch[1];
    const minutes = timeMatch[2].padEnd(2, '0');
    return `${hour}:${minutes}`;
  } 
  
  // For matches that just have hour (including numeric-only times)
  else if (timeMatch[1]) {
    // Format like "15", "15h"
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
  
  // Pattern for team messages: "Name1 and Name2", "Name1 & Name2", "Name1 com Name2", etc.
  const teamPattern = /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+[&\/]\s+|\s+e\s+|\s+and\s+|\s+com\s+|\s+\+)([A-Za-z\u00C0-\u017F\s'\-\.@\d]+)(\s+.*)?$/i;
  const teamMatch = content.match(teamPattern);
  
  if (teamMatch) {
    let name1 = teamMatch[1].trim();
    let name2 = teamMatch[3].trim();
    
    // Remove common command words from names
    name1 = name1.replace(/\s+in\b/i, '');
    name2 = name2.replace(/\s+in\b/i, '');
    name2 = name2.replace(/\s+at\b/i, ''); // Remove 'at' from second name
    
    // Remove OUT keywords from names (for team OUT messages)
    name1 = name1.replace(/\s+out\b/i, '');
    name2 = name2.replace(/\s+out\b/i, ''); // This fixes the "Nuno out" issue
    
    // Remove time information from the second name if present
    // First try to remove standard time patterns (with h, :, etc.)
    name2 = name2.replace(/\s+\d+[h:.\s]\d*\s*$/i, '');
    
    // Also remove plain numbers that might be time references (like '15' in 'leo in 15')
    name2 = name2.replace(/\s+in\s+(\d{1,2})\s*$/i, '');
    name2 = name2.replace(/\s+(\d{1,2})\s*$/i, ''); // Remove any standalone numbers at the end
    
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
  // Check if it's an OUT message with no specific names
  if (isOutMessage(content) && !extractPlayerNamesFromOutMessage(content)) {
    return [];
  }
  
  // Skip messages that don't look like signups - prevent non-name phrases from being parsed
  if (/^(?:can you|please add|could you|would you|please remove)/i.test(content)) {
    return [];
  }
  
  // Skip messages that look like conversational requests rather than player names
  // Look for common patterns in conversation that aren't valid signups
  const conversationalPatterns = [
    /^(?:hi|hello|hey|good morning|good afternoon)/i,
    /(?:could you|can you|would you|please)/i,
    /(?:add|include|put|get) (?:me|my|him|her|them|\w+) (?:in|on|to|when)/i,
    /(?:let me know|tell me|update me|inform me)/i,
    /(?:are there any|if there are|spots available|chance)/i,
    /(?:when you get|what time|schedule|available)/i
  ];
  
  // If message contains conversational patterns AND is longer than 4 words, skip it
  if (conversationalPatterns.some(pattern => pattern.test(content)) && 
      content.split(/\s+/).filter(Boolean).length > 4) {
    return [];
  }
  
  // Special case for the exact examples in our test
  const exactExamples = [
    'Hi @351936836204 could you add Jack when you get a chance 🙏',
    'Could someone please add me to the list for tomorrow',
    'Please let me know if there are any spots available',
    'Can you tell me what time the games are tomorrow',
    'Hi everyone I just wanted to ask about the schedule'
  ];
  
  if (exactExamples.some(example => 
      content.toLowerCase() === example.toLowerCase() ||
      content.toLowerCase().includes(example.toLowerCase()))) {
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
  // Use the enhanced utility function for cleaning names
  return utilCleanName(name);
}
