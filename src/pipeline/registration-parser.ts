/**
 * Registration Parser
 * 
 * This module handles the detection of registration opening messages
 * based on cron scheduling and admin identification.
 */

import { MsgParsed, MessageCommand } from '../types/message-parsing';
import { REGISTRATION_KEYWORDS } from '../constants';
import { getLastScheduledRegistrationTime } from '../cron/cron-schedule';

// Import the proper GroupInfo interface
import { GroupInfo } from '../types/signups';

/**
 * Find the registration opening message based on cron schedule and admin messages
 * 
 * @param messages List of all messages from the group
 * @param groupInfo Group information including admin and cron schedule
 * @returns The found registration message or null if not found
 */
export function findRegistrationOpeningMessage(
  messages: MsgParsed[],
  groupInfo: GroupInfo
): MsgParsed | null {
  // If no signup start time is defined, we can't determine the scheduled time
  if (!groupInfo.signupStartTime) {
    console.log('No signup start time defined for this group');
    return findRegistrationByKeywords(messages, groupInfo.admin);
  }
  
  // Calculate the expected registration time based on cron schedule
  try {
    const now = new Date();
    const scheduledTimestamp = getLastScheduledRegistrationTime(groupInfo, now);
    
    if (!scheduledTimestamp) {
      console.log('Could not determine the last scheduled time');
      return findRegistrationByKeywords(messages, groupInfo.admin);
    }
    
    // Look for admin messages within a window of 1 hour before the scheduled time
    const oneHourBefore = scheduledTimestamp - (60 * 60);
    
    console.log(`Looking for registration opening message between: ${new Date(oneHourBefore * 1000).toISOString()} and ${new Date().toISOString()}`);
    
    // Filter to admin messages only within the time window
    const potentialRegistrationMessages = messages.filter(msg => 
      msg.sender.includes(groupInfo.admin) && 
      msg.timestamp >= oneHourBefore
    );
    
    console.log(`Found ${potentialRegistrationMessages.length} potential admin messages in the time window`);
    
    // Check for registration keywords
    for (const msg of potentialRegistrationMessages) {
      if (containsRegistrationKeyword(msg.originalText)) {
        console.log(`Found registration opening message: "${msg.originalText}"`);
        
        // Mark as registration opening
        msg.modifier = MessageCommand.REGISTRATION_OPEN;
        return msg;
      }
    }
    
    console.log('No registration opening message found within the scheduled time window');
    return null;
    
  } catch (error) {
    console.error('Error finding registration opening message:', error);
    return findRegistrationByKeywords(messages, groupInfo.admin);
  }
}

/**
 * Fallback method to find registration message by keywords only
 */
function findRegistrationByKeywords(messages: MsgParsed[], adminId: string): MsgParsed | null {
  // Look for admin messages with registration keywords
  const potentialRegistrationMessages = messages
    .filter(msg => msg.sender.includes(adminId))
    .filter(msg => containsRegistrationKeyword(msg.originalText));
  
  if (potentialRegistrationMessages.length > 0) {
    // Get the most recent registration message
    const registrationMessage = potentialRegistrationMessages
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    // Mark as registration opening
    registrationMessage.modifier = MessageCommand.REGISTRATION_OPEN;
    return registrationMessage;
  }
  
  return null;
}

/**
 * Filter out messages older than the registration opening message
 */
export function filterMessagesAfterRegistration(
  messages: MsgParsed[],
  registrationMessage: MsgParsed | null
): MsgParsed[] {
  if (!registrationMessage) {
    return messages;
  }
  
  // Keep only messages on or after the registration timestamp
  return messages.filter(msg => msg.timestamp >= registrationMessage.timestamp);
}

/**
 * Check if a message contains a registration opening keyword
 */
function containsRegistrationKeyword(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return REGISTRATION_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
}

/**
 * Integrated registration handling for the parser pipeline
 * 
 * This function processes messages to find registration opening
 * and filter out earlier messages.
 * 
 * @param messages The messages to process
 * @param groupInfo Group information for admin and cron details
 * @returns Filtered messages and registration message
 */
export function processRegistration(
  messages: MsgParsed[],
  groupInfo: GroupInfo
): {filteredMessages: MsgParsed[], registrationMessage: MsgParsed | null} {
  // Find registration opening message
  const registrationMessage = findRegistrationOpeningMessage(messages, groupInfo);
  
  // Filter messages to only those after registration
  const filteredMessages = filterMessagesAfterRegistration(messages, registrationMessage);
  
  return {
    filteredMessages,
    registrationMessage
  };
}
