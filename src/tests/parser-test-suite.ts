#!/usr/bin/env node
/**
 * Parser Test Suite
 * 
 * This script creates a test suite for the message parser pipeline.
 * It processes test messages through the parser and generates a result.json
 * file that can be used to validate parsing rules.
 */

import path from 'path';
import fs from 'fs';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { MsgParsed, MessageCommand } from '../types/message-parsing';

// Paths for test data
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const DEFAULT_INPUT = path.join(TEST_DATA_DIR, '120363028202164779-messages.json');
const DEFAULT_CONTACTS = path.join(TEST_DATA_DIR, 'contacts.json');
const DEFAULT_OUTPUT = path.join(TEST_DATA_DIR, 'result.json');
const DEFAULT_REPORT = path.join(TEST_DATA_DIR, 'parser-test-report.md');

// Test case interface
interface TestCase {
  description: string;
  messageIndex: number;  // Index in the original messages array
  originalContent: string;
  expectedCommand: MessageCommand;
  expectedIsTeam?: boolean;
  expectedPlayerCount?: number;
  expectedTeamId?: number;
  expectedBatch?: string;
}

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

// Ensure output directory exists
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Define test cases based on specific message patterns
function defineTestCases(messages: any[]): TestCase[] {
  const testCases: TestCase[] = [];
  
  // Find and define test cases based on message content
  messages.forEach((msg, index) => {
    const content = msg.content?.toLowerCase() || '';
    
    // Skip empty messages
    if (!content) return;
    
    // Look for registration opening messages
    if (content.includes('inscrições abertas') || content.includes('inscricoes abertas')) {
      testCases.push({
        description: 'Registration opening message',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.REGISTRATION_OPEN
      });
    }
    
    // Look for system messages
    if (content.startsWith('[') && content.endsWith(']')) {
      testCases.push({
        description: 'System message',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.SYSTEM
      });
    }
    
    // Look for OUT messages
    if (
      content.includes('out') && 
      !content.includes('about') && 
      !content.includes('outside') &&
      !content.includes('without')
    ) {
      testCases.push({
        description: 'OUT message',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.OUT
      });
    }
    
    // Look for IN messages with time (batch)
    if (content.includes('in') && /\d+[h:.]/.test(content)) {
      const timeMatch = content.match(/(\d+)[h:.]/);
      const expectedBatch = timeMatch ? `${timeMatch[1]}:00` : undefined;
      
      testCases.push({
        description: 'IN message with time',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.IN,
        expectedIsTeam: false,
        expectedPlayerCount: 1,
        expectedBatch
      });
    }
    
    // Look for team messages with " e " format
    if (content.includes(' e ') && !content.includes('out')) {
      testCases.push({
        description: 'Team message with " e " format',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.IN,
        expectedIsTeam: true,
        expectedPlayerCount: 2
      });
    }
    
    // Look for team messages with "in com" format
    if (content.includes('in com')) {
      testCases.push({
        description: 'Team message with "in com" format',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.IN,
        expectedIsTeam: true,
        expectedPlayerCount: 2
      });
    }
    
    // Look for team messages with "/" format
    if (content.includes('/') && !content.includes('out')) {
      testCases.push({
        description: 'Team message with "/" format',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.IN,
        expectedIsTeam: true
      });
    }
    
    // Look for deleted messages (empty content or special marker)
    if (content === '' || content === '‎') {
      testCases.push({
        description: 'Deleted message',
        messageIndex: index,
        originalContent: msg.content,
        expectedCommand: MessageCommand.CONVERSATION
      });
    }
  });
  
  return testCases;
}

// Process test cases through the parser pipeline
function processTestCases(testCases: TestCase[], messages: any[]): { testResults: any[], allResults: MsgParsed[] } {
  // Initialize parser pipeline
  const pipeline = new ParserPipeline();
  
  // Process all messages through the pipeline
  const allParsedMessages = pipeline.processMessages(messages);
  
  // Assign team IDs
  const messagesWithTeamIds = pipeline.assignTeamIds(allParsedMessages);
  
  // Evaluate test cases
  const testResults = testCases.map(testCase => {
    const parsedMessage = messagesWithTeamIds[testCase.messageIndex];
    
    // Determine if test passed
    const commandPassed = parsedMessage.modifier === testCase.expectedCommand;
    const teamPassed = testCase.expectedIsTeam === undefined || 
                     parsedMessage.isTeam === testCase.expectedIsTeam;
    const playerCountPassed = testCase.expectedPlayerCount === undefined || 
                            parsedMessage.players.length === testCase.expectedPlayerCount;
    const teamIdPassed = testCase.expectedTeamId === undefined || 
                       parsedMessage.teamId === testCase.expectedTeamId;
    const batchPassed = testCase.expectedBatch === undefined || 
                      parsedMessage.batch === testCase.expectedBatch;
    
    const passed = commandPassed && teamPassed && playerCountPassed && teamIdPassed && batchPassed;
    
    return {
      ...testCase,
      parsedResult: parsedMessage,
      passed,
      details: {
        commandPassed,
        actualCommand: parsedMessage.modifier,
        teamPassed,
        actualIsTeam: parsedMessage.isTeam,
        playerCountPassed,
        actualPlayerCount: parsedMessage.players.length,
        teamIdPassed,
        actualTeamId: parsedMessage.teamId,
        batchPassed,
        actualBatch: parsedMessage.batch
      }
    };
  });
  
  return { testResults, allResults: messagesWithTeamIds };
}

