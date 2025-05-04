import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  proto
} from 'baileys';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
// Define helper functions directly in this file instead of importing

// Store path for session data
const SESSION_DIR = path.join(process.cwd(), 'session');

// SQLite database path
const DB_PATH = path.join(process.cwd(), 'group_messages.db');

// Target group name
const TARGET_GROUP_NAME = "Dom19h Saldanha P4ALL M4+";

/**
 * Minimal sync script focusing on proper notification triggering
 */
async function minimalSync() {
  console.log(`Starting minimal WhatsApp sync for group "${TARGET_GROUP_NAME}"...`);
  
  // Initialize database connection
  const db = new Database(DB_PATH);
  console.log(`Database initialized at ${DB_PATH}`);
  
  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  // Create WhatsApp socket connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });
  
  // Track key variables
  let targetGroupJid: string | null = null;
  let messagesAdded = 0;
  let connected = false;
  let exitTimeout: NodeJS.Timeout;
  
  // Set timeout for the entire script to exit after 15 seconds
  exitTimeout = setTimeout(() => {
    console.log('\\nExiting after timeout...');
    process.exit(0);
  }, 15000);
  
  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);
  
  // Process connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    console.log('Connection update:', update);
    
    if (connection === 'open') {
      connected = true;
      console.log('Connected to WhatsApp!');
      fetchGroupsAndInitiateSync();
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('Connection closed. You have been logged out.');
      }
      
      // Exit cleanly
      clearTimeout(exitTimeout);
      process.exit(0);
    }
  });
  
  // Helper function to extract message content
  function extractMessageContent(message: proto.IMessage | null | undefined): string {
    if (!message) return '';
    
    // Check various message types
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    if (message.documentMessage?.fileName) return `[Document: ${message.documentMessage.fileName}]`;
    if (message.imageMessage) return '[Image]';
    if (message.videoMessage) return '[Video]';
    if (message.audioMessage) return '[Audio]';
    if (message.stickerMessage) return '[Sticker]';
    if (message.contactMessage) return '[Contact]';
    if (message.locationMessage) return '[Location]';
    if (message.contactsArrayMessage) return '[Contacts]';
    if (message.reactionMessage) return `[Reaction: ${message.reactionMessage.text || ''}]`;
    if (message.protocolMessage) return '[System Message]';
    
    return JSON.stringify(message);
  }
  
  // Helper function to determine message type
  function getMessageType(message: proto.IMessage | null | undefined): string {
    if (!message) return 'unknown';
    
    if (message.conversation) return 'text';
    if (message.extendedTextMessage) return 'text';
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    if (message.stickerMessage) return 'sticker';
    if (message.contactMessage) return 'contact';
    if (message.locationMessage) return 'location';
    if (message.contactsArrayMessage) return 'contacts';
    if (message.reactionMessage) return 'reaction';
    if (message.protocolMessage) return 'system';
    
    return 'unknown';
  }
  
  // Helper function to get quoted message ID
  function getQuotedMessageId(message: proto.IMessage | null | undefined): string | null {
    if (!message) return null;
    
    const quotedInfo = message.extendedTextMessage?.contextInfo || 
                       message.imageMessage?.contextInfo || 
                       message.videoMessage?.contextInfo || 
                       message.audioMessage?.contextInfo || 
                       message.documentMessage?.contextInfo ||
                       message.stickerMessage?.contextInfo;
    
    return quotedInfo?.stanzaId || null;
  }
  
  // Store message in database
  function storeMessage(msg: proto.IWebMessageInfo) {
    try {
      const id = msg.key.id || '';
      const remoteJid = msg.key.remoteJid || '';
      const fromMe = msg.key.fromMe ? 1 : 0;
      const participant = msg.key.participant || null;
      const pushName = msg.pushName || null;
      const timestamp = msg.messageTimestamp as number;
      const content = extractMessageContent(msg.message);
      const messageType = getMessageType(msg.message);
      const quotedMessageId = getQuotedMessageId(msg.message);
      const raw = JSON.stringify(msg);
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO messages 
        (id, remoteJid, fromMe, participant, pushName, timestamp, content, messageType, quotedMessageId, raw) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
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
      
      messagesAdded++;
      console.log(`Stored message: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
      
      return true;
    } catch (error) {
      console.error('Failed to store message:', error);
      return false;
    }
  }
  
  // Process history sync events
  sock.ev.on('messaging-history.set', (data) => {
    const { messages, syncType } = data;
    
    if (messages && messages.length > 0) {
      console.log(`Received ${messages.length} message(s) from history sync, type: ${syncType}`);
      
      let newMessages = 0;
      for (const msg of messages) {
        if (msg.key?.remoteJid === targetGroupJid) {
          if (storeMessage(msg)) {
            newMessages++;
          }
        }
      }
      
      if (newMessages > 0) {
        console.log(`Added ${newMessages} message(s) from history sync`);
      }
    }
  });
  
  // Handle new incoming messages
  sock.ev.on('messages.upsert', ({ messages }) => {
    if (!targetGroupJid) return;
    
    for (const msg of messages) {
      if (msg.key.remoteJid === targetGroupJid) {
        console.log(`New message received: ${extractMessageContent(msg.message)}`);
        storeMessage(msg);
      }
    }
  });
  
  // Find groups and initiate sync
  async function fetchGroupsAndInitiateSync() {
    try {
      console.log('Fetching WhatsApp groups...');
      const groups = await sock.groupFetchAllParticipating();
      console.log(`Found ${Object.keys(groups).length} groups`);
      
      // Find target group
      const group = Object.entries(groups).find(([_, info]) => info.subject === TARGET_GROUP_NAME);
      
      if (group) {
        const [jid, info] = group;
        targetGroupJid = jid;
        
        console.log(`Found target group: ${info.subject} (${targetGroupJid})`);
        console.log(`Participants: ${info.participants.length}`);
        
        // Store group info
        await storeGroupInfo(targetGroupJid, info.subject, info.desc || null, info.participants.length);
        
        // Get last message from database
        triggerMessageSync();
      } else {
        console.log(`Target group "${TARGET_GROUP_NAME}" not found`);
        clearTimeout(exitTimeout);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
      clearTimeout(exitTimeout);
      process.exit(1);
    }
  }
  
  // Store group info in database
  async function storeGroupInfo(jid: string, name: string, description: string | null, participantCount: number) {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO groups (jid, name, description, participantCount, lastUpdated) 
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        jid,
        name,
        description,
        participantCount,
        Math.floor(Date.now() / 1000)
      );
      
      console.log(`Stored group info for ${name} (${jid})`);
    } catch (error) {
      console.error('Failed to store group info:', error);
    }
  }
  
  // Trigger message sync using techniques from the example.ts
  async function triggerMessageSync() {
    try {
      console.log('Looking for reference message to trigger sync...');
      
      const lastMessage = db.prepare(`
        SELECT * FROM messages 
        WHERE remoteJid = ? 
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(targetGroupJid) as any;
      
      if (lastMessage && lastMessage.id) {
        console.log(`Found reference message from ${new Date(lastMessage.timestamp * 1000).toISOString()}`);
        
        // Create proper message key format
        const messageKey = {
          remoteJid: targetGroupJid,
          id: lastMessage.id,
          fromMe: lastMessage.fromMe === 1,
          participant: lastMessage.participant
        };
        
        console.log(`\n====== IMPORTANT: CHECK YOUR PHONE NOW ======`);
        console.log(`1. Make sure your phone is unlocked`);
        console.log(`2. IMPORTANT: Minimize WhatsApp, then open it again`);
        console.log(`3. Scroll through recent messages in the chat`);
        console.log(`==========================================\n`);
        
        // Using the technique from example.ts - mark message as read to trigger notification
        console.log('Sending read receipt to trigger message sync...');
        await sock.readMessages([messageKey]);
        
        // If available, try to fetch message history directly
        try {
          if (typeof sock.fetchMessageHistory === 'function') {
            console.log('Requesting message history...');
            const historyRequestId = await sock.fetchMessageHistory(
              50,
              messageKey,
              lastMessage.timestamp
            );
            console.log(`History request initiated with ID: ${historyRequestId}`);
          } else {
            console.log('fetchMessageHistory not available in this Baileys version');
          }
        } catch (historyError) {
          console.error('Error requesting history:', historyError);
        }
      } else {
        console.log('No reference message found in database');
      }
      
      console.log('\nWaiting briefly for messages to sync...');
      console.log('Script will exit automatically in a few seconds');
    } catch (error) {
      console.error('Error triggering message sync:', error);
    }
  }
}

// Start the minimal sync process
minimalSync().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
