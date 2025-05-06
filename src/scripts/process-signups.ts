import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import csv from 'csv-parser';

// Import types
import { SignupWithTeam } from '../utils/team-numbering'; // Keep for type compatibility
import { WhatsAppMessage } from '../types/messages';
import { ParsedSignup, GroupInfo, ProcessingResult } from '../types/signups';

// Import utility modules
import { formatDateYYYYMMDDHHMMSS } from '../utils/date';
import { connectToDatabase, getMessagesFromGroup, DatabaseMessage } from '../utils/database';
import { getGroupInfo, writeToFile, createOutputFilePath, createLogFilePath } from '../utils/file';

// Import core domain modules
import { findPotentialRegistrationMessages } from '../core/registration';

// Import pipeline processor
import { processingPipeline } from '../pipeline';

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

  // Use the new pipeline to process the messages
  const result = processingPipeline(messages, groupInfo, forceRegistrationTimestamp);
  
  // Add some debug logging after processing
  if (result.registrationOpenMessage) {
    console.log(`Found registration start message at ${new Date(result.registrationOpenMessage.timestamp * 1000).toLocaleString()}:`);
    console.log(`Content: "${result.registrationOpenMessage.content}"`);
  }
  
  if (result.signups.length > 0) {
    console.log('Registration started!'); 
    console.log(`Found ${result.signups.length} valid signups`);
    
    // Log OUT players by time slot
    Object.entries(result.outPlayersByTimeSlot).forEach(([timeSlot, players]) => {
      console.log(`OUT players for time slot ${timeSlot}: ${players.join(', ')}`);
    });
  }
  
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
  // Forward to the markdown formatter
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
