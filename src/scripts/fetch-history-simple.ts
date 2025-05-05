import { Boom } from '@hapi/boom';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay
} from 'baileys';
import P from 'pino';

// Set up logger
const logger = P({ level: 'info' });

// Hard-coding the original target group ID from the working example
const TARGET_GROUP_ID = '351919755889-1635955006@g.us'; // Dom19h Saldanha P4ALL M4+

async function startMessageHistoryPOC() {
  console.log('Starting WhatsApp message history fetch POC (simplified version)...');
  
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
        
        // Using hard-coded target group ID directly
        console.log(`Using target group ID: ${TARGET_GROUP_ID}`);
        
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
      console.log('🔔 HISTORY CALLBACK RECEIVED!');
      const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
      console.log(`Received history sync with ${messages.length} messages`);
      console.log(`Chat count: ${chats.length}, Contact count: ${contacts.length}`);
      console.log(`Is latest: ${isLatest}, Progress: ${progress}%, Type: ${syncType}`);
      
      // Filter messages from target group
      const targetGroupMessages = messages.filter(msg => msg.key.remoteJid === TARGET_GROUP_ID);
      console.log(`Found ${targetGroupMessages.length} messages from target group`);
      
      if(targetGroupMessages.length > 0) {
        console.log('First 5 messages from target group:');
        // Print the first 5 messages (or fewer if less than 5 available)
        targetGroupMessages.slice(0, 5).forEach((msg, i) => {
          let content = '';
          if (msg.message?.conversation) {
            content = msg.message.conversation;
          } else if (msg.message?.extendedTextMessage?.text) {
            content = msg.message.extendedTextMessage.text;
          } else {
            content = '[OTHER MESSAGE TYPE]';
          }
          
          const sender = msg.key.fromMe ? 'You' : 'Other';
          const timestamp = msg.messageTimestamp 
            ? new Date(Number(msg.messageTimestamp) * 1000).toLocaleString() 
            : 'Unknown time';
          
          console.log(`Message ${i+1} [${timestamp}] ${sender}: ${content}`);
        });
      }
    }

    // Handle messages upsert - only for history sync notifications
    if(events['messages.upsert']) {
      const upsert = events['messages.upsert'];
      
      if(upsert.type === 'notify') {
        for(const msg of upsert.messages) {
          if(msg.message?.protocolMessage?.type === 5) { // 5 is HISTORY_SYNC_NOTIFICATION
            console.log('Received history sync notification');
            await sock.readMessages([msg.key]);
          }
        }
      }
    }
  });

  // No need for findTargetGroup function with hardcoded ID

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
      console.log('Keep WhatsApp open after "syncing stopped" notification appears\n');
      
      // Wait a moment for the user to open WhatsApp
      await delay(5000);
      
      // Try to fetch message history (50 is max allowed by WhatsApp)
      const messageCount = 50;
      console.log(`Attempting to fetch the last ${messageCount} messages...`);
      
      // Create a message key for the target group - EXACTLY as in original working version
      const emptyMessageKey = {
        remoteJid: TARGET_GROUP_ID,
        id: '',
        fromMe: false
      };
      
      // Using timestamp 0 as in the original working version
      console.log('Sending history request...');
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
      
      // Wait for sync to complete
      for (let i = 1; i <= 6; i++) {
        console.log(`Waiting... (${i*5}/30 seconds elapsed)`);
        await delay(5000);
      }
      
      console.log('Sync waiting period complete. Check logs above for any received messages.');
    } catch (error) {
      console.error('Error during message fetch:', error);
    }
  }
}

// Start the POC with direct approach for command line use
console.log('Starting script...');
startMessageHistoryPOC().catch(err => console.error('Fatal error:', err));
