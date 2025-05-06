import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto
} from 'baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import Database from 'better-sqlite3';

// Set up logger
const logger = P({ level: 'silent' }); // Change to 'info' for more debug info

// Database setup
const db = new Database('./data/whatsapp_messages.db');

// Create messages table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender TEXT,
    timestamp INTEGER,
    message_type TEXT,
    content TEXT,
    is_from_me BOOLEAN,
    raw_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create contacts table for storing contact and group information
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    name TEXT,
    notify TEXT,
    short_name TEXT,
    push_name TEXT,
    is_group BOOLEAN,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create a prepared statement for inserting messages
const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages (
    id, chat_id, sender, timestamp, message_type, content, is_from_me, raw_data
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Create a prepared statement for inserting or updating contacts
const upsertContact = db.prepare(`
  INSERT INTO contacts (jid, name, notify, short_name, push_name, is_group, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(jid) DO UPDATE SET
    name = COALESCE(excluded.name, name),
    notify = COALESCE(excluded.notify, notify),
    short_name = COALESCE(excluded.short_name, short_name),
    push_name = COALESCE(excluded.push_name, push_name),
    is_group = COALESCE(excluded.is_group, is_group),
    updated_at = CURRENT_TIMESTAMP
`);

async function startMessageStorage() {
  console.log('Starting WhatsApp message storage service...');

  // Use the auth state - using the same directory as whatsappLogin.ts
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  
  // Fetch latest version
  const { version } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join('.')}`);

  // Create a socket connection
  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: jid => false,
    getMessage: async (key) => {
      return {}; // can be used to retrieve messages from a store
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Process events
  sock.ev.process(async(events) => {
    // Log event types for debugging
    console.log('\nReceived events of types:', Object.keys(events));
    
    // Handle connection updates
    if(events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect, qr } = update;
      
      // Log connection state changes
      if(connection) {
        console.log('Connection update:', update);
      }
      
      // Handle connection close
      if(connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        
        if(statusCode === DisconnectReason.loggedOut) {
          console.log('Connection closed: logged out');
          // If logged out, need to re-authenticate
          process.exit();
        } else {
          console.log('Connection closed, reconnecting...');
          // Reconnect if not logged out
          startMessageStorage();
        }
      }
      
      // When successfully connected
      if(connection === 'open') {
        console.log('Connected to WhatsApp! Ready to receive messages.');
      }
    }
    
    // Process contact updates (including groups)
    if(events['contacts.update']) {
      const updates = events['contacts.update'];
      console.log(`Received ${updates.length} contact updates`);
      storeContacts(updates);
    }
    
    // Handle group metadata updates
    if(events['groups.update']) {
      const updates = events['groups.update'];
      console.log(`Received ${updates.length} group metadata updates`);
      storeGroupUpdates(updates);
    }

    // When history is received
    if(events['messaging-history.set']) {
      console.log('\n==== HISTORY MESSAGES RECEIVED! ======');
      const { messages } = events['messaging-history.set'];
      
      console.log(`Received ${messages.length} history messages`);
      
      // Store each message in database
      storeMessages(messages);
    }

    // Handle new messages
    if(events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      console.log(`Messages upsert type: ${type}`);
      console.log(`Received ${messages.length} new messages`);
      
      // Store messages to database
      storeMessages(messages);
    }
  });

  // Function to store messages in the database
  function storeMessages(messages: proto.IWebMessageInfo[]) {
    if (!messages || messages.length === 0) return;
    
    try {
      // Begin a transaction
      const transaction = db.transaction(() => {
        for (const msg of messages) {
          try {
            // Extract message data
            const messageId = msg.key.id || '';
            const chatId = msg.key.remoteJid || '';
            const sender = msg.key.participant || msg.key.remoteJid || '';
            const timestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) : 0;
            const isFromMe = msg.key.fromMe || false;
            
            // Also store contact info for the chat and sender if available
            if (chatId) {
              upsertContact.run(
                chatId,
                null,  // name (will be updated by contacts.update)
                null,  // notify
                null,  // short_name
                null,  // push_name
                chatId.endsWith('@g.us') ? 1 : 0, // is_group
              );
            }
            
            // Extract message content
            let content = '';
            let messageType = '';
            
            if (msg.message) {
              if (msg.message.conversation) {
                messageType = 'text';
                content = msg.message.conversation;
              } else if (msg.message.extendedTextMessage) {
                messageType = 'extendedText';
                content = msg.message.extendedTextMessage.text || '';
              } else if (msg.message.imageMessage) {
                messageType = 'image';
                content = msg.message.imageMessage.caption || '[IMAGE]';
              } else if (msg.message.videoMessage) {
                messageType = 'video';
                content = msg.message.videoMessage.caption || '[VIDEO]';
              } else if (msg.message.audioMessage) {
                messageType = 'audio';
                content = '[AUDIO]';
              } else if (msg.message.documentMessage) {
                messageType = 'document';
                content = msg.message.documentMessage.fileName || '[DOCUMENT]';
              } else if (msg.message.contactMessage) {
                messageType = 'contact';
                content = msg.message.contactMessage.displayName || '[CONTACT]';
              } else if (msg.message.locationMessage) {
                messageType = 'location';
                content = '[LOCATION]';
              } else {
                messageType = Object.keys(msg.message)[0];
                content = `[${messageType.toUpperCase()}]`;
              }
            }
            
            // Store raw data as JSON (for advanced queries later)
            const rawData = JSON.stringify(msg);
            
            // Insert into database
            insertMessage.run(
              messageId,
              chatId,
              sender,
              timestamp,
              messageType,
              content,
              isFromMe ? 1 : 0,
              rawData
            );
            
            console.log(`Stored message: ${messageId} from ${chatId} (${content.substring(0, 30)}${content.length > 30 ? '...' : ''})`);
          } catch (err) {
            console.error('Error storing individual message:', err);
          }
        }
      });
      
      // Execute the transaction
      transaction();
      console.log(`Successfully stored ${messages.length} messages to database`);
      
    } catch (err) {
      console.error('Error in batch message storage:', err);
    }
  }
  
  // Function to store contact information
  function storeContacts(contacts: any[]) {
    if (!contacts || contacts.length === 0) return;
    
    try {
      // Begin a transaction
      const transaction = db.transaction(() => {
        for (const contact of contacts) {
          try {
            if (!contact.id) continue;
            
            upsertContact.run(
              contact.id,
              contact.name,
              contact.notify,
              contact.short,
              contact.pushName,
              contact.id.endsWith('@g.us') ? 1 : 0
            );
            
            console.log(`Stored contact: ${contact.id} (${contact.name || contact.notify || contact.pushName || 'No name'})`);
          } catch (err) {
            console.error('Error storing individual contact:', err);
          }
        }
      });
      
      // Execute the transaction
      transaction();
    } catch (err) {
      console.error('Error in contacts transaction:', err);
    }
  }
  
  // Function to store group metadata
  function storeGroupUpdates(groups: any[]) {
    if (!groups || groups.length === 0) return;
    
    try {
      // Begin a transaction
      const transaction = db.transaction(() => {
        for (const group of groups) {
          try {
            if (!group.id) continue;
            
            upsertContact.run(
              group.id,
              group.subject,
              group.subject,
              null,
              null,
              1 // is_group
            );
            
            console.log(`Updated group: ${group.id} (${group.subject || 'No name'})`);
          } catch (err) {
            console.error('Error storing group metadata:', err);
          }
        }
      });
      
      // Execute the transaction
      transaction();
    } catch (err) {
      console.error('Error in group metadata transaction:', err);
    }
  }
}

// Start the message storage service
startMessageStorage().catch(err => console.error('Error in main process:', err));

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nClosing database connection...');
  if (db) db.close();
  console.log('Exiting WhatsApp message storage service');
  process.exit(0);
});

// Helper function to print message content
function printMessageContent(msg: proto.IWebMessageInfo) {
  let content = 'No content';
  if (msg.message?.conversation) {
    content = msg.message.conversation;
  } else if (msg.message?.extendedTextMessage?.text) {
    content = msg.message.extendedTextMessage.text;
  } else if (msg.message) {
    content = `[Message of type: ${Object.keys(msg.message)[0]}]`;
  }
  
  const from = msg.key?.remoteJid || 'unknown';
  const fromMe = msg.key?.fromMe ? 'You' : 'Other';
  const time = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toLocaleString() : 'unknown';
  
  console.log(`${time} | ${fromMe} (${from}): ${content}`);
}
