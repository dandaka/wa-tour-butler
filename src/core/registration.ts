/**
 * Registration Detection Module
 * 
 * This module is responsible for finding the message that indicates registration
 * is open for a tournament. It looks for admin messages with specific keywords
 * or time patterns that typically indicate registration opening.
 */

import { WhatsAppMessage } from '../types/messages';
import { containsTimePattern } from '../utils/date';
import { REGISTRATION_KEYWORDS } from '../constants';

/**
 * Find the most recent registration opening message from the admin
 * 
 * @param messages Array of WhatsApp messages to search
 * @param adminId ID of the group admin
 * @returns The registration message if found, null otherwise
 */
export function findRegistrationMessage(
  messages: WhatsAppMessage[],
  adminId: string
): WhatsAppMessage | null {
  if (!messages || messages.length === 0) {
    return null;
  }
  
  // Create a copy of messages and sort in reverse chronological order
  // to find the most recent registration message first
  const sortedMessages = [...messages].sort((a, b) => b.timestamp - a.timestamp);
  
  // Look for registration messages
  for (const message of sortedMessages) {
    // Check if message is from admin (handle both formats with and without WhatsApp suffix)
    const isFromAdmin = message.sender === adminId || 
                       message.sender === `${adminId}@s.whatsapp.net`;
    
    if (!isFromAdmin) {
      continue; // Skip messages not from admin
    }
    
    const lowerContent = message.content.toLowerCase();
    
    // Check if message contains registration keywords
    const containsRegistrationKeyword = REGISTRATION_KEYWORDS.some(keyword => 
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Check for time pattern in message (15h, 15:00, etc.)
    const hasTimePattern = containsTimePattern(message.content);
    
    // Special case for admin messages with common tournament time patterns
    const hasCommonTournamentTime = hasTimePattern && 
      (lowerContent.includes('15h') || lowerContent.includes('15:') ||
       lowerContent.includes('17h') || lowerContent.includes('17:'));
    
    // If message looks like a registration opening, return it
    if (containsRegistrationKeyword || (hasTimePattern && hasCommonTournamentTime)) {
      return message;
    }
  }
  
  // No registration message found
  return null;
}

/**
 * Find potential registration messages for debugging
 * 
 * This function finds messages that might be registration openings
 * based on keywords or time patterns. It's useful for debugging.
 * 
 * @param messages Array of WhatsApp messages to search
 * @param adminId ID of the group admin
 * @returns Array of potential registration messages
 */
export function findPotentialRegistrationMessages(
  messages: WhatsAppMessage[],
  adminId: string
): WhatsAppMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }
  
  return messages.filter(message => {
    // Check if message is from admin
    const isFromAdmin = message.sender === adminId || 
                         message.sender === `${adminId}@s.whatsapp.net`;
    
    if (!isFromAdmin) {
      return false;
    }
    
    const lowerContent = message.content.toLowerCase();
    
    // Match any registration keyword
    const containsRegistrationKeyword = REGISTRATION_KEYWORDS.some(keyword => 
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Check for time patterns
    const hasTimePattern = containsTimePattern(message.content);
    
    // Return true if message looks like it could be a registration opening
    return containsRegistrationKeyword || hasTimePattern;
  });
}