// Save test results
function saveResults(results: MsgParsed[], filePath: string): void {
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`Saved parsing results to: ${filePath}`);
}

// Generate test report
function generateReport(testResults: any[], allResults: MsgParsed[], outputPath: string): void {
  // Count test results
  const totalTests = testResults.length;
  const passedTests = testResults.filter(result => result.passed).length;
  const failedTests = totalTests - passedTests;
  
  // Count message types
  const registrationMessages = allResults.filter(msg => msg.modifier === MessageCommand.REGISTRATION_OPEN).length;
  const systemMessages = allResults.filter(msg => msg.modifier === MessageCommand.SYSTEM).length;
  const inMessages = allResults.filter(msg => msg.modifier === MessageCommand.IN).length;
  const outMessages = allResults.filter(msg => msg.modifier === MessageCommand.OUT).length;
  const teamMessages = allResults.filter(msg => msg.isTeam).length;
  
  // Generate report content
  const report = `# Parser Test Suite Report
Generated: ${new Date().toISOString()}

## Summary

- Total messages processed: ${allResults.length}
- Total test cases: ${totalTests}
- Tests passed: ${passedTests} (${Math.round(passedTests/totalTests*100)}%)
- Tests failed: ${failedTests} (${Math.round(failedTests/totalTests*100)}%)

## Message Classification

- Registration opening messages: ${registrationMessages}
- System messages: ${systemMessages}
- IN messages: ${inMessages}
- OUT messages: ${outMessages}
- Team signups: ${teamMessages}

## Test Results

${testResults.map((result, index) => `
### Test Case #${index + 1}: ${result.description}
- Message: "${result.originalContent}"
- Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}
${!result.passed ? `
#### Failure Details:
- Expected command: ${result.expectedCommand}, got: ${result.details.actualCommand} (${result.details.commandPassed ? 'OK' : 'FAIL'})
${result.expectedIsTeam !== undefined ? `- Expected isTeam: ${result.expectedIsTeam}, got: ${result.details.actualIsTeam} (${result.details.teamPassed ? 'OK' : 'FAIL'})` : ''}
${result.expectedPlayerCount !== undefined ? `- Expected player count: ${result.expectedPlayerCount}, got: ${result.details.actualPlayerCount} (${result.details.playerCountPassed ? 'OK' : 'FAIL'})` : ''}
${result.expectedTeamId !== undefined ? `- Expected team ID: ${result.expectedTeamId}, got: ${result.details.actualTeamId} (${result.details.teamIdPassed ? 'OK' : 'FAIL'})` : ''}
${result.expectedBatch !== undefined ? `- Expected batch: ${result.expectedBatch}, got: ${result.details.actualBatch} (${result.details.batchPassed ? 'OK' : 'FAIL'})` : ''}
` : ''}
- Parsed result: 
\`\`\`json
${JSON.stringify(result.parsedResult, null, 2)}
\`\`\`
`).join('\n')}
`;

  fs.writeFileSync(outputPath, report);
  console.log(`Generated test report at: ${outputPath}`);
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const inputFile = args[0] || DEFAULT_INPUT;
  const contactsFile = args[1] || DEFAULT_CONTACTS;
  const outputFile = args[2] || DEFAULT_OUTPUT;
  
  // Ensure directories exist
  ensureDirectoryExists(TEST_DATA_DIR);
  
  console.log(`Loading messages from: ${inputFile}`);
  const messages = loadMessages(inputFile);
  console.log(`Loaded ${messages.length} messages`);
  
  console.log(`Loading contacts from: ${contactsFile}`);
  const contacts = loadContacts(contactsFile);
  console.log(`Loaded ${Object.keys(contacts).length} contacts`);
  
  // Define test cases
  console.log('Defining test cases...');
  const testCases = defineTestCases(messages);
  console.log(`Created ${testCases.length} test cases`);
  
  // Process test cases
  console.log('Processing test cases...');
  const { testResults, allResults } = processTestCases(testCases, messages);
  
  // Save full parsing results
  saveResults(allResults, outputFile);
  
  // Generate test report
  const reportPath = DEFAULT_REPORT;
  generateReport(testResults, allResults, reportPath);
  
  // Print test summary
  const passedTests = testResults.filter(result => result.passed).length;
  const failedTests = testResults.length - passedTests;
  
  console.log('\nTest Summary:');
  console.log(`Total tests: ${testResults.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success rate: ${Math.round(passedTests/testResults.length*100)}%`);
  
  if (failedTests > 0) {
    console.log('\nFailed tests:');
    testResults
      .filter(result => !result.passed)
      .forEach((result, index) => {
        console.log(`${index + 1}. "${result.originalContent}" (${result.description})`);
      });
  }
  
  console.log('\nTest suite completed!');
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
