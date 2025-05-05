import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

type DatabaseType = ReturnType<typeof BetterSqlite3>;

// Types
interface GroupInfo {
  id: string;
  name: string;
  admin: string;
  tournamentTime?: string;
  signupStartTime?: string;
  maxTeams?: number;
}

interface Message {
  id: string;
  chat_id: string;
  sender: string;
  timestamp: number;
  content: string;
  is_from_me: number;
}

interface FormattedSignup {
  originalMessage: string;
  names: string[];
  time?: string;
  status: 'IN' | 'OUT';
  timestamp: number;
  sender: string;
}

interface ProcessingResult {
  registrationOpenMessage?: Message;
  signups: FormattedSignup[];
  finalPlayerList: string[];
}

// Constants
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(PROJECT_ROOT, 'data/whatsapp_messages.db');
const GROUPS_CSV_PATH = path.join(PROJECT_ROOT, 'GROUPS.csv');
const REGISTRATION_START_KEYWORD = 'Inscrições abertas';
const OUTPUT_DIR = PROJECT_ROOT;

// Main function
async function processSignups(groupId: string, outputPath?: string) {
  console.log(`Processing signups for group ${groupId}...`);
  
  // Connect to database
  const db = new BetterSqlite3(DB_PATH);
  
  try {
    // 1. Get group info from CSV
    const groupInfo = await getGroupInfo(groupId);
    if (!groupInfo) {
      throw new Error(`Group ID ${groupId} not found in ${GROUPS_CSV_PATH}`);
    }
    
    console.log(`Found group: ${groupInfo.name}`);
    
    // 2. Get messages from this group
    const messages = getMessagesFromGroup(db, groupId);
    console.log(`Found ${messages.length} messages in this group`);
    
    // 3. Process messages
    const result = processMessages(messages, groupInfo);
    
    // 4. Output results
    const logOutput = formatOutput(result, groupInfo);
    
    if (outputPath) {
      fs.writeFileSync(outputPath, logOutput);
      console.log(`Results written to ${outputPath}`);
    } else {
      console.log(logOutput);
    }
    
    return result;
  } finally {
    // Close database connection
    db.close();
  }
}

// Get group info from CSV file
async function getGroupInfo(groupId: string): Promise<GroupInfo | null> {
  return new Promise((resolve) => {
    const results: GroupInfo[] = [];
    
    fs.createReadStream(GROUPS_CSV_PATH)
      .pipe(csv())
      .on('data', (data: any) => {
        // Print raw CSV data for debugging
        console.log('Raw CSV row:', data);
        
        // Adjust for potential column name issues
        const groupInfo: GroupInfo = {
          id: data.ID || data.id,
          name: data.Name || data.name,
          admin: data.Admin || data.admin,
          // Handle missing or empty fields
          tournamentTime: (data.TournamentTime || data.tournamentTime || '').trim(),
          signupStartTime: (data.SignupStartTime || data.signupStartTime || '').trim(),
          maxTeams: parseInt(data.MaxTeams || data.maxTeams || '0')
        };
        
        results.push(groupInfo);
        console.log('Parsed group info:', groupInfo);
      })
      .on('end', () => {
        const group = results.find(g => g.id === groupId);
        resolve(group || null);
      });
  });
}

// Get messages from the database for a specific group
function getMessagesFromGroup(db: DatabaseType, groupId: string): Message[] {
  const query = `
    SELECT id, chat_id, sender, timestamp, content, is_from_me
    FROM messages
    WHERE chat_id = ?
    ORDER BY timestamp ASC
  `;
  
  return db.prepare(query).all(groupId) as Message[];
}

