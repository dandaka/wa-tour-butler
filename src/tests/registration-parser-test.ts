#!/usr/bin/env node
/**
 * Registration Parser Test
 * 
 * This script tests the registration parser's ability to detect
 * registration opening messages based on cron scheduling and
 * filter out earlier messages.
 */

import path from 'path';
import fs from 'fs';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { MsgParsed, MessageCommand } from '../types/message-parsing';
import { findRegistrationOpeningMessage, filterMessagesAfterRegistration } from '../pipeline/registration-parser';
import { GroupInfo } from '../types/signups';

// Paths for test data
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const DEFAULT_INPUT = path.join(TEST_DATA_DIR, '120363028202164779-messages.json');
const DEFAULT_CONTACTS = path.join(TEST_DATA_DIR, 'contacts.json');
const DEFAULT_OUTPUT = path.join(TEST_DATA_DIR, 'result.json');
const DEFAULT_REPORT = path.join(TEST_DATA_DIR, 'parser-test-report.md');

// Default admin ID and cron schedule if not provided
const DEFAULT_ADMIN_ID = '351936836204@s.whatsapp.net'; // Adjust based on your data
const DEFAULT_SIGNUP_START_TIME = '0 15 * * 0'; // Example: Every Sunday at 3pm

// Load messages
function loadMessages(filePath: string): any[] {
  try {
    const jsonData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(jsonData);
  } catch (error) {
    console.error(`Error loading messages from ${filePath}:`, error);
    return [];
  }
}

// Load contacts
function loadContacts(filePath: string): Record<string, string> {
  try {
    const jsonData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(jsonData);
  } catch (error) {
    console.error(`Error loading contacts from ${filePath}:`, error);
    return {};
  }
}

// Save results
function saveResults(results: any, filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`Saved results to: ${filePath}`);
}

// Generate report
function generateReport(
  originalMessages: MsgParsed[],
  filteredMessages: MsgParsed[],
  registrationMessage: MsgParsed | null,
  groupInfo: GroupInfo,
  outputPath: string
): void {
  const messagesRemoved = originalMessages.length - filteredMessages.length;
  const percentageRemoved = Math.round((messagesRemoved / originalMessages.length) * 100);
  
  let report = `# Registration Parser Test Report
Generated: ${new Date().toISOString()}

## Test Configuration
- Group ID: ${groupInfo.id}
- Group Name: ${groupInfo.name}
- Admin ID: ${groupInfo.admin}
- Signup Start Time: ${groupInfo.signupStartTime || 'Not specified'}

## Test Results
- Total messages processed: ${originalMessages.length}
- Messages after registration: ${filteredMessages.length}
- Messages filtered out: ${messagesRemoved} (${percentageRemoved}%)
`;

  if (registrationMessage) {
    report += `
## Registration Opening Message Found
- Timestamp: ${new Date(registrationMessage.timestamp * 1000).toISOString()}
- Sender: ${registrationMessage.sender}
- Content: "${registrationMessage.originalText}"
`;
  } else {
    report += `
## No Registration Opening Message Found
Possible reasons:
1. No message with registration keywords was found
2. Admin ID might not match the actual sender of the registration message
3. The cron schedule might not match when the registration was actually opened
`;
  }

  // Add message samples
  if (filteredMessages.length > 0) {
    report += `
## Message Samples After Registration
`;

    // Show the first 5 messages after registration
    filteredMessages.slice(0, 5).forEach((msg, index) => {
      report += `
### Message #${index + 1}
- Timestamp: ${new Date(msg.timestamp * 1000).toISOString()}
- Sender: ${msg.sender}
- Content: "${msg.originalText}"
- Command: ${msg.modifier}
`;
    });
  }

  fs.writeFileSync(outputPath, report);
  console.log(`Generated report at: ${outputPath}`);
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const inputFile = args[0] || DEFAULT_INPUT;
  const adminId = args[1] || DEFAULT_ADMIN_ID;
  const signupStartTime = args[2] || DEFAULT_SIGNUP_START_TIME;
  const groupId = args[3] || '120363028202164779@g.us';
  const groupName = args[4] || 'Test Group';
  
  console.log(`Testing registration parser with:`);
  console.log(`- Messages from: ${inputFile}`);
  console.log(`- Admin ID: ${adminId}`);
  console.log(`- Signup Start Time: ${signupStartTime}`);
  
  // Load messages
  console.log(`Loading messages from: ${inputFile}`);
  const rawMessages = loadMessages(inputFile);
  console.log(`Loaded ${rawMessages.length} messages`);
  
  // Initialize parser pipeline
  const pipeline = new ParserPipeline();
  
  // Process messages through the normal pipeline first
  console.log('Processing messages through main pipeline...');
  const parsedMessages = pipeline.processMessages(rawMessages);
  
  // Create group info
  const groupInfo: GroupInfo = {
    id: groupId,
    name: groupName,
    admin: adminId,
    signupStartTime: signupStartTime
  };
  
  // Find registration opening message
  console.log('Finding registration opening message...');
  const registrationMessage = findRegistrationOpeningMessage(parsedMessages, groupInfo);
  
  if (registrationMessage) {
    console.log(`Found registration opening message:`);
    console.log(`- Date: ${new Date(registrationMessage.timestamp * 1000).toISOString()}`);
    console.log(`- Content: "${registrationMessage.originalText}"`);
  } else {
    console.log('No registration opening message found');
  }
  
  // Filter messages to only those after registration
  console.log('Filtering messages after registration...');
  const filteredMessages = filterMessagesAfterRegistration(parsedMessages, registrationMessage);
  console.log(`Filtered to ${filteredMessages.length} messages (removed ${parsedMessages.length - filteredMessages.length})`);
  
  // Assign team IDs to the filtered messages
  console.log('Assigning team IDs...');
  const finalMessages = pipeline.assignTeamIds(filteredMessages);
  
  // Prepare results
  const results = {
    groupInfo,
    registrationMessage,
    messagesBeforeFiltering: parsedMessages.length,
    messagesAfterFiltering: filteredMessages.length,
    filteredMessages: finalMessages
  };
  
  // Save results
  saveResults(results, DEFAULT_OUTPUT);
  
  // Skip generating Markdown report as per user request
  // generateReport(parsedMessages, filteredMessages, registrationMessage, groupInfo, DEFAULT_REPORT);
  
  console.log('\nRegistration parser test completed!');
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
