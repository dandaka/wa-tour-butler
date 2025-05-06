import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { parseSignupMessage, WhatsAppMessage, ParsedSignup } from '../utils/signup-parser';
import { processSignupsWithTeams, SignupWithTeam } from '../utils/team-numbering';

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

interface Message extends WhatsAppMessage {
  id: string;
  chat_id: string;
  is_from_me: number;
}

interface ProcessingResult {
  registrationOpenMessage?: Message;
  signups: ParsedSignup[];
  processedSignups?: SignupWithTeam[]; // Added for team numbering
  finalPlayerList: string[];
}

// Constants
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(PROJECT_ROOT, 'data/whatsapp_messages.db');
const GROUPS_CSV_PATH = path.join(PROJECT_ROOT, 'GROUPS.csv');
// More flexible registration keywords
const REGISTRATION_KEYWORDS = [
  'Inscrições abertas',
  'Inscrições',
  'abertas',
  'inscrição',
  'Registros'  
];
const OUTPUT_DIR = PROJECT_ROOT;

// Main function
async function processSignups(groupId: string, outputPath?: string, forceRegistrationTimestamp?: number) {
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
    
    // Log all messages from +351 966 314 427 regardless of registration timestamp
    console.log('\n\u2728 MESSAGES FROM +351 966 314 427:');
    const messagesFromNumber = messages.filter(m => m.sender.includes('351966314427'));
    messagesFromNumber.forEach(m => {
      const date = new Date(m.timestamp * 1000);
      console.log(`[${date.toLocaleString()}] ${m.content}`);
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

    // 3. Process messages
    const result = processMessages(messages, groupInfo, forceRegistrationTimestamp);
    
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
function processMessages(messages: Message[], groupInfo: GroupInfo, forceRegistrationTimestamp?: number): ProcessingResult {
  const result: ProcessingResult = {
    signups: [],
    finalPlayerList: []
  };
  
  // Find the most recent registration open message from the admin
  let registrationStarted = false;
  let registrationTimestamp = 0;
  
  console.log(`Looking for admin ${groupInfo.admin} messages related to registration`);
  
  // Check for any messages that look like registration openings more flexibly
  const potentialRegistrationMessages = messages
    .filter(m => {
      // Handle WhatsApp formatting of phone numbers with @s.whatsapp.net suffix
      return m.sender === groupInfo.admin || m.sender === `${groupInfo.admin}@s.whatsapp.net`;
    })
    .filter(m => {
      const lowerContent = m.content.toLowerCase();
      // Match if any registration keyword appears
      return REGISTRATION_KEYWORDS.some(keyword => 
        lowerContent.includes(keyword.toLowerCase())
      ) ||
      // Or check for patterns that suggest a registration opening
      (lowerContent.includes('h') && 
       (lowerContent.match(/\d+[h:]\d+/) || lowerContent.match(/\d+h/)) && 
       (lowerContent.includes('h00') || lowerContent.includes('h30')))
    });
  
  console.log(`Found ${potentialRegistrationMessages.length} potential registration messages`);
  
  // For debugging, show the potential registration messages
  if (potentialRegistrationMessages.length > 0) {
    console.log('Potential registration messages:');
    potentialRegistrationMessages.forEach((msg, i) => {
      const date = new Date(msg.timestamp * 1000);
      console.log(`${i+1}. [${date.toLocaleString()}] ${msg.content.substring(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
    });
  }
  
  // Find the most recent messages first (starting from the end)
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    
    // Be more flexible for registration detection
    const isFromAdmin = message.sender === groupInfo.admin || 
                     message.sender === `${groupInfo.admin}@s.whatsapp.net`;
    const lowerContent = message.content.toLowerCase();
    
    // Match any registration keyword
    const containsRegistrationKeyword = REGISTRATION_KEYWORDS.some(keyword => 
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Check for time slots pattern
    const containsTimeSlots = /\d+[h:]\d+|\d+h/.test(message.content);
    
    // Special case for admin messages with time patterns typical of registration opening
    const looksLikeRegistration = isFromAdmin && 
      containsTimeSlots && 
      (message.content.includes('15h00') || message.content.includes('15:00') || 
       message.content.includes('17h00') || message.content.includes('17:00'));
    
    if (isFromAdmin && (containsRegistrationKeyword || looksLikeRegistration)) {
      registrationStarted = true;
      registrationTimestamp = message.timestamp;
      result.registrationOpenMessage = message;
      console.log(`Found registration start message at ${new Date(message.timestamp * 1000).toLocaleString()}:`);
      console.log(`Content: "${message.content}"`);
      // Break after finding the most recent registration message
      break;
    }
  }
  
  // If forceRegistrationTimestamp is provided, use it instead
  if (forceRegistrationTimestamp) {
    registrationStarted = true;
    registrationTimestamp = forceRegistrationTimestamp;
    const forcedMessage = messages.find(m => m.timestamp >= forceRegistrationTimestamp);
    if (forcedMessage) {
      result.registrationOpenMessage = forcedMessage;
      console.log(`Using forced registration timestamp: ${new Date(forceRegistrationTimestamp * 1000).toLocaleString()}`);
    }
  }
  
  // If registration message found, now process all messages after that timestamp
  if (registrationStarted) {
    console.log('Registration started!'); // Explicit logging to confirm this block is executed
    console.log(`Registration timestamp: ${registrationTimestamp} (${new Date(registrationTimestamp * 1000).toLocaleString()})`);
    
    // Debug: Count messages after registration timestamp
    const messagesAfterRegistration = messages.filter(m => m.timestamp >= registrationTimestamp);
    console.log(`Found ${messagesAfterRegistration.length} messages after registration opened at ${new Date(registrationTimestamp * 1000).toLocaleString()}`);
    
    // Count non-admin messages after registration
    const userMessagesAfterRegistration = messagesAfterRegistration.filter(m => 
      m.sender !== groupInfo.admin && 
      m.sender !== `${groupInfo.admin}@s.whatsapp.net`);
    console.log(`Found ${userMessagesAfterRegistration.length} user messages (non-admin) after registration`);
    
    for (const message of messages) {
      // Skip messages before registration opened or from the admin (handle both phone formats)
      const isAdmin = message.sender === groupInfo.admin || 
                    message.sender === `${groupInfo.admin}@s.whatsapp.net`;
      
      if (message.timestamp < registrationTimestamp || isAdmin) {
        continue;
      }
      
      // Debug: examine just a few messages after registration
      if (message.timestamp > registrationTimestamp && message.timestamp < registrationTimestamp + 300) { // 5 minutes
        console.log(`Processing potential signup: ${new Date(message.timestamp * 1000).toLocaleString()} - ${message.content}`);
      }
      
      // Parse message for signup information using our modular parser
      if (message.timestamp > registrationTimestamp && message.timestamp < registrationTimestamp + 600) { // 10 minutes
        console.log(`Processing potential signup [${new Date(message.timestamp * 1000).toLocaleString()}]: ${message.content.substring(0, 60)}${message.content.length > 60 ? '...' : ''}`);
      }
      
      // Add detailed debug logging for specific messages with reaction markers
      if (message.content.includes('[') && message.content.includes(']') && 
          (message.content.toLowerCase().includes('in com') || message.content.toLowerCase().includes('eric'))) {
        console.log(`🔍 REACTION MARKER DETECTED in message from ${message.sender}: "${message.content}"`);  
      }
      
      // Specific debugging for +351 966 314 427's "In com Eric" message
      if (message.sender.includes('351966314427')) {
        console.log(`⭐️ FOUND MESSAGE FROM +351 966 314 427: "${message.content}"`);  
      }
      
      // Extra detailed logging for the phone number and specific message we're looking for
      if (message.sender.includes('351966314427') || 
          (message.content.toLowerCase().includes('in com') && 
           message.content.toLowerCase().includes('eric'))) {
        console.log('\n🔍🔍🔍 FOUND IMPORTANT MESSAGE:');
        console.log(`Time: ${new Date(message.timestamp * 1000).toLocaleString()}`);
        console.log(`Sender: ${message.sender}`);
        console.log(`Content: "${message.content}"`);
        
        // Try parsing it with our updated parser
        const ericResult = parseSignupMessage(message);
        console.log(`Parsed Result: ${JSON.stringify(ericResult, null, 2)}`);
        
        if (ericResult) {
          const hasEric = Array.isArray(ericResult) 
            ? ericResult.some(r => r.names.some(n => n.includes('Eric')))
            : ericResult.names.some(n => n.includes('Eric'));
          console.log(`Contains Eric: ${hasEric}`);
        }
        console.log('🔍🔍🔍 END OF IMPORTANT MESSAGE\n');
      }
      
      const parsedResult = parseSignupMessage(message);
      if (parsedResult) {
        // Handle both single result and array of results
        const signups = Array.isArray(parsedResult) ? parsedResult : [parsedResult];
        console.log(`✅ Successfully parsed signup from: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`);
        
        // Process each signup
        for (const signup of signups) {
          result.signups.push(signup);
          
          // Update player list based on signup status
          if (signup.status === 'IN') {
            // Add players to the list
            signup.names.forEach((name: string) => {
              if (!result.finalPlayerList.includes(name)) {
                result.finalPlayerList.push(name);
              }
            });
          } else if (signup.status === 'OUT') {
            // Remove players from the list
            signup.names.forEach((name: string) => {
              const index = result.finalPlayerList.indexOf(name);
              if (index !== -1) {
                result.finalPlayerList.splice(index, 1);
              }
            });
          }
        }
      }
    }
  }
  
  // Process team numbering after all signups are collected
  result.processedSignups = processSignupsWithTeams(result.signups);
  
  return result;
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
  
  // Summary by time slot
  const timeSlots: Record<string, string[]> = {};
  const unspecifiedTimeSlot: string[] = [];
  
  // Use processed signups with team numbers if available, otherwise fall back to original signups
  const signupsToUse = result.processedSignups || result.signups;
  
  signupsToUse.forEach(signup => {
    if (signup.status !== 'IN') return; // Skip OUT signups
    
    if (!signup.time) {
      // Use formatted names with team numbers if available
      const namesToAdd: string[] = 'formattedNames' in signup ? 
        (signup as SignupWithTeam).formattedNames : 
        signup.names;
        
      namesToAdd.forEach((name: string) => {
        if (!unspecifiedTimeSlot.includes(name)) {
          unspecifiedTimeSlot.push(name);
        }
      });
    } else {
      const timeKey = signup.time; // Store in a constant to avoid type errors
      if (!timeSlots[timeKey]) {
        timeSlots[timeKey] = [];
      }
      
      // Use formatted names with team numbers if available
      const namesToAdd: string[] = 'formattedNames' in signup ? 
        (signup as SignupWithTeam).formattedNames : 
        signup.names;
        
      namesToAdd.forEach((name: string) => {
        if (!timeSlots[timeKey].includes(name)) {
          timeSlots[timeKey].push(name);
        }
      });
    }
  });
  
  output += `## Players by Time Slot\n\n`;
  
  Object.keys(timeSlots).sort().forEach(time => {
    output += `### ${time} Time Slot (${timeSlots[time].length} players)\n\n`;
    
    // Sort the player list - this will group team members together by their team numbers
    const sortedPlayers = timeSlots[time].sort((a, b) => {
      // Extract team numbers if present
      const aMatch = a.match(/\((\d+)\)$/); 
      const bMatch = b.match(/\((\d+)\)$/);
      
      // If both have team numbers, sort by team number first
      if (aMatch && bMatch) {
        const aTeam = parseInt(aMatch[1]);
        const bTeam = parseInt(bMatch[1]);
        if (aTeam !== bTeam) return aTeam - bTeam;
      }
      
      // If only one has a team number, put teams first
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      
      // Otherwise sort alphabetically
      return a.localeCompare(b);
    });
    
    sortedPlayers.forEach((player, index) => {
      output += `${index + 1}. ${player}\n`;
    });
    
    output += `\n`;
  });
  
  if (unspecifiedTimeSlot.length > 0) {
    output += `### Unspecified Time Slot (${unspecifiedTimeSlot.length} players)\n\n`;
    
    // Sort unspecified time slot players the same way
    const sortedPlayers = unspecifiedTimeSlot.sort((a, b) => {
      // Extract team numbers if present
      const aMatch = a.match(/\((\d+)\)$/); 
      const bMatch = b.match(/\((\d+)\)$/);
      
      // If both have team numbers, sort by team number first
      if (aMatch && bMatch) {
        const aTeam = parseInt(aMatch[1]);
        const bTeam = parseInt(bMatch[1]);
        if (aTeam !== bTeam) return aTeam - bTeam;
      }
      
      // If only one has a team number, put teams first
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      
      // Otherwise sort alphabetically
      return a.localeCompare(b);
    });
    
    // Handle substitutes if we have maxTeams defined and more players than slots
    const availableSlots = groupInfo.maxTeams ? groupInfo.maxTeams * 2 : null;
    
    if (availableSlots && sortedPlayers.length > availableSlots) {
      // First display regular players (those within available slots)
      for (let i = 0; i < availableSlots; i++) {
        output += `${i + 1}. ${sortedPlayers[i]}\n`;
      }
      
      // Add a separator for substitutes
      output += `\nSuplentes:\n`;
      
      // Then display substitutes (continuing the numbering)
      for (let i = availableSlots; i < sortedPlayers.length; i++) {
        output += `${i + 1}. ${sortedPlayers[i]}\n`;
      }
    } else {
      // If there are not more players than slots, or maxTeams is not defined,
      // display all players normally
      sortedPlayers.forEach((player, index) => {
        output += `${index + 1}. ${player}\n`;
      });
    }
    
    output += `\n`;
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
      output += `- Status: ${signup.status}\n`;

      // Add detailed parsing debug information
      if ('isTeam' in signup) {
        output += `- Is team: ${signup.isTeam}\n`;
      }
      if ('timestamp' in signup) {
        output += `- Timestamp: ${new Date(signup.timestamp * 1000).toLocaleString()}\n`;
      }
      output += `\n`;
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
