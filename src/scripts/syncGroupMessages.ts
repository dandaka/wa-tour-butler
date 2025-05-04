import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  proto
} from 'baileys';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
type DB = ReturnType<typeof Database>;

// Target group name and expected JID (from group_messages.json)
const TARGET_GROUP_NAME = "Dom19h Saldanha P4ALL M4+";

// Number of messages to fetch and store
const MESSAGE_LIMIT = 100;

// Store path for session data
const SESSION_DIR = path.join(process.cwd(), 'session');

// SQLite database path
const DB_PATH = path.join(process.cwd(), 'group_messages.db');

// Initialize SQLite database
function initializeDatabase() {
  const db = new Database(DB_PATH);
  
  // Create messages table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      remoteJid TEXT NOT NULL,
      fromMe BOOLEAN NOT NULL,
      participant TEXT,
      pushName TEXT,
      timestamp INTEGER NOT NULL,
      content TEXT,
      messageType TEXT,
      quotedMessageId TEXT,
      raw TEXT
    )
  `);
  
  // Create participants table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      jid TEXT PRIMARY KEY,
      name TEXT,
      lastSeen INTEGER
    )
  `);
  
  // Create groups table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      participantCount INTEGER,
      lastUpdated INTEGER
    )
  `);
  
  console.log(`Database initialized at ${DB_PATH}`);
  return db;
}

/**
 * Format a phone number or ID to a clean format
 */
function formatPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/[^0-9]/g, '');
}

/**
 * Get the message content as text
 */
function extractMessageContent(message: proto.IMessage | null | undefined): string {
  if (!message) return '';
  
  if (message.conversation) {
    return message.conversation;
  } else if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  } else if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  } else if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  } else if (message.documentMessage?.fileName) {
    return `[Document: ${message.documentMessage.fileName}]`;
  } else if (message.audioMessage) {
    return '[Audio]';
  } else if (message.stickerMessage) {
    return '[Sticker]';
  } else if (message.contactMessage) {
    return '[Contact]';
  } else if (message.locationMessage) {
    return '[Location]';
  } else {
    return JSON.stringify(message);
  }
}

/**
 * Determine the message type
 */
function getMessageType(message: proto.IMessage | null | undefined): string {
  if (!message) return 'unknown';
  
  if (message.conversation) {
    return 'text';
  } else if (message.extendedTextMessage) {
    return 'text';
  } else if (message.imageMessage) {
    return 'image';
  } else if (message.videoMessage) {
    return 'video';
  } else if (message.audioMessage) {
    return 'audio';
  } else if (message.documentMessage) {
    return 'document';
  } else if (message.stickerMessage) {
    return 'sticker';
  } else if (message.contactMessage) {
    return 'contact';
  } else if (message.locationMessage) {
    return 'location';
  } else {
    return 'other';
  }
}

/**
 * Get quoted message ID if present
 */
function getQuotedMessageId(message: proto.IMessage | null | undefined): string | null {
  if (!message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    return null;
  }
  
  return message.extendedTextMessage.contextInfo.stanzaId || null;
}

/**
 * Store a message in the database
 */
function storeMessage(db: DB, msg: proto.IWebMessageInfo): void {
  try {
    // Extract and ensure all values are SQLite-compatible types
    const messageId = (msg.key?.id || '').toString();
    const remoteJid = (msg.key?.remoteJid || '').toString();
    const fromMe = msg.key?.fromMe ? 1 : 0;
    const participant = msg.key?.participant ? msg.key.participant.toString() : null;
    const pushName = msg.pushName ? msg.pushName.toString() : null;
    
    // Ensure timestamp is a number
    let timestamp = 0;
    if (typeof msg.messageTimestamp === 'number') {
      timestamp = msg.messageTimestamp;
    } else if (msg.messageTimestamp) {
      timestamp = parseInt(msg.messageTimestamp.toString(), 10) || 0;
    }
    
    // Get message content safely
    const content = extractMessageContent(msg.message);
    const messageType = getMessageType(msg.message);
    const quotedMessageId = getQuotedMessageId(msg.message);
    
    // Convert the whole message to JSON for backup
    // Handle circular references in message object
    const raw = JSON.stringify(msg, (key, value) => {
      // Handle BigInt values which can't be serialized to JSON
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
    
    console.log(`Storing message: ${messageId} (${messageType}) from ${participant || 'me'}`);

    
    // Prepare statement for insertion or update
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO messages
      (id, remoteJid, fromMe, participant, pushName, timestamp, content, messageType, quotedMessageId, raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Execute the statement
    insertStmt.run(
      messageId,
      remoteJid,
      fromMe,
      participant,
      pushName,
      timestamp,
      content,
      messageType,
      quotedMessageId,
      raw
    );
    
    // If the message has a participant, update the participants table
    if (participant) {
      const insertParticipant = db.prepare(`
        INSERT OR IGNORE INTO participants (jid, lastSeen)
        VALUES (?, ?)
      `);
      
      insertParticipant.run(participant, timestamp);
    }
  } catch (error) {
    console.error('Error storing message:', error);
    // More detailed error information
    if (error instanceof Error) {
      console.error(`Error type: ${error.name}, Message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    }
  }
}