// Process messages to extract signup information
function processMessages(messages: Message[], groupInfo: GroupInfo): ProcessingResult {
  const result: ProcessingResult = {
    signups: [],
    finalPlayerList: []
  };
  
  // Find the most recent registration open message from the admin
  let registrationStarted = false;
  let registrationTimestamp = 0;
  
  console.log(`Looking for admin ${groupInfo.admin} messages containing '${REGISTRATION_START_KEYWORD}'`);
  
  // Check for any messages that look like registration openings
  const potentialRegistrationMessages = messages
    .filter(m => m.sender === groupInfo.admin)
    .filter(m => m.content.includes(REGISTRATION_START_KEYWORD));
  
  console.log(`Found ${potentialRegistrationMessages.length} potential registration messages`);
  
  // Find the most recent messages first (starting from the end)
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    
    // Be more flexible for registration detection
    const isFromAdmin = message.sender === groupInfo.admin;
    const containsRegistrationKeyword = message.content.includes(REGISTRATION_START_KEYWORD);
    const containsTimeSlots = /\d+[h:]\d+|\d+h/.test(message.content);
    
    if (isFromAdmin && (containsRegistrationKeyword || 
        (isFromAdmin && containsTimeSlots && message.content.toLowerCase().includes('inscri')))) {
      registrationStarted = true;
      registrationTimestamp = message.timestamp;
      result.registrationOpenMessage = message;
      console.log(`Found registration start message at ${new Date(message.timestamp * 1000).toLocaleString()}:`);
      console.log(`Content: "${message.content}"`);
      // Break after finding the most recent registration message
      break;
    }
  }
  
  // If registration message found, now process all messages after that timestamp
  if (registrationStarted) {
    for (const message of messages) {
      // Skip messages before registration opened or from the admin
      if (message.timestamp < registrationTimestamp || message.sender === groupInfo.admin) {
        continue;
      }
      
      // Debug: examine just a few messages after registration
      if (message.timestamp > registrationTimestamp && message.timestamp < registrationTimestamp + 300) { // 5 minutes
        console.log(`Processing potential signup: ${new Date(message.timestamp * 1000).toLocaleString()} - ${message.content}`);
      }
      
      // Parse message for signup information
      const parsedSignup = parseSignupMessage(message);
      if (parsedSignup) {
        result.signups.push(parsedSignup);
        
        // Update player list based on signup status
        if (parsedSignup.status === 'IN') {
          // Add players to the list
          parsedSignup.names.forEach(name => {
            if (!result.finalPlayerList.includes(name)) {
              result.finalPlayerList.push(name);
            }
          });
        } else if (parsedSignup.status === 'OUT') {
          // Remove players from the list
          parsedSignup.names.forEach(name => {
            const index = result.finalPlayerList.indexOf(name);
            if (index !== -1) {
              result.finalPlayerList.splice(index, 1);
            }
          });
        }
      }
    }
  }
  
  return result;
}

