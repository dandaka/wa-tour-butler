#!/usr/bin/env node
/**
 * Run Pipeline Test
 * 
 * This script runs the parser pipeline on previously extracted test messages
 * and analyzes the results, generating a detailed report.
 */

import path from 'path';
import fs from 'fs';
import { ParserPipeline } from '../pipeline/parser-pipeline';
import { MsgParsed, MessageCommand } from '../types/message-parsing';
import { formatDateYYYYMMDDHHMMSS } from '../utils/date';

// Default paths
const DEFAULT_DATA_PATH = path.join(process.cwd(), 'data', 'test-data');
const DEFAULT_REPORT_PATH = path.join(process.cwd(), 'data', 'test-reports');

// Read messages from file
function readMessagesFromFile(filePath: string): any[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading message file at ${filePath}:`, error);
    return [];
  }
}

// Save parsing results to file
function saveResultsToFile(results: MsgParsed[], filePath: string) {
  const dirPath = path.dirname(filePath);
  
  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`Saved parsing results to: ${filePath}`);
}

// Generate Markdown report
function generateReport(messages: any[], parsedMessages: MsgParsed[], reportPath: string) {
  const now = new Date();
  const reportHeader = `# Parser Pipeline Test Report\n\nGenerated: ${formatDateYYYYMMDDHHMMSS(now)}\n\n`;
  
  // Count message types
  const totalMessages = parsedMessages.length;
  const registrationMessages = parsedMessages.filter(msg => msg.modifier === MessageCommand.REGISTRATION_OPEN).length;
  const systemMessages = parsedMessages.filter(msg => msg.modifier === MessageCommand.SYSTEM).length;
  const inMessages = parsedMessages.filter(msg => msg.modifier === MessageCommand.IN).length;
  const outMessages = parsedMessages.filter(msg => msg.modifier === MessageCommand.OUT).length;
  const teamMessages = parsedMessages.filter(msg => msg.isTeam).length;
  const conversationMessages = parsedMessages.filter(msg => msg.modifier === MessageCommand.CONVERSATION).length;
  
  // Generate statistics
  let report = reportHeader;
  report += `## Summary\n\n`;
  report += `- Total messages: ${totalMessages}\n`;
  report += `- Registration opening messages: ${registrationMessages}\n`;
  report += `- System messages: ${systemMessages}\n`;
  report += `- IN messages: ${inMessages}\n`;
  report += `- OUT messages: ${outMessages}\n`;
  report += `- Team signups: ${teamMessages}\n`;
  report += `- Regular conversation: ${conversationMessages}\n\n`;
  
  // Registration messages
  if (registrationMessages > 0) {
    report += `## Registration Opening Messages\n\n`;
    parsedMessages
      .filter(msg => msg.modifier === MessageCommand.REGISTRATION_OPEN)
      .forEach((msg, i) => {
        const date = new Date(msg.timestamp * 1000);
        report += `### Message #${i+1}\n`;
        report += `- Date: ${formatDateYYYYMMDDHHMMSS(date)}\n`;
        report += `- Sender: ${msg.sender}\n`;
        report += `- Content: "${msg.originalText}"\n\n`;
      });
  }
  
  // Player signup messages with batches
  if (inMessages > 0) {
    // Group by batch
    const batchMap = new Map<string, MsgParsed[]>();
    
    // Initialize with "No batch specified"
    batchMap.set('No batch specified', []);
    
    // Group messages by batch
    parsedMessages
      .filter(msg => msg.modifier === MessageCommand.IN)
      .forEach(msg => {
        const batch = msg.batch || 'No batch specified';
        if (!batchMap.has(batch)) {
          batchMap.set(batch, []);
        }
        batchMap.get(batch)?.push(msg);
      });
    
    report += `## Player Signups by Batch\n\n`;
    
    // Output each batch
    for (const [batch, messages] of batchMap.entries()) {
      if (messages.length === 0) continue;
      
      report += `### ${batch} (${messages.length} signups)\n\n`;
      
      messages.forEach((msg, i) => {
        const date = new Date(msg.timestamp * 1000);
        report += `#### Signup #${i+1} (${formatDateYYYYMMDDHHMMSS(date).split(' ')[1]})\n`;
        report += `- Original message: "${msg.originalText}"\n`;
        report += `- Sender: ${msg.sender}\n`;
        
        if (msg.players.length > 0) {
          report += `- Parsed names: ${msg.players.map(p => p.displayName).join(', ')}\n`;
        }
        
        report += `- Status: IN\n`;
        report += `- Is team: ${msg.isTeam}\n`;
        report += `- Timestamp: ${formatDateYYYYMMDDHHMMSS(date)}\n`;
        
        if (msg.teamId) {
          report += `- Team ID: ${msg.teamId}\n`;
        }
        
        report += `\n`;
      });
    }
  }
  
  // Save report to file
  const dirPath = path.dirname(reportPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, report);
  console.log(`Generated report at: ${reportPath}`);
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const dataFileName = args[0];
  
  if (!dataFileName) {
    console.error('Please provide a data file name!');
    console.error('Usage: run-pipeline-test.ts <dataFileName> [outputPrefix]');
    process.exit(1);
  }
  
  const outputPrefix = args[1] || dataFileName.replace('.json', '');
  
  // Construct file paths
  const dataFilePath = path.join(DEFAULT_DATA_PATH, dataFileName);
  const resultsFilePath = path.join(DEFAULT_REPORT_PATH, `${outputPrefix}-results.json`);
  const reportFilePath = path.join(DEFAULT_REPORT_PATH, `${outputPrefix}-report.md`);
  
  console.log(`Loading test data from: ${dataFilePath}`);
  
  // Load test messages
  const messages = readMessagesFromFile(dataFilePath);
  if (messages.length === 0) {
    console.error('No messages found in data file!');
    process.exit(1);
  }
  
  console.log(`Loaded ${messages.length} messages for processing`);
  
  // Initialize parser pipeline
  const pipeline = new ParserPipeline();
  
  // Process all messages
  console.log('Running pipeline...');
  const parsedMessages = pipeline.processMessages(messages);
  
  // Assign team IDs
  console.log('Assigning team IDs...');
  const messagesWithTeamIds = pipeline.assignTeamIds(parsedMessages);
  
  // Save results to file
  saveResultsToFile(messagesWithTeamIds, resultsFilePath);
  
  // Generate report
  console.log('Generating report...');
  generateReport(messages, messagesWithTeamIds, reportFilePath);
  
  console.log('\nTest completed successfully!');
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
