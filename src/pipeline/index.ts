/**
 * Tournament Butler Processing Pipeline
 * 
 * This module orchestrates the processing pipeline for tournament signups.
 */

import { ProcessingResult, GroupInfo, ParsedSignup } from '../types/signups';
import { DatabaseMessage } from '../utils/database';
import { findRegistrationMessage } from '../core/registration';
import { assignTeamNumbers } from '../core/teams';
import { parseSignupMessage } from '../utils/signup-parser';

/**
 * Stage 1: Find the registration start message
 */
export function findRegistrationStart(
  messages: DatabaseMessage[], 
  groupInfo: GroupInfo,
  forceRegistrationTimestamp?: number
): { registrationMessage?: DatabaseMessage; registrationTimestamp: number; registrationStarted: boolean } {
  
  // Use the core registration module to find the registration message
  const registrationMessageResult = findRegistrationMessage(messages, groupInfo.admin);
  
  // Ensure type compatibility between WhatsAppMessage and DatabaseMessage
  // The core module returns WhatsAppMessage but we need DatabaseMessage here
  // This is safe because DatabaseMessage is compatible with WhatsAppMessage
  const registrationMessage = registrationMessageResult as unknown as DatabaseMessage;
  let registrationStarted = false;
  let registrationTimestamp = 0;

  if (registrationMessage) {
    registrationStarted = true;
    registrationTimestamp = registrationMessage.timestamp;
  }

  // If forceRegistrationTimestamp is provided, use it instead
  if (forceRegistrationTimestamp) {
    registrationStarted = true;
    registrationTimestamp = forceRegistrationTimestamp;
    // Try to find a message close to the forced timestamp
    const forcedMessage = messages.find(m => m.timestamp >= forceRegistrationTimestamp);
    if (forcedMessage) {
      return { 
        registrationMessage: forcedMessage, 
        registrationTimestamp, 
        registrationStarted 
      };
    }
  }

  return { 
    registrationMessage, 
    registrationTimestamp, 
    registrationStarted 
  };
}

/**
 * Stage 2: Extract signup information from messages
 */
export function extractSignups(
  messages: DatabaseMessage[], 
  registrationTimestamp: number,
  adminId: string
): ParsedSignup[] {
  const signups: ParsedSignup[] = [];

  // Skip messages before registration or from admin
  for (const message of messages) {
    const isAdmin = message.sender === adminId || 
                  message.sender === `${adminId}@s.whatsapp.net`;
    
    if (message.timestamp < registrationTimestamp || isAdmin) {
      continue;
    }

    // Parse message for signup information
    const parsedResult = parseSignupMessage(message);
    if (parsedResult) {
      // Handle both single result and array of results
      const parsedSignups = Array.isArray(parsedResult) ? parsedResult : [parsedResult];
      signups.push(...parsedSignups);
    }
  }

  return signups;
}

/**
 * Stage 3: Process player status (IN/OUT) and time slots
 */
export function processPlayerStatus(signups: ParsedSignup[]): {
  finalPlayerList: string[];
  outPlayersByTimeSlot: Record<string, string[]>;
} {
  const finalPlayerList: string[] = [];
  const outPlayersByTimeSlot: Record<string, string[]> = {};

  // Process each signup to build player lists
  for (const signup of signups) {
    if (signup.status === 'IN') {
      // Add players to the list
      signup.names.forEach(name => {
        if (!finalPlayerList.includes(name)) {
          finalPlayerList.push(name);
        }
      });
    } else if (signup.status === 'OUT') {
      // Remove players from the list
      signup.names.forEach(name => {
        const index = finalPlayerList.indexOf(name);
        if (index !== -1) {
          finalPlayerList.splice(index, 1);
        }
        
        // Track players opting out from specific time slots
        if (signup.time) {
          if (!outPlayersByTimeSlot[signup.time]) {
            outPlayersByTimeSlot[signup.time] = [];
          }
          if (!outPlayersByTimeSlot[signup.time].includes(name)) {
            outPlayersByTimeSlot[signup.time].push(name);
          }
        }
      });
    }
  }

  return {
    finalPlayerList,
    outPlayersByTimeSlot
  };
}

/**
 * Stage 4: Assign team numbers 
 */
export function processTeamAssignments(signups: ParsedSignup[]) {
  return assignTeamNumbers(signups);
}

/**
 * Complete pipeline orchestrator that processes signup messages
 */
export function processingPipeline(
  messages: DatabaseMessage[], 
  groupInfo: GroupInfo, 
  forceRegistrationTimestamp?: number
): ProcessingResult {
  // Initialize the result object
  const result: ProcessingResult = {
    signups: [],
    finalPlayerList: [],
    outPlayersByTimeSlot: {}
  };

  // Stage 1: Find registration start message
  const { 
    registrationMessage, 
    registrationTimestamp, 
    registrationStarted 
  } = findRegistrationStart(messages, groupInfo, forceRegistrationTimestamp);

  // Store registration message in result
  if (registrationMessage) {
    result.registrationOpenMessage = registrationMessage;
  }

  // Only continue pipeline if registration has started
  if (registrationStarted) {
    // Stage 2: Extract signups from messages
    const signups = extractSignups(messages, registrationTimestamp, groupInfo.admin);
    result.signups = signups;

    // Stage 3: Process player status (IN/OUT)
    const { finalPlayerList, outPlayersByTimeSlot } = processPlayerStatus(signups);
    result.finalPlayerList = finalPlayerList;
    result.outPlayersByTimeSlot = outPlayersByTimeSlot;

    // Stage 4: Process team assignments
    result.processedSignups = processTeamAssignments(signups);
  }

  return result;
}