/**
 * Store group information in the database
 */
function storeGroupInfo(db: DB, jid: string, name: string, description: string | null, participantCount: number): void {
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO groups
      (jid, name, description, participantCount, lastUpdated)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    insertStmt.run(
      jid,
      name,
      description,
      participantCount,
      Math.floor(Date.now() / 1000)
    );
  } catch (error) {
    console.error('Error storing group info:', error);
  }
}

/**
 * Get the most recent message timestamp in the database for a group
 */
function getLastMessageTimestamp(db: DB, jid: string): number {
  try {
    const row = db.prepare('SELECT MAX(timestamp) as timestamp FROM messages WHERE remoteJid = ?').get(jid) as { timestamp: number | null };
    return row?.timestamp || 0;
  } catch (error) {
    console.error('Error getting last message timestamp:', error);
    return 0;
  }
}

/**
 * Check if session credentials exist
 */
function checkSessionExists(): boolean {
  if (!fs.existsSync(SESSION_DIR)) {
    return false;
  }
  
  const files = fs.readdirSync(SESSION_DIR);
  return files.length > 0;
}

/**
 * Main function for syncing group messages with the database
 */
async function syncGroupMessages() {
  console.log(`Starting WhatsApp sync for group "${TARGET_GROUP_NAME}"...`);
  
  // Initialize the database
  const db = initializeDatabase();
  
  // Check if session exists
  if (!checkSessionExists()) {
    console.log('\n\x1b[31m==================================\x1b[0m');
    console.log('\x1b[31mERROR: No WhatsApp session found\x1b[0m');
    console.log('\x1b[31mPlease run the login script first:\x1b[0m');
    console.log('\x1b[36mpnpm run whatsapp-login\x1b[0m');
    console.log('\x1b[31m==================================\x1b[0m\n');
    process.exit(1);
  }

  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  // Create WhatsApp socket connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Chrome', 'Desktop', '22.04.4']
  });
  
  // Save credentials when they're updated
  sock.ev.on('creds.update', saveCreds);
  
  // Variable to track the target group
  let targetGroupJid: string | null = null;
  let messagesAdded = 0;
  
  // Handle messaging history
  sock.ev.on('messaging-history.set', ({
    chats,
    contacts,
    messages,
    syncType
  }) => {
    console.log(`Received messaging history - syncType: ${syncType}`);
    console.log(`Received ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
    
    // Find target group in chats
    const targetGroup = chats.find(chat => 
      chat.name === TARGET_GROUP_NAME && chat.id.endsWith('@g.us')
    );
    
    if (targetGroup) {
      targetGroupJid = targetGroup.id;
      console.log(`Found target group: ${TARGET_GROUP_NAME} with JID: ${targetGroupJid}`);
      
      // Store group info
      try {
        storeGroupInfo(
          db, 
          targetGroupJid, 
          targetGroup.name || TARGET_GROUP_NAME, 
          targetGroup.description || null,
          targetGroup.participant?.length || 0
        );
      } catch (error) {
        console.error('Error storing group info:', error);
      }
      
      // Get last message timestamp from the database
      const lastTimestamp = getLastMessageTimestamp(db, targetGroupJid);
      console.log(`Last message timestamp in database for group: ${lastTimestamp}`);
      
      // Filter messages for target group and newer than what we have
      const targetMessages = messages.filter(msg => 
        msg.key.remoteJid === targetGroupJid && 
        (msg.messageTimestamp as number) > lastTimestamp
      );
      
      console.log(`Found ${targetMessages.length} new messages for target group`);
      
      // Store messages with better error handling
      let successCount = 0;
      for (const msg of targetMessages) {
        try {
          storeMessage(db, msg);
          successCount++;
          messagesAdded++;
        } catch (error) {
          console.error('Failed to store message:', error);
        }
      }
      console.log(`Successfully stored ${successCount} out of ${targetMessages.length} messages`);
    } else {
      console.log(`Target group not found in history: "${TARGET_GROUP_NAME}"`);
      
      // Debug information about available groups
      if (chats.length > 0) {
        console.log('Available groups in history:');
        chats.filter(chat => chat.id.endsWith('@g.us')).forEach(chat => {
          console.log(`- ${chat.name} (${chat.id})`);
        });
      }
    }
  });
  
  // Process new messages as they come in
  sock.ev.on('messages.upsert', ({ messages }) => {
    if (!targetGroupJid) return;
    
    for (const msg of messages) {
      if (msg.key.remoteJid === targetGroupJid) {
        console.log(`New message in target group: ${extractMessageContent(msg.message)}`);
        storeMessage(db, msg);
        messagesAdded++;
      }
    }
  });
  
  // Handle connection events
  sock.ev.on('connection.update', async (update) => {
    console.log('Connection update:', JSON.stringify(update, null, 2));
    
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('Connected to WhatsApp!');
      
      console.log('Fetching group details...');
      try {
        // Fetch all groups
        const groups = await sock.groupFetchAllParticipating();
        console.log(`Found ${Object.keys(groups).length} groups`);
        
        // Find target group
        const group = Object.entries(groups).find(([jid, info]) => 
          info.subject === TARGET_GROUP_NAME
        );
        
        if (group) {
          const [jid, info] = group;
          targetGroupJid = jid;
          
          console.log(`Found target group: ${info.subject} (${targetGroupJid})`);
          console.log(`Participants: ${info.participants.length}`);
          
          // Store group info
          storeGroupInfo(
            db, 
            targetGroupJid, 
            info.subject, 
            info.desc || null,
            info.participants.length
          );
          
          // Wait for history to be received and messages to be processed
          console.log('Waiting 10 seconds to collect messages...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // If no messages were collected, we'll just use the current information
          if (messagesAdded === 0) {
            console.log('No new messages found since last sync');
            
            // Get last message timestamp
            const lastTimestamp = getLastMessageTimestamp(db, targetGroupJid);
            if (lastTimestamp > 0) {
              const lastDate = new Date(lastTimestamp * 1000);
              console.log(`Last message in database from: ${lastDate.toLocaleString()}`);
            } else {
              console.log('No previous messages found in the database');
            }
            
            // Wait a bit longer to see if any late history events arrive
            console.log('Waiting 5 more seconds for any delayed history events...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          // Print summary of sync
          try {
            const result = db.prepare(
              'SELECT COUNT(*) as count FROM messages WHERE remoteJid = ?'
            ).get(targetGroupJid) as { count: number };
            const messageCount = result?.count || 0;
            
            console.log(`\nSync complete!`);
            console.log(`Total messages in database for "${TARGET_GROUP_NAME}": ${messageCount}`);
            console.log(`Messages added in this sync: ${messagesAdded}`);
            
            // Clean exit without logout to maintain the session
            process.exit(0);
          } catch (error) {
            console.error('Error checking message count:', error);
            process.exit(1);
          }
        } else {
          console.log(`Target group "${TARGET_GROUP_NAME}" not found. Available groups:`);
          for (const [jid, info] of Object.entries(groups)) {
            console.log(`- ${info.subject}`);
          }
          
          console.log('\n\x1b[31mERROR: Target group not found\x1b[0m');
          process.exit(1);
        }
      } catch (error) {
        console.error('Error fetching groups:', error);
        process.exit(1);
      }
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('\n\x1b[31m==================================\x1b[0m');
        console.log('\x1b[31mERROR: Logged out from WhatsApp\x1b[0m');
        console.log('\x1b[31mPlease run the login script first:\x1b[0m');
        console.log('\x1b[36mpnpm run whatsapp-login\x1b[0m');
        console.log('\x1b[31m==================================\x1b[0m\n');
        process.exit(1);
      } else if (statusCode === 515) {
        console.log('\n\x1b[31m==================================\x1b[0m');
        console.log('\x1b[31mERROR: Connection closed with status: 515\x1b[0m');
        console.log('\x1b[31mYour session may have expired.\x1b[0m');
        console.log('\x1b[31mPlease run the login script again:\x1b[0m');
        console.log('\x1b[36mpnpm run whatsapp-login\x1b[0m');
        console.log('\x1b[31m==================================\x1b[0m\n');
        process.exit(1);
      } else {
        console.log(`Connection closed with status: ${statusCode}`);
        process.exit(1);
      }
    }
  });
}

// Start the script
syncGroupMessages().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
