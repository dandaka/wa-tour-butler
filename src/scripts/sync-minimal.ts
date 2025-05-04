import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  proto
} from 'baileys';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Simple in-memory cache implementation
class SimpleCache {
  private cache: Record<string, any> = {};
  
  get(key: string) {
    return this.cache[key];
  }
  
  set(key: string, value: any) {
    this.cache[key] = value;
    return value;
  }
  
  del(key: string) {
    delete this.cache[key];
  }
  
  flushAll() {
    this.cache = {};
  }
}
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
  
  // Create WhatsApp socket connection with a randomized browser identifier
  // This helps make each sync attempt appear as a new session to WhatsApp
  const browserRandomizer = Math.floor(Math.random() * 1000);
  // Create a simple cache for message retry counter
  const msgRetryCache = new SimpleCache();
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Chrome', `Desktop-${browserRandomizer}`, '22.04.4'],
    msgRetryCounterCache: msgRetryCache, // Proper cache implementation
    generateHighQualityLinkPreview: true,
  });
  
  // Track key variables
  let targetGroupJid: string | null = null;
  let messagesAdded = 0;
  let connected = false;
  let exitTimeout: NodeJS.Timeout;
  
  // Set timeout for the entire script to exit after 60 seconds (to allow for full sync)
  exitTimeout = setTimeout(() => {
    console.log('\nExiting after timeout...');
    // Clean up session files to make next sync attempt appear as a new session
    try {
      console.log('Regenerating session token for next sync...');
      // We're only modifying one file to maintain login but make it appear as a new session
      const creds = path.join(SESSION_DIR, 'creds.json');
      if (fs.existsSync(creds)) {
        const credsData = JSON.parse(fs.readFileSync(creds, 'utf8'));
        // Modify a non-critical value to make the session appear different
        credsData.me = { ...credsData.me, platform: Math.random().toString(36).substring(2, 7) };
        fs.writeFileSync(creds, JSON.stringify(credsData, null, 2));
        console.log('Session token updated for next sync');
      }
    } catch (err) {
      console.error('Error updating session token:', err);
    }
    process.exit(0);
  }, 60000);
  
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
        console.log(`SUCCESS! Added ${newMessages} message(s) from history sync`);
        
        // Reset the timeout to exit soon after success
        clearTimeout(exitTimeout);
        exitTimeout = setTimeout(() => {
          console.log('\nSuccessfully synced messages. Exiting...');
          process.exit(0);
        }, 5000);
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
          participant: lastMessage.participant || undefined // Convert null to undefined
        };
        
        console.log(`\n====== IMPORTANT INSTRUCTIONS ======`);
        console.log(`1. Make sure your phone has WhatsApp OPEN`);
        console.log(`2. First CLOSE WhatsApp completely`);
        console.log(`3. Then OPEN WhatsApp and wait 2-3 seconds`);
        console.log(`4. Then MINIMIZE WhatsApp (don't close it)`);
        console.log(`5. Finally, scroll through recent messages`);
        console.log(`6. Repeat steps 3-5 if notification says 'syncing stopped'`);
        console.log(`==========================================\n`);
        
        // First, subscribe to presence updates for the group
        console.log('Subscribing to group presence updates...');
        try {
          if (targetGroupJid) { // Ensure targetGroupJid is not null
            // More aggressive presence updates to simulate a real user
            await sock.presenceSubscribe(targetGroupJid);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Simulate typing to appear more human-like
            console.log('Simulating user activity...');
            await sock.sendPresenceUpdate('composing', targetGroupJid);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Send presence update to appear active in the group
            await sock.sendPresenceUpdate('available', targetGroupJid);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try different approaches to encourage sync
            console.log('Requesting update of chat state...');
            try {
              // Try to mark chat as read which might trigger sync
              const lastMessages = db.prepare(`SELECT * FROM messages WHERE remoteJid = ? ORDER BY timestamp DESC LIMIT 1`).get(targetGroupJid) as any;
              if (lastMessages?.id) {
                await sock.readMessages([{remoteJid: targetGroupJid, id: lastMessages.id, participant: lastMessages.participant || undefined}]);
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (modifyError) {
              console.log('Chat update not supported, continuing...');
            }
          }
        } catch (presenceError) {
          console.error('Error with presence update:', presenceError);
        }
        
        // Using the technique from example.ts - mark message as read to trigger notification
        console.log('Sending read receipt to trigger message sync...');
        await sock.readMessages([messageKey]);
        
        // Try a second read receipt after a short delay (helps with sync)
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Sending second read receipt...');
        await sock.readMessages([messageKey]);
        
        // Try to fetch message history with retry logic
        let historySuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            if (typeof sock.fetchMessageHistory === 'function') {
              console.log(`Requesting message history (attempt ${attempt}/3)...`);
              const historyRequestId = await sock.fetchMessageHistory(
                50,
                messageKey,
                lastMessage.timestamp || Math.floor(Date.now() / 1000) // Provide current timestamp as fallback
              );
              console.log(`History request initiated with ID: ${historyRequestId}`);
              historySuccess = true;
              break;
            } else {
              console.log('fetchMessageHistory not available in this Baileys version');
              break;
            }
          } catch (historyError) {
            console.error(`Error in history request attempt ${attempt}:`, historyError);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } else {
        console.log('No reference message found in database');
      }
      
      console.log('\nWaiting for messages to sync...');
      console.log('If you see a "syncing has stopped" notification:');
      console.log('1. Immediately OPEN WhatsApp on your iOS device'); 
      console.log('2. Keep it open and watch for messages to appear');
      console.log('\nKEY INSTRUCTIONS:');
      console.log('* When you see "syncing with", KEEP THE SCRIPT RUNNING');
      console.log('* After "syncing stopped", wait for messages to appear in WhatsApp');
      console.log('* This script will keep running for 60 seconds to allow sync to complete');
      console.log('\nScript progress will be shown every 10 seconds:');
      
      // Setup progress updates to help user understand what's happening
      let progressCounter = 0;
      const progressInterval = setInterval(() => {
        progressCounter += 10;
        console.log(`Still waiting for sync... (${progressCounter} seconds elapsed)`);
      }, 10000);
      
      // Clear the interval when the script exits
      setTimeout(() => clearInterval(progressInterval), 59000);
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
