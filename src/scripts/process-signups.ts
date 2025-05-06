import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import csv from 'csv-parser';

// Import utilities and types
import { parseSignupMessage } from '../utils/signup-parser';
import { SignupWithTeam } from '../utils/team-numbering'; // Keep for type compatibility
import { WhatsAppMessage } from '../types/messages';
import { ParsedSignup, GroupInfo, ProcessingResult } from '../types/signups';

// Import constants
import { REGISTRATION_KEYWORDS, DB_PATH, GROUPS_CSV_PATH } from '../constants';

// Import utility modules
import { formatDateYYYYMMDDHHMMSS, formatTimeHHMMSS, formatTimestamp, containsTimePattern } from '../utils/date';
import { connectToDatabase, getMessagesFromGroup, DatabaseMessage } from '../utils/database';
import { getGroupInfo, writeToFile, createOutputFilePath, createLogFilePath } from '../utils/file';
import { normalizeWhitespace, removeEmojiAndReactions } from '../utils/string';

// Import core domain modules
import { findRegistrationMessage, findPotentialRegistrationMessages } from '../core/registration';
import { assignTeamNumbers, getFormattedPlayerList, TeamSignup } from '../core/teams';

// Import formatters
import { formatOutputAsMarkdown } from '../formatters/markdown-formatter';

type DatabaseType = ReturnType<typeof BetterSqlite3>;

/**
 * Process signup messages and format the output
 *
 * @param groupId WhatsApp group ID
 * @param outputPath Path to write the output
 * @param forceRegistrationTimestamp Optional timestamp to force as registration start
 * @param verbose Whether to log verbose output
 * @returns Processing result
 */
async function processSignups(
  groupId: string,
  outputPath?: string,
  forceRegistrationTimestamp?: number,
  verbose: boolean = false
): Promise<ProcessingResult | undefined> {
  console.log(`Processing signups for group ${groupId}`);
  
  // Get group info
  const groupInfo = await getGroupInfo(groupId);
  if (!groupInfo) {
    console.error(`Group ${groupId} not found in groups.csv`);
    return undefined;
  }
  
  console.log(`Group info: ${JSON.stringify(groupInfo)}`);
  
  // Connect to the database
  const db = connectToDatabase();
  
  // Get all messages for this group
  const messages = getMessagesFromGroup(db, groupId);
  console.log(`Found ${messages.length} messages for group ${groupId}`);
  
  // Log all messages from +351 966 314 427 regardless of registration timestamp
  console.log('\n\u2728 MESSAGES FROM +351 966 314 427:');
  const messagesFromNumber = messages.filter(m => m.sender.includes('351966314427'));
  messagesFromNumber.forEach(m => {
    const date = new Date(m.timestamp * 1000);
    console.log(`[${formatDateYYYYMMDDHHMMSS(date)}] ${m.content}`);
  });
  console.log('\n');
  
  // Log all messages containing 'in com eric' regardless of brackets or registration timestamp
  console.log('\n\ud83d\udd0e MESSAGES CONTAINING "IN COM ERIC":');
  const inComEricMessages = messages.filter(m => 
    m.content.toLowerCase().includes('in com') && 
    m.content.toLowerCase().includes('eric')
  );
  inComEricMessages.forEach(m => {
    const date = new Date(m.timestamp * 1000);
    console.log(`[${date.toLocaleString()}] From: ${m.sender} | Content: ${m.content}`);
  });
  console.log('\n');

  // Process messages to extract signups
  const result = processMessages(messages, groupInfo, forceRegistrationTimestamp);
  
  // Format the output
  const output = formatOutputAsMarkdown(result, groupInfo);
  
  // Write the output to a file if requested
  if (outputPath) {
    writeToFile(outputPath, output);
    console.log(`Output written to ${outputPath}`);
  } else {
    // Create default output file path
    const defaultOutputPath = createOutputFilePath(groupInfo.name);
    writeToFile(defaultOutputPath, output);
    console.log(`Output written to ${defaultOutputPath}`);
    
    // Create log file
    const logPath = createLogFilePath(groupInfo.name);
    writeToFile(logPath, `Processed at ${new Date().toISOString()}\nFound ${result.signups.length} signups\n`);
    console.log(`Log written to ${logPath}`);
  }
  
  // Close the database connection
  db.close();
  
  return result;
}

