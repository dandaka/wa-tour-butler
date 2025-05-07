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
import { loadContacts, addDisplayNames, getDisplayName } from '../utils/contact-loader';
import { findGroupInCsv } from '../utils/csv-reader';

// Paths for test data
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const DEFAULT_INPUT = path.join(TEST_DATA_DIR, '120363028202164779-messages.json');
const DEFAULT_CONTACTS = path.join(TEST_DATA_DIR, 'contacts.json');
const DEFAULT_OUTPUT = path.join(TEST_DATA_DIR, 'result.json');
const DEFAULT_REPORT = path.join(TEST_DATA_DIR, 'parser-test-report.md');
// Load group data from JSON file instead of CSV
const GROUPS_JSON_PATH = path.join(process.cwd(), 'groups.json');

// Default group ID if not provided
const DEFAULT_GROUP_ID = '120363028202164779@g.us'; // Sao Bento P4ALL Saturday

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

// Save results
function saveResults(results: any, filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`Saved results to: ${filePath}`);
}


// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const inputFile = args[0] || DEFAULT_INPUT;
  const groupId = args[1] || DEFAULT_GROUP_ID;
  
  // Try to get group info from CSV first
  console.log(`Looking for group ${groupId} in ${GROUPS_JSON_PATH}...`);
  // Load group info from JSON file
  console.log(`Loading groups from ${GROUPS_JSON_PATH}...`);
  const groupsData = JSON.parse(fs.readFileSync(GROUPS_JSON_PATH, 'utf8'));
  const groupInfo = groupsData.find((g: GroupInfo) => g.id === groupId);
  
  if (!groupInfo) {
    console.warn(`Group ${groupId} not found in JSON. Using default values.`);
    groupInfo = {
      id: groupId,
      name: 'Default Group',
      admin: '351936836204@s.whatsapp.net',
      signupStartTime: '0 15 * * 0'
    };
  } else {
    console.log(`Found group in CSV: ${groupInfo.name}`);
    console.log(`Admin: ${groupInfo.admin}`);
    console.log(`Signup start time: ${groupInfo.signupStartTime}`);
    if (groupInfo.batches) {
      console.log(`Batches: ${groupInfo.batches.join(', ')}`);
    }
    if (groupInfo.maxTeams) {
      console.log(`Max teams: ${groupInfo.maxTeams}`);
    }
  }
  
  console.log(`Testing registration parser with:`);
  console.log(`- Messages from: ${inputFile}`);
  console.log(`- Group ID: ${groupId}`);
  console.log(`- Group Name: ${groupInfo.name}`);
  
  // Load messages
  console.log(`Loading messages from: ${inputFile}`);
  const rawMessages = loadMessages(inputFile);
  console.log(`Loaded ${rawMessages.length} messages`);
  
  // Initialize parser pipeline
  const pipeline = new ParserPipeline();
  
  // Load contacts
  const contacts = loadContacts(DEFAULT_CONTACTS);
  console.log(`Loaded ${Object.keys(contacts).length} contacts from ${DEFAULT_CONTACTS}`);
  
  // Process messages through the normal pipeline first
  console.log('Processing messages through main pipeline...');
  const parsedMessages = pipeline.processMessages(rawMessages);
  
  // Group info is already loaded from CSV
  
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
  
  // Assign team IDs to filtered messages
  console.log('Assigning team IDs...');
  const messagesWithTeamIds = pipeline.assignTeamIds(filteredMessages);
  
  // Add sender names from contacts to all messages including registration message
  console.log('Adding sender display names...');
  const finalMessages = addDisplayNames(messagesWithTeamIds, contacts);
  
  // Also add sender name to registration message if it has a sender
  if (registrationMessage && registrationMessage.sender) {
    // Need to cast as any to avoid TypeScript strict property checks
    (registrationMessage as any).sender_name = getDisplayName(registrationMessage.sender, contacts);
  }
  
  // Prepare results
  const results = {
    groupInfo,
    registrationMessage,
    messagesBeforeFiltering: parsedMessages.length,
    messagesAfterFiltering: filteredMessages.length,
    filteredMessages: finalMessages,
    metadata: {
      batches: groupInfo.batches || [],
      maxTeams: groupInfo.maxTeams || 0
    }
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
