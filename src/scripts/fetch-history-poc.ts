import { Boom } from '@hapi/boom';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay,
  downloadAndProcessHistorySyncNotification,
  WAMessageKey,
  getHistoryMsg,
  proto
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
      
      // Filter messages to only include those from the target group
      const targetGroupMessages = messages.filter(msg => msg.key.remoteJid === TARGET_GROUP_ID);
      console.log(`Filtered ${targetGroupMessages.length} messages from target group`);
      
      if(targetGroupMessages.length > 0) {
        console.log('\n===== HISTORICAL MESSAGE CONTENTS FROM TARGET GROUP =====');
        // Extract and print text content from filtered messages
        targetGroupMessages.forEach((msg, i) => {
          // Extract text content
          let messageText = '';
          if (msg.message?.conversation) {
            messageText = msg.message.conversation;
          } else if (msg.message?.extendedTextMessage?.text) {
            messageText = msg.message.extendedTextMessage.text;
          } else if (msg.message?.imageMessage?.caption) {
            messageText = `[IMAGE] ${msg.message.imageMessage.caption}`;
          } else if (msg.message?.videoMessage?.caption) {
            messageText = `[VIDEO] ${msg.message.videoMessage.caption}`;
          } else if (msg.message?.documentMessage) {
            messageText = `[DOCUMENT] ${msg.message.documentMessage.fileName || 'Unknown file'}`;
          } else if (msg.message?.audioMessage) {
            messageText = `[AUDIO] Duration: ${msg.message.audioMessage.seconds || 'unknown'} seconds`;
          } else if (msg.message?.stickerMessage) {
            messageText = `[STICKER]`;
          } else if (msg.message?.contactMessage) {
            messageText = `[CONTACT] ${msg.message.contactMessage.displayName || 'Unknown contact'}`;
          } else if (msg.message?.locationMessage) {
            messageText = `[LOCATION] ${msg.message.locationMessage.name || ''}`;
          } else {
            messageText = `[OTHER MESSAGE TYPE]`;
          }
          
          // Get timestamp as readable date
          const timestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toLocaleString() : 'Unknown time';
          
          // Get sender info
          const isFromMe = msg.key.fromMe;
          const sender = isFromMe ? 'You' : (msg.pushName || (msg.key.remoteJid ? msg.key.remoteJid.split('@')[0] : 'Unknown'));
          
          // Print formatted message
          console.log(`[${timestamp}] ${sender}: ${messageText}`);
        });
        console.log('================================================\n');
      } else {
        console.log('No historical messages found from the target group yet.');
      }
    }

    // Handle messages upsert - only for history sync notifications
    if(events['messages.upsert']) {
      const upsert = events['messages.upsert'];
      
      if(upsert.type === 'notify') {
        for(const msg of upsert.messages) {
          // Process history sync notifications
          if(msg.message?.protocolMessage?.type === proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION) {
            console.log('Received history sync notification');
            
            try {
              // Get history sync data
              const historySyncNotification = getHistoryMsg(msg.message);
              if (historySyncNotification) {
                console.log('Processing history sync notification...');
                
                // Download and process the history sync
                const { chats, contacts, messages } = await downloadAndProcessHistorySyncNotification(historySyncNotification, {});
                
                console.log(`Downloaded history: ${messages.length} messages, ${chats.length} chats, ${contacts.length} contacts`);
                
                // Filter only the messages from our target group
                const targetGroupMessages = messages.filter(m => m.key.remoteJid === TARGET_GROUP_ID);
                console.log(`Found ${targetGroupMessages.length} messages from target group in history sync`);
                
                if (targetGroupMessages.length > 0) {
                  console.log('\n===== DOWNLOADED HISTORICAL MESSAGES =====');
                  // Process and display target group messages
                  targetGroupMessages.forEach((historyMsg) => {
                    // Extract text content
                    let messageText = '';
                    if (historyMsg.message?.conversation) {
                      messageText = historyMsg.message.conversation;
                    } else if (historyMsg.message?.extendedTextMessage?.text) {
                      messageText = historyMsg.message.extendedTextMessage.text;
                    } else if (historyMsg.message?.imageMessage?.caption) {
                      messageText = `[IMAGE] ${historyMsg.message.imageMessage.caption}`;
                    } else if (historyMsg.message?.videoMessage?.caption) {
                      messageText = `[VIDEO] ${historyMsg.message.videoMessage.caption}`;
                    } else if (historyMsg.message?.documentMessage) {
                      messageText = `[DOCUMENT] ${historyMsg.message.documentMessage.fileName || 'Unknown file'}`;
                    } else if (historyMsg.message?.audioMessage) {
                      messageText = `[AUDIO]`;
                    } else if (historyMsg.message?.stickerMessage) {
                      messageText = `[STICKER]`;
                    } else {
                      messageText = `[OTHER MESSAGE TYPE]`;
                    }
                    
                    // Get timestamp
                    const timestamp = historyMsg.messageTimestamp 
                      ? new Date(Number(historyMsg.messageTimestamp) * 1000).toLocaleString() 
                      : 'Unknown time';
                    
                    // Get sender info
                    const isFromMe = historyMsg.key.fromMe;
                    const sender = isFromMe ? 'You' : 'Group member';
                    
                    console.log(`[${timestamp}] ${sender}: ${messageText}`);
                  });
                  console.log('========================================\n');
                }
              }
            } catch (error) {
              console.error('Error processing history sync:', error);
            }
            
            // Mark message as read to acknowledge
            await sock.readMessages([msg.key]);
          }
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
      
      console.log('\n⚠️ OPEN WHATSAPP NOW ON YOUR PHONE! ⚠️');
      console.log('Look for "syncing with" notification');
      console.log('Keep WhatsApp open even after "syncing stopped" notification appears\n');
      
      // Wait a moment for the user to open WhatsApp
      await delay(5000);
      
      // Try multiple history fetch approaches to maximize chances of success
      console.log('Attempting multiple approaches to fetch history...');
      
      // Approach 1: Using fetchMessageHistory with empty key
      const messageCount = 50;
      console.log(`Approach 1: Fetching last ${messageCount} messages with empty key...`);
      
      // Create message key for the target group
      const groupMessageKey: WAMessageKey = {
        remoteJid: TARGET_GROUP_ID,
        id: '',
        fromMe: false
      };
      
      const requestId1 = await sock.fetchMessageHistory(
        messageCount,
        groupMessageKey,
        0  // start from the beginning (timestamp 0)
      );
      console.log('Request 1 sent with ID:', requestId1);
      
      // Wait a bit before trying the next approach
      await delay(2000);
      
      // Approach 2: Using readMessages to trigger a sync
      console.log('Approach 2: Using readMessages to trigger sync...');
      await sock.readMessages([groupMessageKey]);
      
      // Wait a bit before trying the next approach
      await delay(2000);
      
      // Approach 3: Fetch with a timestamp hint
      console.log('Approach 3: Fetching with timestamp hint...');
      // Use current time as a hint - 30 days ago (in seconds)
      const timestamp = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const requestId3 = await sock.fetchMessageHistory(
        messageCount,
        groupMessageKey,
        timestamp
      );
      console.log('Request 3 sent with ID:', requestId3);
      
      console.log('\nWaiting for messages to sync...');
      console.log('If you see "syncing has stopped" notification:');
      console.log('1. This is normal - keep WhatsApp open');
      console.log('2. Historical messages should appear in the logs\n');
      
      // Wait for a longer time to allow the sync to complete
      console.log('Waiting 45 seconds for sync to complete...');
      for (let i = 1; i <= 9; i++) {
        await delay(5000);
        console.log(`Still waiting... (${i*5}/45 seconds elapsed)`);
      }
      console.log('Sync waiting period complete. Check logs above for historical messages.');
    } catch (error) {
      console.error('Error during message fetch:', error);
    }
  }
}

// Start the POC
startMessageHistoryPOC().catch(err => console.error('Fatal error:', err));
