#!/usr/bin/env node
/**
 * Parse Script
 * 
 * A new version of the tournament parser that uses the MsgParsed structure
 * and ParserPipeline for cleaner, more modular processing.
 */

import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { connectToDatabase, getMessagesFromGroup } from '../utils/database';
import { getGroupInfo, writeToFile, createOutputFilePath } from '../utils/file';
import { findRegistrationMessage } from '../core/registration';
import { MsgParsed, MessageModifier } from '../types/message-parsing';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { formatDateYYYYMMDDHHMMSS } from '../utils/date';

// Output directory
const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'parsed-results');
const LOG_DIR = path.join(PROJECT_ROOT, 'data', 'logs');

/**
 * Main parse function
 */
async function parse(
  groupId: string,
  outputPath?: string,
  forceRegistrationTimestamp?: number,
  verbose: boolean = false
): Promise<void> {
  console.log(`Parsing group ${groupId} with the new parser pipeline`);
  
  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  
  // Get group info from CSV
  const groupInfo = await getGroupInfo(groupId);
  if (!groupInfo) {
    console.error(`Group ${groupId} not found in groups.csv`);
    return;
  }
  
  console.log(`Group info: ${JSON.stringify(groupInfo)}`);

  // Connect to database and get messages
  const db = connectToDatabase();
  const messages = getMessagesFromGroup(db, groupId);
  console.log(`Found ${messages.length} messages for group ${groupId}`);
  
  // Initialize parser pipeline
  const pipeline = new ParserPipeline();
  
  // Step 1: Find registration opening message
  // This step has special handling and is not part of the general message parsing
  const registrationMessage = findRegistrationMessage(messages, groupInfo.admin, groupInfo);
  
  if (!registrationMessage && !forceRegistrationTimestamp) {
    console.log("No registration message found and no timestamp forced. Exiting.");
    return;
  }
  
  // Determine registration timestamp
  const registrationTimestamp = forceRegistrationTimestamp || 
                               (registrationMessage ? registrationMessage.timestamp : 0);
  
  if (registrationMessage) {
    console.log(`Registration opened at ${formatDateYYYYMMDDHHMMSS(new Date(registrationMessage.timestamp * 1000))}`);
    console.log(`Opening message: "${registrationMessage.content}"`);
  } else if (forceRegistrationTimestamp) {
    console.log(`Using forced registration timestamp: ${formatDateYYYYMMDDHHMMSS(new Date(forceRegistrationTimestamp * 1000))}`);
  }
  
  // Step 2: Filter messages to only those after registration opened
  const messagesAfterRegistration = messages.filter(
    msg => msg.timestamp >= registrationTimestamp
  );
  console.log(`Found ${messagesAfterRegistration.length} messages after registration opened`);
  
  // Step 3: Process each message through the pipeline
  const parsedMessages: MsgParsed[] = pipeline.processMessages(messagesAfterRegistration);
  
  // Step 4: Assign team IDs across all messages
  const messagesWithTeamIds = pipeline.assignTeamIds(parsedMessages);
  
  // Step 5: Generate output
  generateOutput(messagesWithTeamIds, groupInfo, registrationMessage, outputPath);
  
  console.log("Parsing complete!");
}

/**
 * Generate output files from parsed messages
 */
function generateOutput(
  parsedMessages: MsgParsed[], 
  groupInfo: any, 
  registrationMessage: any, 
  outputPath?: string
): void {
  // Default output path if not specified
  const actualOutputPath = outputPath || createOutputFilePath(groupInfo.name);
  
  // Generate markdown output
  let output = `# ${groupInfo.name} Tournament Signups\n\n`;
  
  // Registration info
  if (registrationMessage) {
    const openDate = new Date(registrationMessage.timestamp * 1000);
    output += `Registration opened at ${formatDateYYYYMMDDHHMMSS(openDate)}\n`;
    output += `Opening message: "${registrationMessage.content}"\n\n`;
  }
  
  // Players by batch
  output += `## Players by Batch\n\n`;
  
  // Group players by batch
  const playersByBatch = new Map<string, string[]>();
  // Add the "Unspecified" batch
  playersByBatch.set('Unspecified', []);
  
  // Process IN messages
  parsedMessages
    .filter(msg => msg.modifier === MessageModifier.IN)
    .forEach(msg => {
      const batch = msg.batch || 'Unspecified';
      
      if (!playersByBatch.has(batch)) {
        playersByBatch.set(batch, []);
      }
      
      msg.players.forEach(player => {
        let displayName = player.displayName;
        
        // Add team number if available
        if (msg.teamId) {
          displayName = `${displayName} (${msg.teamId})`;
        }
        
        playersByBatch.get(batch)!.push(displayName);
      });
    });
  
  // Output players by batch
  for (const [batch, players] of playersByBatch.entries()) {
    if (players.length === 0) continue;
    
    output += `### ${batch} Batch (${players.length} players)\n\n`;
    
    players.forEach((player, index) => {
      output += `${index + 1}. ${player}\n`;
    });
    
    output += '\n';
  }
  
  // Processing log
  output += `## Message Processing Log\n\n`;
  
  parsedMessages.forEach((msg, index) => {
    const date = new Date(msg.timestamp * 1000);
    output += `### Message #${index + 1} (${formatDateYYYYMMDDHHMMSS(date)})\n`;
    output += `- Original message: "${msg.originalText}"\n`;
    output += `- Sender: ${msg.sender}\n`;
    output += `- Modifier: ${msg.modifier}\n`;
    
    if (msg.players.length > 0) {
      output += `- Players: ${msg.players.map(p => p.displayName).join(', ')}\n`;
    }
    
    if (msg.isTeam) {
      output += `- Is team: ${msg.isTeam}\n`;
    }
    
    if (msg.teamId) {
      output += `- Team ID: ${msg.teamId}\n`;
    }
    
    if (msg.batch) {
      output += `- Batch: ${msg.batch}\n`;
    }
    
    output += '\n';
  });
  
  // Write output file
  writeToFile(actualOutputPath, output);
  console.log(`Output written to ${actualOutputPath}`);
  
  // Also save raw JSON for debugging
  const jsonOutputPath = actualOutputPath.replace('.md', '.json');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(parsedMessages, null, 2));
  console.log(`Raw JSON data written to ${jsonOutputPath}`);
}

/**
 * Command line interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: parse <groupId> [outputPath] [registrationTimestamp] [--verbose]');
    process.exit(1);
  }
  
  const groupId = args[0];
  const outputPath = args.length > 1 && !args[1].startsWith('--') ? args[1] : undefined;
  const timestampArg = args.find(arg => !isNaN(Number(arg)));
  const forceRegistrationTimestamp = timestampArg ? parseInt(timestampArg) : undefined;
  const verbose = args.includes('--verbose');
  
  parse(groupId, outputPath, forceRegistrationTimestamp, verbose)
    .catch(err => {
      console.error('Error running parser:', err);
      process.exit(1);
    });
}