// Parse a signup message to extract player names and status
function parseSignupMessage(message: Message): FormattedSignup | null {
  const content = message.content.trim();
  
  // Skip empty messages
  if (!content) return null;
  
  // Skip protocol messages and system messages
  if (content.includes('[PROTOCOLMESSAGE]') || 
      content.includes('[MESSAGECONTEXTINFO]') ||
      content.match(/^(\d+)$/) || // Skip messages that are just a number
      content.length < 3) { // Skip very short messages
    return null; 
  }
  
  // Debug parsing attempts for troubleshooting
  const debug = message.timestamp > Date.now()/1000 - 3600; // Debug messages from last hour
  if (debug) {
    console.log(`Trying to parse: "${content}"`);
  }
  
  // Check if it's an OUT message
  const isOut = /\b(out|sai|saio|n[aã]o posso|can't make it|cancel)\b/i.test(content);
  
  // Extract time if present (common formats: 15h, 15:00, etc.)
  const timeMatch = content.match(/\b(\d{1,2})[h:](\d{2})?\b|\b(\d{1,2})h\b/i);
  
  // All messages coming after registration are considered IN by default unless marked as OUT
  // This makes the parser more lenient for typical short signup messages
  let time: string | undefined = undefined;
  
  if (timeMatch) {
    time = formatTimeMatch(timeMatch);
  }
  
  // Split content into parts based on common separators
  const separators = /\s*(?:[&+,\/]|e|and)\s*/i;
  const parts = content.split(separators);
  
  // Extract names
  const names: string[] = [];
  
  // For very simple messages, consider the whole message as a name
  // This handles cases like "João in 15h" where we want to extract "João"
  if (parts.length <= 3 && content.length < 30 && !isOut) {
    // Extract the first part that looks like a name
    const simpleName = content.replace(/\b\d+[h:]?\d*\b|\bin\b|\bout\b|\bh\b|\b[0-9]+\b/gi, '').trim();
    if (simpleName && simpleName.length > 1) {
      return {
        originalMessage: content,
        names: [simpleName],
        time: timeMatch ? formatTimeMatch(timeMatch) : undefined,
        status: isOut ? 'OUT' : 'IN',
        timestamp: message.timestamp,
        sender: message.sender
      };
    }
  }
  
  for (const part of parts) {
    // Skip parts that might be just time or other info
    if (
      /^\d+[h:]?\d*$/.test(part) || // Skip time patterns
      /^in$|^out$|^sim$|^yes$|^no$|^não$/i.test(part) || // Skip yes/no words
      /^\s*$/.test(part) || // Skip empty parts
      /^\d\d?:\d\d$/.test(part) || // Skip time format HH:MM
      /^\d\d?h\d\d?$/.test(part) || // Skip time format HHhMM
      /^\d\d?[:-]\d\d?$/.test(part) // Skip any time-like format
    ) {
      continue;
    }
    
    // Clean up the name
    let name = part.trim()
      .replace(/^\s*[-•]?\s*/, '') // Remove leading dashes or bullets
      .replace(/\s+/, ' ') // Normalize spaces
      .replace(/\bin\b|\bout\b/i, '') // Remove standalone in/out words
      .trim();
    
    // Extract name from common patterns
    const nameMatch = name.match(/^([A-Za-z\s.\-']+)(?:\s*\([^)]*\))?/);
    if (nameMatch && nameMatch[1].trim().length > 1) {
      name = nameMatch[1].trim();
      names.push(name);
    } else if (name.length > 1) {
      names.push(name);
    }
  }
  
  // Skip if no valid names found
  if (names.length === 0) {
    // Last attempt - for very simple messages, use the whole message without numbers
    if (content.length < 30) {
      const simpleName = content.replace(/\b\d+[h:]?\d*\b|\bin\b|\bout\b|\bh\b|\b[0-9]+\b/gi, '').trim();
      if (simpleName && simpleName.length > 1) {
        names.push(simpleName);
      }
    }
    
    // If still no names, return null
    if (names.length === 0) return null;
  }
  
  return {
    originalMessage: content,
    names,
    time,
    status: isOut ? 'OUT' : 'IN',
    timestamp: message.timestamp,
    sender: message.sender
  };
}

// Helper function to format time matches consistently
function formatTimeMatch(timeMatch: RegExpMatchArray): string {
  if (timeMatch[3]) {
    // Format like "15h"
    return `${timeMatch[3]}:00`;
  } else if (timeMatch[1] && timeMatch[2]) {
    // Format like "15:00"
    return `${timeMatch[1]}:${timeMatch[2]}`;
  } else if (timeMatch[1]) {
    // Format like "15"
    return `${timeMatch[1]}:00`;
  }
  return "";
}
  
  // Split content into parts based on common separators
  const separators = /\s*(?:[&+,\/]|e|and)\s*/i;
  const parts = content.split(separators);
  
  // Extract names
  const names: string[] = [];
  
  // For very simple messages, consider the whole message as a name
  // This handles cases like "João in 15h" where we want to extract "João"
  if (parts.length <= 3 && content.length < 30 && !isOut) {
    // Extract the first part that looks like a name
    const simpleName = content.replace(/\b\d+[h:]?\d*\b|\bin\b|\bout\b|\bh\b|\b[0-9]+\b/gi, '').trim();
    if (simpleName && simpleName.length > 1) {
      return {
        originalMessage: content,
        names: [simpleName],
        time: timeMatch ? formatTimeMatch(timeMatch) : undefined,
        status: isOut ? 'OUT' : 'IN',
        timestamp: message.timestamp,
        sender: message.sender
      };
    }
  }
  
  for (const part of parts) {
    // Skip parts that might be just time or other info
    if (
      /^\d+[h:]?\d*$/.test(part) || // Skip time patterns
      /^in$|^out$|^sim$|^yes$|^no$|^não$/i.test(part) || // Skip yes/no words
      /^\s*$/.test(part) || // Skip empty parts
      /^\d\d?:\d\d$/.test(part) || // Skip time format HH:MM
      /^\d\d?h\d\d?$/.test(part) || // Skip time format HHhMM
      /^\d\d?[:-]\d\d?$/.test(part) // Skip any time-like format
    ) {
      continue;
    }
    
    // Clean up the name
    let name = part.trim()
      .replace(/^\s*[-•]?\s*/, '') // Remove leading dashes or bullets
      .replace(/\s+/, ' ') // Normalize spaces
      .replace(/\bin\b|\bout\b/i, '') // Remove standalone in/out words
      .trim();
    
    // Extract name from common patterns
    const nameMatch = name.match(/^([A-Za-z\s.\-']+)(?:\s*\([^)]*\))?/);
    if (nameMatch && nameMatch[1].trim().length > 1) {
      name = nameMatch[1].trim();
      names.push(name);
    } else if (name.length > 1) {
      names.push(name);
    }
  }
  
  // Skip if no valid names found
  if (names.length === 0) {
    // Last attempt - for very simple messages, use the whole message without numbers
    if (content.length < 30) {
      const simpleName = content.replace(/\b\d+[h:]?\d*\b|\bin\b|\bout\b|\bh\b|\b[0-9]+\b/gi, '').trim();
      if (simpleName && simpleName.length > 1) {
        names.push(simpleName);
      }
    }
    
    // If still no names, return null
    if (names.length === 0) return null;
  }
  
  return {
    originalMessage: content,
    names,
    time,
    status: isOut ? 'OUT' : 'IN',
    timestamp: message.timestamp,
    sender: message.sender
  };
}

// Format the output for logging
function formatOutput(result: ProcessingResult, groupInfo: GroupInfo): string {
  let output = `# Signup Processing for ${groupInfo.name}\n\n`;
  
  // Registration info
  if (result.registrationOpenMessage) {
    const date = new Date(result.registrationOpenMessage.timestamp * 1000);
    output += `## Registration Information\n`;
    output += `- Registration opened: ${date.toLocaleString()}\n`;
    output += `- Admin: ${groupInfo.admin}\n`;
    output += `- Original message: "${result.registrationOpenMessage.content}"\n\n`;
  }
  
  // Signups log
  output += `## Signup Processing Log\n\n`;
  
  if (result.signups.length === 0) {
    output += `No signups found after registration opened.\n\n`;
  } else {
    result.signups.forEach((signup, index) => {
      const date = new Date(signup.timestamp * 1000);
      output += `### Signup #${index + 1} (${date.toLocaleTimeString()})\n`;
      output += `- Original message: "${signup.originalMessage}"\n`;
      output += `- Sender: ${signup.sender}\n`;
      output += `- Parsed names: ${signup.names.join(', ')}\n`;
      if (signup.time) {
        output += `- Time slot: ${signup.time}\n`;
      }
      output += `- Status: ${signup.status}\n\n`;
    });
  }
  
  // Final player list
  output += `## Final Player List (${result.finalPlayerList.length} players)\n\n`;
  
  if (result.finalPlayerList.length === 0) {
    output += `No players signed up.\n`;
  } else {
    result.finalPlayerList.forEach((player, index) => {
      output += `${index + 1}. ${player}\n`;
    });
  }
  
  return output;
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const groupId = args[0];
  const outputPath = args[1];
  
  if (!groupId) {
    console.error('Please provide a group ID as the first argument');
    process.exit(1);
  }
  
  processSignups(groupId, outputPath).catch(err => {
    console.error('Error processing signups:', err);
    process.exit(1);
  });
}

// Export for use in other modules
export { processSignups, parseSignupMessage };
