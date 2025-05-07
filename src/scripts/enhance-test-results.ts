#!/usr/bin/env node
/**
 * Enhance Test Results
 * 
 * This script enhances test results by replacing phone numbers with 
 * actual names from the contacts.json file. It processes both the
 * raw JSON results and updates the Markdown report.
 */

import path from 'path';
import fs from 'fs';
import { MsgParsed } from '../types/message-parsing';

// Paths
const DATA_DIR = path.join(process.cwd(), 'data', 'test-data');
const REPORTS_DIR = path.join(process.cwd(), 'data', 'test-reports');
const CONTACTS_PATH = path.join(DATA_DIR, 'contacts.json');

// Load contacts map
function loadContacts(): Record<string, string> {
  try {
    const contactsJson = fs.readFileSync(CONTACTS_PATH, 'utf8');
    return JSON.parse(contactsJson);
  } catch (error) {
    console.error(`Error loading contacts from ${CONTACTS_PATH}:`, error);
    return {};
  }
}

// Load test results
function loadTestResults(resultsPath: string): MsgParsed[] {
  try {
    const resultsJson = fs.readFileSync(resultsPath, 'utf8');
    return JSON.parse(resultsJson);
  } catch (error) {
    console.error(`Error loading test results from ${resultsPath}:`, error);
    return [];
  }
}

// Load report file
function loadReport(reportPath: string): string {
  try {
    return fs.readFileSync(reportPath, 'utf8');
  } catch (error) {
    console.error(`Error loading report from ${reportPath}:`, error);
    return '';
  }
}

// Enhance parsed messages with contact names
function enhanceMessages(messages: MsgParsed[], contactMap: Record<string, string>): MsgParsed[] {
  return messages.map(msg => {
    const enhancedMsg = { ...msg };
    
    // Update sender
    const senderPhone = msg.sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
    if (contactMap[senderPhone]) {
      enhancedMsg.sender = `${contactMap[senderPhone]} (${senderPhone})`;
    }
    
    // Update players
    if (msg.players && msg.players.length > 0) {
      enhancedMsg.players = msg.players.map(player => {
        const enhancedPlayer = { ...player };
        
        // If player has a phone number, try to enhance with contact name
        if (player.phoneNumber) {
          const cleanPhone = player.phoneNumber.replace('@s.whatsapp.net', '');
          
          if (contactMap[cleanPhone] && !player.name) {
            enhancedPlayer.name = contactMap[cleanPhone];
            enhancedPlayer.displayName = contactMap[cleanPhone];
          }
        }
        
        return enhancedPlayer;
      });
    }
    
    return enhancedMsg;
  });
}

// Enhance Markdown report with contact names
function enhanceReport(report: string, contactMap: Record<string, string>): string {
  let enhancedReport = report;
  
  // Replace phone numbers in the report with their contact names
  for (const [phone, name] of Object.entries(contactMap)) {
    // Only replace numbers that are not already part of a name string
    // Look for phone numbers at the beginnings of lines or after "Sender: "
    const phoneRegex1 = new RegExp(`Sender: ${phone}@s\\.whatsapp\\.net`, 'g');
    enhancedReport = enhancedReport.replace(phoneRegex1, `Sender: ${name} (${phone}@s.whatsapp.net)`);
    
    // Replace parsed phone numbers that are just numbers
    const phoneRegex2 = new RegExp(`Parsed names: ${phone}(\\b|,)`, 'g');
    enhancedReport = enhancedReport.replace(phoneRegex2, `Parsed names: ${name}$1`);
    
    // Be careful not to replace phone numbers that are already part of a name
    // This regex only replaces the phone if it's not followed by a name in parentheses
    const phoneRegex3 = new RegExp(`\\b${phone}\\b(?!\\s*\\()`, 'g');
    enhancedReport = enhancedReport.replace(phoneRegex3, `${name} (${phone})`);
  }
  
  return enhancedReport;
}

// Save enhanced results
function saveEnhancedResults(messages: MsgParsed[], outputPath: string) {
  fs.writeFileSync(outputPath, JSON.stringify(messages, null, 2));
  console.log(`Saved enhanced results to: ${outputPath}`);
}

// Save enhanced report
function saveEnhancedReport(report: string, outputPath: string) {
  fs.writeFileSync(outputPath, report);
  console.log(`Saved enhanced report to: ${outputPath}`);
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Please provide a test results file name!');
    console.error('Usage: enhance-test-results.ts <resultsFileName> [outputPrefix]');
    process.exit(1);
  }
  
  const resultsFileName = args[0];
  const outputPrefix = args[1] || resultsFileName.replace('-results.json', '-enhanced');
  
  // Construct file paths
  const resultsPath = path.join(REPORTS_DIR, resultsFileName);
  const reportPath = path.join(REPORTS_DIR, resultsFileName.replace('-results.json', '-report.md'));
  
  const enhancedResultsPath = path.join(REPORTS_DIR, `${outputPrefix}-results.json`);
  const enhancedReportPath = path.join(REPORTS_DIR, `${outputPrefix}-report.md`);
  
  console.log(`Loading contacts from: ${CONTACTS_PATH}`);
  const contactMap = loadContacts();
  console.log(`Loaded ${Object.keys(contactMap).length} contacts`);
  
  console.log(`Loading test results from: ${resultsPath}`);
  const messages = loadTestResults(resultsPath);
  console.log(`Loaded ${messages.length} messages`);
  
  console.log(`Loading report from: ${reportPath}`);
  const report = loadReport(reportPath);
  
  // Enhance the messages with contact names
  console.log('Enhancing messages with contact names...');
  const enhancedMessages = enhanceMessages(messages, contactMap);
  
  // Enhance the report with contact names
  console.log('Enhancing report with contact names...');
  const enhancedReport = enhanceReport(report, contactMap);
  
  // Save enhanced results
  saveEnhancedResults(enhancedMessages, enhancedResultsPath);
  
  // Save enhanced report
  saveEnhancedReport(enhancedReport, enhancedReportPath);
  
  console.log('\nEnhancement completed successfully!');
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
