import { connectToDatabase, getMessagesFromGroup, DatabaseMessage } from '../utils/database';
import { getGroupInfo } from '../utils/file';
import fs from 'fs';
import path from 'path';
import { GROUPS_CSV_PATH } from '../constants';

// Use the path from constants.ts

async function main() {
  // Get all groups from the CSV
  const groups: { id: string; name: string }[] = [];
  
  // Read the groups.csv file
  const lines = fs.readFileSync(GROUPS_CSV_PATH, 'utf8').split('\n');
  const headers = lines[0].split(',');
  const idIndex = headers.indexOf('ID');
  const nameIndex = headers.indexOf('Name');
  
  console.log(`Headers: ${headers}`);
  console.log(`ID index: ${idIndex}, Name index: ${nameIndex}`);
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split(',');
    groups.push({
      id: cols[idIndex],
      name: cols[nameIndex]
    });
  }
  
  console.log(`Found ${groups.length} groups`);
  
  // Connect to the database
  const db = connectToDatabase();
  
  // For each group, get the latest 20 messages
  for (const group of groups) {
    console.log(`\n=============================================`);
    console.log(`Group: ${group.name} (${group.id})`);
    console.log(`=============================================`);
    
    const messages = getMessagesFromGroup(db, group.id);
    
    // Sort by timestamp descending and take the latest 20
    const latestMessages = messages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
    
    if (latestMessages.length === 0) {
      console.log('No messages found for this group');
      continue;
    }
    
    // Get the date of the latest message
    const latestDate = new Date(latestMessages[0].timestamp * 1000);
    console.log(`Latest message date: ${latestDate.toLocaleString()}`);
    
    // Print the latest 20 messages
    console.log('\nLatest messages:');
    latestMessages.forEach((msg, i) => {
      const date = new Date(msg.timestamp * 1000);
      const sender = msg.sender.split('@')[0];
      const content = msg.content.replace(/\n/g, ' ').substring(0, 50) + 
                      (msg.content.length > 50 ? '...' : '');
      
      console.log(`${i+1}. [${date.toLocaleString()}] ${sender}: ${content}`);
    });
  }
  
  db.close();
}

main().catch(console.error);
