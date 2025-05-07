#!/usr/bin/env node
/**
 * Extract Contacts
 * 
 * This script extracts contact information from the WhatsApp database
 * and outputs it as a JSON file that can be used for mapping phone numbers
 * to contact names in test scenarios.
 */

import path from 'path';
import fs from 'fs';
import BetterSqlite3 from 'better-sqlite3';

// Output paths
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'test-data');
const DEFAULT_OUTPUT_PATH = path.join(OUTPUT_DIR, 'contacts.json');

// Database connection
function connectToDatabase() {
  // Paths to potential database files (in order of preference)
  const potentialDbPaths = [
    path.join(process.cwd(), 'data', 'whatsapp_messages.db'),
    path.join(process.cwd(), 'data', 'messages.db'),
    path.join(process.cwd(), 'data', 'group_messages.db')
  ];
  
  // Find the first existing database file
  let dbPath = null;
  for (const potentialPath of potentialDbPaths) {
    if (fs.existsSync(potentialPath)) {
      dbPath = potentialPath;
      console.log(`Using database: ${dbPath}`);
      break;
    }
  }
  
  if (!dbPath) {
    console.error('No valid database file found!');
    process.exit(1);
  }
  
  return new BetterSqlite3(dbPath, { readonly: true });
}

// Extract contacts from the database
function extractContacts(db: BetterSqlite3.Database, limit: number = 1000) {
  try {
    // First check if the contacts table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='contacts'
    `).get();

    if (tableExists) {
      console.log('Using contacts table...');
      // Use the contacts table if it exists
      return db.prepare(`
        SELECT jid as phone_number, name, notify, push_name
        FROM contacts
        LIMIT ?
      `).all(limit);
    } 
    
    console.log('No contacts table found, extracting from messages...');
    // If no contacts table, extract unique senders from messages
    return db.prepare(`
      SELECT DISTINCT sender as phone_number
      FROM messages
      WHERE sender IS NOT NULL
      LIMIT ?
    `).all(limit);
  } catch (error) {
    console.log('Error querying contact information, trying alternative approach...');
    
    // Fall back to simply extracting unique senders
    try {
      return db.prepare(`
        SELECT DISTINCT sender as phone_number
        FROM messages
        WHERE sender IS NOT NULL
        LIMIT ?
      `).all(limit);
    } catch (err) {
      console.error('Error extracting contact information:', err);
      return [];
    }
  }
}

// Process contact data into a useful format
function processContactData(contacts: any[]): Record<string, string> {
  const contactMap: Record<string, string> = {};
  
  contacts.forEach(contact => {
    const phoneNumber = contact.phone_number?.replace('@s.whatsapp.net', '');
    
    if (!phoneNumber) return;
    
    // Use the best available name
    let displayName = phoneNumber;
    
    if (contact.name) {
      displayName = contact.name;
    } else if (contact.notify) {
      displayName = contact.notify;
    } else if (contact.push_name) {
      displayName = contact.push_name;
    }
    
    // Just use the phone number when no real name is available
    // We don't want to generate fake names as it can create confusion
    
    contactMap[phoneNumber] = displayName;
  });
  
  return contactMap;
}

// Save contact map to file
function saveContactMap(contactMap: Record<string, string>, outputPath: string) {
  const dirPath = path.dirname(outputPath);
  
  // Ensure output directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(contactMap, null, 2));
  console.log(`Saved ${Object.keys(contactMap).length} contacts to: ${outputPath}`);
  
  // Print a sample
  const entries = Object.entries(contactMap);
  if (entries.length > 0) {
    console.log('\nSample contacts:');
    for (let i = 0; i < Math.min(5, entries.length); i++) {
      const [phone, name] = entries[i];
      console.log(`${phone}: "${name}"`);
    }
  }
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const limit = args[0] ? parseInt(args[0], 10) : 1000;
  const outputPath = args[1] || DEFAULT_OUTPUT_PATH;
  
  console.log(`Extracting up to ${limit} contacts`);
  console.log(`Output path: ${outputPath}`);
  
  // Connect to database
  const db = connectToDatabase();
  
  try {
    // Extract contacts
    const contacts = extractContacts(db, limit);
    console.log(`Found ${contacts.length} contacts`);
    
    // Process contacts into a lookup map
    const contactMap = processContactData(contacts);
    
    // Save to file
    saveContactMap(contactMap, outputPath);
    
    console.log('\nContact extraction complete!');
  } catch (error) {
    console.error('Error extracting contacts:', error);
  } finally {
    // Close database connection
    db.close();
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
