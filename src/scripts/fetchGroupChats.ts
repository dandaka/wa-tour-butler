import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WAMessageKey,
  proto
} from 'baileys';
import path from 'path';
import fs from 'fs';

// Number of messages to fetch from each group
const MESSAGE_LIMIT = 10;

// Store path for session data
const SESSION_DIR = path.join(process.cwd(), 'session');

// Path for message store
const STORE_PATH = path.join(process.cwd(), 'group_messages.json');

/**
 * Format a phone number or ID
 */
function formatPhoneNumber(phoneNumber: string): string {
  // Remove non-numeric characters and the "@s.whatsapp.net" suffix if present
  return phoneNumber.replace(/\D/g, '').replace('@s.whatsapp.net', '');
}

/**
 * Get the sender's name/number
 */
function getSenderID(key: WAMessageKey): string {
  if (key.participant) {
    return formatPhoneNumber(key.participant);
  }
  if (key.remoteJid) {
    return formatPhoneNumber(key.remoteJid);
  }
  return 'Unknown';
}

/**
 * Format a timestamp to a readable date string
 */
function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return 'Unknown time';
  
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Extract text content from a message
 */
function extractMessageContent(message: proto.IMessage | null | undefined): string {
  if (!message) return '[Empty message]';
  
  if (message.conversation) {
    return message.conversation;
  } else if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  } else if (message.imageMessage) {
    return message.imageMessage.caption || '[Image]';
  } else if (message.videoMessage) {
    return message.videoMessage.caption || '[Video]';
  } else if (message.audioMessage) {
    return '[Audio]';
  } else if (message.documentMessage) {
    return `[Document: ${message.documentMessage.fileName || 'unknown'}]`;
  } else if (message.stickerMessage) {
    return '[Sticker]';
  } else if (message.contactMessage) {
    return '[Contact]';
  } else if (message.locationMessage) {
    return '[Location]';
  } else {
    return '[Unsupported message type]';
  }
}

/**
 * Format a complete message for display
 */
function formatMessage(msg: proto.IWebMessageInfo): string {
  const sender = getSenderID(msg.key);
  const timestamp = formatTimestamp(msg.messageTimestamp as number);
  const content = extractMessageContent(msg.message);
  
  return `[${timestamp}] ${sender}: ${content}`;
}

/**
 * Main function to fetch and print group chats
 */
async function fetchGroupChats() {
  console.log('Starting WhatsApp connection to fetch group messages...');
  
  // Check if session exists
  if (!fs.existsSync(SESSION_DIR)) {
    console.error('No WhatsApp session found. Please run the main app first to log in.');
    process.exit(1);
  }

  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  // Create WhatsApp socket connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });
  
  // Save credentials when they're updated
  sock.ev.on('creds.update', saveCreds);
  
  // Create an object to store the last messages from groups
  const groupMessages: Record<string, proto.IWebMessageInfo[]> = {};
  let historyReceived = false;
  let groupsFound = false;
  
  // Receive message history from Baileys
  sock.ev.on('messaging-history.set', ({
    chats,
    contacts,
    messages,
    syncType
  }) => {
    console.log(`Received messaging history - syncType: ${syncType}`);
    console.log(`Received ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
    
    historyReceived = true;
    
    // Process and categorize messages by their group jid
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      
      if (jid && jid.endsWith('@g.us')) {
        if (!groupMessages[jid]) {
          groupMessages[jid] = [];
        }
        
        // Add message to the group collection
        groupMessages[jid].push(msg);
        
        // Keep only the last MESSAGE_LIMIT messages for each group
        if (groupMessages[jid].length > MESSAGE_LIMIT) {
          groupMessages[jid] = groupMessages[jid].slice(-MESSAGE_LIMIT);
        }
      }
    }
    
    console.log(`Populated message history for ${Object.keys(groupMessages).length} groups`);
  });
  
  // Listen for new incoming messages as well
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      
      // Only process group messages
      if (jid && jid.endsWith('@g.us')) {
        if (!groupMessages[jid]) {
          groupMessages[jid] = [];
        }
        
        // Add message to the collection
        groupMessages[jid].push(msg);
        
        // Keep only the last MESSAGE_LIMIT messages
        if (groupMessages[jid].length > MESSAGE_LIMIT) {
          groupMessages[jid] = groupMessages[jid].slice(-MESSAGE_LIMIT);
        }
        
        console.log(`New message received in group ${jid}:`, extractMessageContent(msg.message));
      }
    }
  });
  
  // Handle connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('Connected to WhatsApp! Waiting for group messages...');
      console.log('This will fetch groups and their most recent messages...');
      
      try {
        // Fetch all participating groups
        const groups = await sock.groupFetchAllParticipating();
        console.log(`Found ${Object.keys(groups).length} groups.`);
        
        if (Object.keys(groups).length === 0) {
          console.log('No groups found. Exiting...');
          await sock.logout();
          process.exit(0);
        }
        
        groupsFound = true;
        
        // Wait for history to be received via messaging-history.set event
        console.log('Waiting for message history to be received from WhatsApp...');
        
        // Wait up to 10 seconds for history to be received
        const startTime = Date.now();
        const maxWaitTime = 10000; // 10 seconds
        
        while (!historyReceived && Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('Still waiting for message history...');
        }
        
        if (!historyReceived) {
          console.log('No message history received within timeout period.');
        }
        
        // Wait a moment to collect any additional live messages
        console.log('Waiting 3 seconds to collect additional live messages...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Create an object to hold formatted group data for saving
        const formattedGroupData: Record<string, any> = {};
        
        // Print group information and messages
        for (const [id, group] of Object.entries(groups)) {
          console.log(`\n==== Group: ${group.subject} ====`);
          console.log(`Participants: ${group.participants.length}`);
          
          // Get messages for this group
          const messages = groupMessages[id] || [];
          
          // Prepare group data for saving
          formattedGroupData[id] = {
            name: group.subject,
            participantCount: group.participants.length,
            messages: []
          };
          
          if (messages.length === 0) {
            console.log('No recent messages found.');
          } else {
            console.log(`Last ${messages.length} messages:`);
            
            // Sort messages by timestamp
            const sortedMessages = [...messages].sort((a, b) => {
              return (a.messageTimestamp as number) - (b.messageTimestamp as number);
            });
            
            // Print each message and add to formatted data
            for (const msg of sortedMessages) {
              const formattedMsg = formatMessage(msg);
              console.log(formattedMsg);
              
              // Add simple version of message to the formatted data
              formattedGroupData[id].messages.push({
                sender: getSenderID(msg.key),
                timestamp: msg.messageTimestamp,
                content: extractMessageContent(msg.message)
              });
            }
          }
        }
        
        // Save formatted group data to file
        if (Object.keys(formattedGroupData).length > 0) {
          fs.writeFileSync(
            STORE_PATH, 
            JSON.stringify(formattedGroupData, null, 2)
          );
          console.log(`\nSaved group data to ${STORE_PATH}`);
        } else {
          console.log('\nNo group data to save');
          
          // Create an empty but valid JSON file
          fs.writeFileSync(STORE_PATH, JSON.stringify({}, null, 2));
        }
        console.log(`\nSaved message data to ${STORE_PATH}`);
        
        // Log out and exit
        console.log('Fetching complete. Closing connection...');
        await sock.logout();
        process.exit(0);
      } catch (error) {
        console.error('Error fetching groups:', error);
        process.exit(1);
      }
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('Logged out from WhatsApp');
      } else {
        console.log(`Connection closed with status: ${statusCode}`);
      }
      
      process.exit(0);
    }
  });
}

// Start the script
fetchGroupChats();
