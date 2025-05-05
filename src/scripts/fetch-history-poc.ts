import { Boom } from '@hapi/boom';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay
} from 'baileys';
import * as fs from 'fs';
import P from 'pino';

// Set up logger
const logger = P({ level: 'info' });

// Target group ID - replace with your group ID
const TARGET_GROUP_ID = '351919755889-1635955006@g.us'; // Dom19h Saldanha P4ALL M4+

async function startMessageHistoryPOC() {
  console.log('Starting WhatsApp message history fetch POC...');
  
  // Use the auth state
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  
  // Fetch latest version
  const { version } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join('.')}`);

  // Create socket connection
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: state.keys,
    },
    generateHighQualityLinkPreview: false,
    // Browser identification
    browser: ['Chrome (Linux)', 'Chrome', '104.0.0.0'],
  });

  // Process events
  sock.ev.process(async(events) => {
    // Handle connection updates
    if(events['connection.update']) {
      const update = events['connection.update'];
      const { connection, lastDisconnect } = update;
      
      console.log('Connection update:', update);
      
      if(connection === 'close') {
        // Reconnect if not logged out
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        if(shouldReconnect) {
          console.log('Connection closed. Reconnecting...');
          await startMessageHistoryPOC();
        } else {
          console.log('Connection closed. You are logged out.');
        }
      }
      
      if(connection === 'open') {
        console.log('Connected to WhatsApp!');
        
        // Once connected, attempt to fetch message history
        await initiateMessageFetch();
      }
    }

    // Update credentials
    if(events['creds.update']) {
      await saveCreds();
    }

    // When history is received
    if(events['messaging-history.set']) {
      const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
      console.log(`Received history sync with ${messages.length} messages`);
      console.log(`Chat count: ${chats.length}, Contact count: ${contacts.length}`);
      console.log(`Is latest: ${isLatest}, Progress: ${progress}%, Type: ${syncType}`);
      
      if(messages.length > 0) {
        console.log('First 5 messages received:');
        // Print the first 5 messages (or fewer if less than 5 available)
        messages.slice(0, 5).forEach((msg, i) => {
          console.log(`Message ${i+1}:`, JSON.stringify(msg, null, 2));
        });
      }
    }

    // Handle messages upsert
    if(events['messages.upsert']) {
      const upsert = events['messages.upsert'];
      console.log('Messages upsert type:', upsert.type);
      
      if(upsert.type === 'notify') {
        console.log(`Received ${upsert.messages.length} new messages`);
        
        for(const msg of upsert.messages) {
          console.log('Received message:', {
            from: msg.key.remoteJid,
            id: msg.key.id,
            timestamp: msg.messageTimestamp,
            content: msg.message
          });
          
          // If this is a history sync notification, process it
          if(msg.message?.protocolMessage?.type === 5) { // 5 is HISTORY_SYNC_NOTIFICATION
            console.log('Received history sync notification');
          }
          
          // Mark message as read to help trigger sync
          await sock.readMessages([msg.key]);
        }
      }
    }
  });

  // Function to initiate message fetch once connected
  async function initiateMessageFetch() {
    try {
      console.log('Preparing to fetch message history...');
      
      // Subscribe to group presence to make iOS notification more likely
      await sock.presenceSubscribe(TARGET_GROUP_ID);
      console.log('Subscribed to group presence');
      
      // Simulate typing to trigger notifications
      await sock.sendPresenceUpdate('composing', TARGET_GROUP_ID);
      await delay(2000);
      await sock.sendPresenceUpdate('paused', TARGET_GROUP_ID);
      console.log('Sent presence updates to trigger notifications');
      
      console.log('⚠️ OPEN WHATSAPP NOW! ⚠️');
      console.log('Look for "syncing with" notification');
      
      // Wait a moment for the user to open WhatsApp
      await delay(5000);
      
      // Try to fetch message history (50 is max allowed by WhatsApp)
      const messageCount = 50;
      console.log(`Attempting to fetch the last ${messageCount} messages...`);
      
      // The requestId we get back from fetchMessageHistory
      // Create an empty message key for the target group
      const emptyMessageKey = {
        remoteJid: TARGET_GROUP_ID,
        id: '',
        fromMe: false
      };
      
      const requestId = await sock.fetchMessageHistory(
        messageCount,
        emptyMessageKey,
        0  // start from the beginning (timestamp 0)
      );
      
      console.log('History request sent with ID:', requestId);
      console.log('Waiting for messages to sync...');
      console.log('If you see "syncing has stopped" notification:');
      console.log('1. Open WhatsApp again and keep it open');
      console.log('2. Look for messages to start appearing');
      
      // Wait for some time to allow the sync to complete
      await delay(30000);
      console.log('Sync waiting period complete. Check logs above for any received messages.');
    } catch (error) {
      console.error('Error during message fetch:', error);
    }
  }
}

// Start the POC
startMessageHistoryPOC().catch(err => console.error('Fatal error:', err));