// Process messages to extract signup information
export function processMessages(messages: DatabaseMessage[], groupInfo: GroupInfo, forceRegistrationTimestamp?: number): ProcessingResult {
  const result: ProcessingResult = {
    signups: [],
    finalPlayerList: [],
    // Track players who opted out by time slot
    outPlayersByTimeSlot: {}
  };
  
  console.log(`Looking for admin ${groupInfo.admin} messages related to registration`);
  
  // Use the extracted function to get potential registration messages for debugging
  const potentialRegistrationMessages = findPotentialRegistrationMessages(messages, groupInfo.admin);
  console.log(`Found ${potentialRegistrationMessages.length} potential registration messages`);
  
  // For debugging, show the potential registration messages
  if (potentialRegistrationMessages.length > 0) {
    console.log('Potential registration messages:');
    potentialRegistrationMessages.forEach((msg, i) => {
      const date = new Date(msg.timestamp * 1000);
      console.log(`${i+1}. [${formatDateYYYYMMDDHHMMSS(date)}] ${msg.content.substring(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
    });
  }
  
  // Use the extracted findRegistrationMessage function to find registration message
  let registrationStarted = false;
  let registrationTimestamp = 0;
  
  // Find registration message using the extracted module
  const registrationMessage = findRegistrationMessage(messages, groupInfo.admin);
  
  if (registrationMessage) {
    registrationStarted = true;
    registrationTimestamp = registrationMessage.timestamp;
    result.registrationOpenMessage = registrationMessage;
    console.log(`Found registration start message at ${new Date(registrationMessage.timestamp * 1000).toLocaleString()}:`);
    console.log(`Content: "${registrationMessage.content}"`);
  }
  
  // If forceRegistrationTimestamp is provided, use it instead
  if (forceRegistrationTimestamp) {
    registrationStarted = true;
    registrationTimestamp = forceRegistrationTimestamp;
    const forcedMessage = messages.find(m => m.timestamp >= forceRegistrationTimestamp);
    if (forcedMessage) {
      result.registrationOpenMessage = forcedMessage;
      console.log(`Using forced registration timestamp: ${new Date(forceRegistrationTimestamp * 1000).toLocaleString()}`);
    }
  }
  
  // If registration message found, now process all messages after that timestamp
  if (registrationStarted) {
    console.log('Registration started!'); // Explicit logging to confirm this block is executed
    console.log(`Registration timestamp: ${registrationTimestamp} (${new Date(registrationTimestamp * 1000).toLocaleString()})`);
    
    // Debug: Count messages after registration timestamp
    const messagesAfterRegistration = messages.filter(m => m.timestamp >= registrationTimestamp);
    console.log(`Found ${messagesAfterRegistration.length} messages after registration opened at ${new Date(registrationTimestamp * 1000).toLocaleString()}`);
    
    // Count non-admin messages after registration
    const userMessagesAfterRegistration = messagesAfterRegistration.filter(m => 
      m.sender !== groupInfo.admin && 
      m.sender !== `${groupInfo.admin}@s.whatsapp.net`);
    console.log(`Found ${userMessagesAfterRegistration.length} user messages (non-admin) after registration`);
    
    for (const message of messages) {
      // Skip messages before registration opened or from the admin (handle both phone formats)
      const isAdmin = message.sender === groupInfo.admin || 
                    message.sender === `${groupInfo.admin}@s.whatsapp.net`;
      
      if (message.timestamp < registrationTimestamp || isAdmin) {
        continue;
      }
      
      // Debug: examine just a few messages after registration
      if (message.timestamp > registrationTimestamp && message.timestamp < registrationTimestamp + 300) { // 5 minutes
        console.log(`Processing potential signup: ${new Date(message.timestamp * 1000).toLocaleString()} - ${message.content}`);
      }
      
      // Parse message for signup information using our modular parser
      if (message.timestamp > registrationTimestamp && message.timestamp < registrationTimestamp + 600) { // 10 minutes
        console.log(`Processing potential signup [${new Date(message.timestamp * 1000).toLocaleString()}]: ${message.content.substring(0, 60)}${message.content.length > 60 ? '...' : ''}`);
      }
      
      // Add detailed debug logging for specific messages with reaction markers
      if (message.content.includes('[') && message.content.includes(']') && 
          (message.content.toLowerCase().includes('in com') || message.content.toLowerCase().includes('eric'))) {
        console.log(`🔍 REACTION MARKER DETECTED in message from ${message.sender}: "${message.content}"`);  
      }
      
      // Specific debugging for +351 966 314 427's "In com Eric" message
      if (message.sender.includes('351966314427')) {
        console.log(`⭐️ FOUND MESSAGE FROM +351 966 314 427: "${message.content}"`);  
      }
      
      // Extra detailed logging for the phone number and specific message we're looking for
      if (message.sender.includes('351966314427') || 
          (message.content.toLowerCase().includes('in com') && 
           message.content.toLowerCase().includes('eric'))) {
        console.log('\n🔍🔍🔍 FOUND IMPORTANT MESSAGE:');
        console.log(`Time: ${new Date(message.timestamp * 1000).toLocaleString()}`);
        console.log(`Sender: ${message.sender}`);
        console.log(`Content: "${message.content}"`);
        
        // Try parsing it with our updated parser
        const ericResult = parseSignupMessage(message);
        console.log(`Parsed Result: ${JSON.stringify(ericResult, null, 2)}`);
        
        if (ericResult) {
          const hasEric = Array.isArray(ericResult) 
            ? ericResult.some(r => r.names.some(n => n.includes('Eric')))
            : ericResult.names.some(n => n.includes('Eric'));
          console.log(`Contains Eric: ${hasEric}`);
        }
        console.log('🔍🔍🔍 END OF IMPORTANT MESSAGE\n');
      }
      
      const parsedResult = parseSignupMessage(message);
      if (parsedResult) {
        // Handle both single result and array of results
        const signups = Array.isArray(parsedResult) ? parsedResult : [parsedResult];
        console.log(`✅ Successfully parsed signup from: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`);
        
        // Process each signup
        for (const signup of signups) {
          result.signups.push(signup);
          
          // Update player list based on signup status
          if (signup.status === 'IN') {
            // Add players to the list
            signup.names.forEach((name: string) => {
              if (!result.finalPlayerList.includes(name)) {
                result.finalPlayerList.push(name);
              }
            });
          } else if (signup.status === 'OUT') {
            // Remove players from the list
            signup.names.forEach((name: string) => {
              const index = result.finalPlayerList.indexOf(name);
              if (index !== -1) {
                result.finalPlayerList.splice(index, 1);
              }
              
              // Also track players opting out from specific time slots
              if (signup.time) {
                if (!result.outPlayersByTimeSlot[signup.time]) {
                  result.outPlayersByTimeSlot[signup.time] = [];
                }
                if (!result.outPlayersByTimeSlot[signup.time].includes(name)) {
                  result.outPlayersByTimeSlot[signup.time].push(name);
                  console.log(`Added ${name} to OUT list for time slot ${signup.time}`);
                }
              }
            });
          }
        }
      }
    }
  }
  
  // Process signups to add team numbers and format names
  result.processedSignups = assignTeamNumbers(result.signups);
  
  return result;
}

/**
 * Format processing result into a markdown document
 * 
 * @param result Processing result from signup processing
 * @param groupInfo Group information
 * @returns Formatted markdown string
 */
export function formatOutput(result: ProcessingResult, groupInfo: GroupInfo): string {
  // Use the extracted markdown formatter
  return formatOutputAsMarkdown(result, groupInfo);
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const groupId = args[0];
  const outputPath = args[1];
  const forceTimestamp = args[2] ? parseInt(args[2]) : undefined;
  const verbose = args.includes('--verbose');
  
  if (!groupId) {
    console.error('Please provide a group ID as the first argument');
    process.exit(1);
  }
  
  // If a timestamp is provided, we can use it to force a specific registration time
  if (forceTimestamp) {
    console.log(`Forcing registration timestamp to: ${new Date(forceTimestamp * 1000).toLocaleString()}`);
  }

  // Set global verbose flag
  if (verbose) {
    console.log('Running in verbose mode - detailed parsing will be included');
  }
  
  processSignups(groupId, outputPath, forceTimestamp ?? undefined).catch(err => {
    console.error('Error processing signups:', err);
    process.exit(1);
  });
}

// Export for use in other modules
export { processSignups };
