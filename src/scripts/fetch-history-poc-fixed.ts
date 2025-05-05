import { Boom } from '@hapi/boom';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay,
  downloadAndProcessHistorySyncNotification,
  getHistoryMsg,
  proto
} from 'baileys';
import P from 'pino';

// Set up logger
const logger = P({ level: 'info' });

// Target group name to look for
const TARGET_GROUP_NAME = 'Test Baileys';
let targetGroupId: string | null = null;

// Map to store request IDs and their associated chats
const requestMap = new Map<string, string>();

// Add to the global space to track callback status
declare global {
  var callbackReceived: boolean;
}

// Set a timeout to exit the script after the specified duration
const SYNC_TIMEOUT_MS = 60000; // 1 minute timeout
let exitTimeoutId: NodeJS.Timeout;

async function startMessageHistoryPOC() {
  console.log('Starting WhatsApp message history fetch POC...');
  
  // Schedule the script to exit after timeout
  exitTimeoutId = setTimeout(() => {
    console.log(`\nExiting after ${SYNC_TIMEOUT_MS/1000} seconds timeout`);
    // Force exit with success code
    process.exit(0);
  }, SYNC_TIMEOUT_MS);
  
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
          startMessageHistoryPOC();
        } else {
          console.log('Connection closed. You are logged out.');
          process.exit(1);
        }
      }
      
      if(connection === 'open') {
        console.log('Connected to WhatsApp!');
        
        // First find the target group
        await findTargetGroup();
        
        // Once connected, attempt to fetch message history if group found
        if (targetGroupId) {
          await initiateMessageFetch();
        } else {
          console.log(`Group "${TARGET_GROUP_NAME}" not found. Please check the group name.`);
          console.log('Exiting...');
          clearTimeout(exitTimeoutId);
          process.exit(1);
        }
      }
    }

    // Update credentials
    if(events['creds.update']) {
      await saveCreds();
    }

    // When history is received
    if(events['messaging-history.set']) {
      console.log('\n✅ CALLBACK RECEIVED - WhatsApp has sent history data!');
      
      // Set our global flag to indicate we received the callback
      global.callbackReceived = true;
      const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
      
      console.log(`\nHistory sync received:
- Messages: ${messages.length}
- Chats: ${chats.length}
- Contacts: ${contacts.length}
- Is Latest: ${isLatest}
- Progress: ${progress}%
- Sync Type: ${syncType}
`);
      
      // Filter messages from target group
      const targetGroupMessages = messages.filter(msg => msg.key.remoteJid === targetGroupId);
      console.log(`Found ${targetGroupMessages.length} messages from target group`);
      
      if(targetGroupMessages.length > 0) {
        console.log('\n===== TARGET GROUP MESSAGES =====');
        targetGroupMessages.forEach((msg, i) => {
          // Get timestamp as readable date
          const timestamp = msg.messageTimestamp 
            ? new Date(Number(msg.messageTimestamp) * 1000).toLocaleString() 
            : 'Unknown time';
            
          // Get sender info
          const isFromMe = msg.key.fromMe;
          const sender = isFromMe ? 'You' : 'Group Member';
          
          // Extract message content
          let content = 'No content';
          if (msg.message?.conversation) {
            content = msg.message.conversation;
          } else if (msg.message?.extendedTextMessage?.text) {
            content = msg.message.extendedTextMessage.text;
          } else if (msg.message?.imageMessage) {
            content = `[IMAGE${msg.message.imageMessage.caption ? `: ${msg.message.imageMessage.caption}` : ''}]`;
          } else if (msg.message?.videoMessage) {
            content = `[VIDEO${msg.message.videoMessage.caption ? `: ${msg.message.videoMessage.caption}` : ''}]`;
          } else if (msg.message?.documentMessage) {
            content = `[DOCUMENT: ${msg.message.documentMessage.fileName || 'Unknown'}]`;
          } else {
            content = '[OTHER MESSAGE TYPE]';
          }
          
          // Print the message details
          console.log(`[${timestamp}] ${sender}: ${content}`);
        });
        console.log('=================================\n');
      }
    }

    // Handle messages upsert for history sync notification
    if(events['messages.upsert']) {
      const upsert = events['messages.upsert'];
      
      // Only process 'notify' type messages
      if(upsert.type === 'notify') {
        for(const msg of upsert.messages) {
          // Check if this is a history sync notification
          if(msg.message?.protocolMessage?.type === proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION) {
            console.log('Received history sync notification');
            
            // Get the history sync data
            const historySyncNotification = getHistoryMsg(msg.message);
            if (historySyncNotification) {
              console.log(`History sync notification details:
- Type: ${historySyncNotification.syncType}
- Session ID: ${historySyncNotification.peerDataRequestSessionId || 'N/A'}
`);
              
              try {
                // Process the history sync notification
                console.log('Processing history sync notification...');
                const result = await downloadAndProcessHistorySyncNotification(historySyncNotification, {});
                
                console.log(`Processed history sync: ${result.messages.length} messages, ${result.chats.length} chats`);
                
                // Filter only the messages from our target group
                const targetMessages = result.messages.filter(m => m.key.remoteJid === targetGroupId);
                if (targetMessages.length > 0) {
                  console.log(`Found ${targetMessages.length} messages for target group`);
                } else {
                  console.log('No messages found for target group in this sync');
                }
              } catch (error) {
                console.error('Error processing history sync:', error);
              }
            }
            
            // Mark as read to acknowledge
            await sock.readMessages([msg.key]);
          }
          
          // We're not implementing the onDemandHistSync approach that requires sending messages
        }
      }
    }
  });

  // Function to find the target group by name
  async function findTargetGroup() {
    try {
      console.log(`Looking for group: "${TARGET_GROUP_NAME}"...`);
      
      // Fetch all chats
      const chats = await sock.groupFetchAllParticipating();
      console.log(`Found ${Object.keys(chats).length} groups`);
      
      // Look for the target group by name
      for (const [id, chat] of Object.entries(chats)) {
        if (chat.subject && chat.subject.includes(TARGET_GROUP_NAME)) {
          console.log(`Found target group: "${chat.subject}" (${id})`);
          console.log(`Participants: ${Object.keys(chat.participants).length}`);
          targetGroupId = id;
          return;
        }
      }
      
      console.log(`Group "${TARGET_GROUP_NAME}" not found among your WhatsApp groups`);
    } catch (error) {
      console.error('Error finding target group:', error);
    }
  }
  
  // Function to initiate message fetch once connected
  async function initiateMessageFetch() {
    try {
      console.log('Preparing to fetch message history...');
      
      // Subscribe to group presence
      await sock.presenceSubscribe(targetGroupId!);
      console.log('Subscribed to group presence');
      
      // Send presence updates to make sync notification more likely
      await sock.sendPresenceUpdate('composing', targetGroupId!);
      await delay(1000);
      await sock.sendPresenceUpdate('paused', targetGroupId!);
      console.log('Sent presence updates to trigger sync');
      
      console.log('\n⚠️ OPEN WHATSAPP NOW ON YOUR PHONE! ⚠️');
      console.log('Look for "syncing with" notification');
      console.log('Keep WhatsApp open after "syncing stopped" notification appears');
      console.log('We are waiting for WhatsApp to send history data via a callback event\n');
      
      // Wait for user to open WhatsApp
      await delay(5000);
      
      // Note: We're NOT sending any messages to groups for privacy reasons
      console.log('Using non-invasive methods only (no messages will be sent)');
      
      await delay(1000);
      
      // Use direct fetchMessageHistory API (non-invasive method)
      console.log('Using fetchMessageHistory API...');
      
      // Create a message key for the last message
      const dummyKey = {
        remoteJid: targetGroupId!,
        id: '',  // Empty ID
        fromMe: false
      };
      
      // Use timestamp from 30 days ago
      const timestamp = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      
      try {
        console.log('Sending fetchMessageHistory request...');
        
        // We need to explicitly handle the promise to log when it's resolved
        const requestIdPromise = sock.fetchMessageHistory(
          50,
          dummyKey,
          timestamp
        );
        
        // Set up logging for the promise resolution
        requestIdPromise
          .then(requestId => {
            console.log('✅ REQUEST ACKNOWLEDGED - WhatsApp accepted our history request with ID:', requestId);
            // Store the request ID to track it
            requestMap.set(requestId, targetGroupId!);
            
            // Add a flag to track whether the callback was received
            global.callbackReceived = false;
            
            // Log at the end of our timeout if we never received the callback
            const checkCallbackTimeout = setTimeout(() => {
              if (!global.callbackReceived) {
                console.log('❌ CALLBACK NOT RECEIVED - WhatsApp did not send the history data within the timeout period');
              }
            }, SYNC_TIMEOUT_MS - 1000); // Check 1 second before exit
            
            return requestId;
          })
          .catch(error => {
            console.error('❌ REQUEST REJECTED - WhatsApp rejected our history request:', error);
          });
          
        // Still need to await it for the flow
        const requestId = await requestIdPromise;
        console.log('Request ID stored. Now waiting for callback event from WhatsApp...');
      } catch (error) {
        console.error('Error fetching message history:', error);
      }
      
      console.log('\nWaiting for messages to sync...');
      console.log('- If you see "syncing with WhatsApp" notification, that\'s good!');
      console.log('- If you see "syncing has stopped", keep WhatsApp open anyway');
      console.log('- The script will exit automatically after timeout');
      
      // Progress indicator
      let elapsed = 0;
      const interval = 5000; // 5 seconds
      const progressInterval = setInterval(() => {
        elapsed += interval;
        console.log(`Still waiting... ${elapsed/1000}/${SYNC_TIMEOUT_MS/1000} seconds elapsed`);
        
        if (elapsed >= SYNC_TIMEOUT_MS) {
          clearInterval(progressInterval);
        }
      }, interval);
      
    } catch (error) {
      console.error('Error during message fetch:', error);
      process.exit(1);
    }
  }
}

// Start the POC and ensure it exits
startMessageHistoryPOC().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
