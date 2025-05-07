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
import { GroupInfo } from '../types/signups';
import { getLastScheduledRegistrationTime } from '../cron/cron-schedule';

/**
 * Determines if a message is a system message that should be ignored
 * 
 * @param content Message content to check
 * @returns True if the message is a system message that should be ignored
 */
function isSystemMessage(content: string): boolean {
  // Common system message patterns
  const systemPatterns = [
    /^\[SENDERKEYDISTRIBUTIONMESSAGE\]$/,
    /^\[PROTOCOLMESSAGE\]$/,
    /^\[MESSAGECONTEXTINFO\]$/,
    /^\[REACTIONMESSAGE\]$/,
    /^\[REVOKEDMESSAGE\]$/,
    /^\[.*\]$/ // Any message that only contains text within brackets
  ];
  
  // Check if the message matches any system pattern
  return systemPatterns.some(pattern => pattern.test(content.trim()));
}

/**
 * Find the most recent registration opening message from the admin
 * 
 * @param messages Array of WhatsApp messages to search
 * @param adminId ID of the admin user who would open registrations
 * @param groupInfo Optional group info containing cron schedule
 * @param currentTime Optional current time for reference
 * @returns The registration opening message, or null if not found
 */
export function findRegistrationMessage(
  messages: WhatsAppMessage[], 
  adminId: string,
  groupInfo?: GroupInfo,
  currentTime: Date = new Date()
): WhatsAppMessage | null {
  if (!messages || messages.length === 0) {
    return null;
  }
  
  // If group info is provided, get the last scheduled registration time
  let scheduledTimestamp: number | null = null;
  if (groupInfo) {
    scheduledTimestamp = getLastScheduledRegistrationTime(groupInfo, currentTime);
    console.log(`Last scheduled registration time: ${scheduledTimestamp ? new Date(scheduledTimestamp * 1000).toLocaleString() : 'None'}`);  
  }
  
  // First filter messages to include only those from admin and after the scheduled time
  const filteredMessages = messages.filter(message => {
    // Check if message is from admin (handle both formats with and without WhatsApp suffix)
    const isFromAdmin = message.sender === adminId || 
                       message.sender === `${adminId}@s.whatsapp.net`;
    
    if (!isFromAdmin) {
      return false;
    }
    
    // Skip system messages
    if (isSystemMessage(message.content)) {
      return false;
    }
    
    // Filter by timestamp if we have a scheduled time
    if (scheduledTimestamp && message.timestamp < scheduledTimestamp) {
      return false;
    }
    
    return true;
  });
  
  console.log(`Found ${filteredMessages.length} messages from admin after scheduled time`);
  
  // Now look for registration keywords or time patterns in filtered messages
  for (const message of filteredMessages) {
    const lowerContent = message.content.toLowerCase();
    
    // Check if message contains registration keywords
    const containsRegistrationKeyword = REGISTRATION_KEYWORDS.some(keyword => 
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Check if message mentions a time
    const hasTimePattern = containsTimePattern(message.content);
    
    // Return message if it looks like a registration opening
    if (containsRegistrationKeyword || hasTimePattern) {
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
    
    // Skip system messages
    if (isSystemMessage(message.content)) {
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
