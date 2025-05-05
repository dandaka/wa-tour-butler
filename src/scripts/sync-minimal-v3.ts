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

/**
 * Minimal sync script focusing on proper notification triggering
 * Based on the official Baileys example - designed to work without reference messages
 */
async function minimalSync() {
  console.log('Starting minimal WhatsApp sync for group "Dom19h Saldanha P4ALL M4+"...');
  
  // Create data directory if it doesn't exist
  const DATA_DIR = path.join(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Store path for session data
  const SESSION_DIR = path.join(process.cwd(), 'session');

  // SQLite database path in the data folder
  const DB_PATH = path.join(DATA_DIR, 'group_messages.db');

  // Target group name
  const TARGET_GROUP_NAME = "Dom19h Saldanha P4ALL M4+";
  
  // Initialize database connection
  const db = new Database(DB_PATH);
  console.log(`Database initialized at ${DB_PATH}`);
  
  // Initialize database tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_info (
      jid TEXT PRIMARY KEY,
      name TEXT,
      participants INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      remoteJid TEXT,
      fromMe INTEGER,
      timestamp INTEGER,
      pushName TEXT,
      participant TEXT,
      message TEXT,
      PRIMARY KEY (id, remoteJid)
    );
  `);
  console.log('Database tables verified');
  
  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  // Create WhatsApp socket connection with a randomized browser identifier
  const browserRandomizer = Math.floor(Math.random() * 1000);
  const msgRetryCache = new SimpleCache();
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Chrome', `Desktop-${browserRandomizer}`, '22.04.4'],
    msgRetryCounterCache: msgRetryCache,
    generateHighQualityLinkPreview: true,
  });
  
  // Track key variables
  let targetGroupJid: string | null = null;
  let connected = false;
  let exitTimeout: NodeJS.Timeout;
  
  // Set timeout for the entire script to exit after 60 seconds
  exitTimeout = setTimeout(() => {
    console.log('\nExiting after timeout...');
    // Clean up session files to make next sync attempt appear as a new session
    try {
      console.log('Regenerating session token for next sync...');
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
  
  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, isOnline, receivedPendingNotifications } = update;
    
    // Log all connection updates for debugging
    console.log('Connection update:', update);
    
    if (connection === 'open') {
      connected = true;
      console.log('Connected to WhatsApp!');
      
      // Once connected, fetch groups and initiate sync
      fetchGroupsAndInitiateSync();
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect) {
        console.log('Connection closed. Attempting to reconnect...');
      } else {
        console.log('Connection closed. Logged out from WhatsApp.');
        clearTimeout(exitTimeout);
        process.exit(1);
      }
    }
  });
  
  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const message of messages) {
        // Only process messages from the target group
        if (message.key.remoteJid === targetGroupJid) {
          try {
            // Store message in database
            await storeMessage(message);
            
            // Mark message as read (helps with sync)
            await sock.readMessages([message.key]);
          } catch (error) {
            console.error('Error handling incoming message:', error);
          }
        }
      }
    }
  });
  
  // Store message in database
  async function storeMessage(message: proto.IWebMessageInfo) {
    try {
      // Skip empty messages
      if (!message?.key?.id) return;
      console.log('New message received:', [message.message?.conversation || message.message?.extendedTextMessage?.text || '[Media Message]'].slice(0, 50));
      
      const jid = message.key.remoteJid || '';
      const fromMe = message.key.fromMe ? 1 : 0;
      const participant = message.key.participant || null;
      const pushName = message.pushName || null;
      const timestamp = message.messageTimestamp as number;
      
      // Serialize message data
      const serializedMessage = JSON.stringify(message.message);
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO messages (id, remoteJid, fromMe, timestamp, pushName, participant, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        message.key.id,
        jid,
        fromMe,
        timestamp,
        pushName,
        participant,
        serializedMessage
      );
    } catch (error) {
      console.error('Failed to store message:', error);
    }
  }
  
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
        console.log(`Found target group: ${info.subject} (${jid})`);
        console.log(`Participants: ${info.participants.length}`);
        
        // Store group info
        await storeGroupInfo(jid, info.subject, info.desc || null, info.participants.length);
        
        // Trigger message sync
        triggerMessageSync();
      } else {
        console.error(`Target group "${TARGET_GROUP_NAME}" not found!`);
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
        INSERT OR REPLACE INTO group_info (jid, name, description, participants, created_at) 
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
  
  // Trigger sync of messages without requiring a reference message
  async function triggerMessageSync() {
    try {
      // Create a dummy message key for the group
      const dummyMessageKey = {
        remoteJid: targetGroupJid,
        id: `sync_trigger_${Date.now()}`,
        fromMe: false
      };
      
      // Display instructions
      console.log(`\n====== IMPORTANT INSTRUCTIONS ======`);
      console.log(`1. Make sure your phone is NEARBY with WhatsApp installed`);
      console.log(`2. CLOSE WhatsApp completely (swipe it away)`);
      console.log(`3. Wait for this script to print "OPEN WHATSAPP NOW"`);
      console.log(`4. When prompted, OPEN WhatsApp immediately`);
      console.log(`5. Wait for "syncing with" notification to appear`);
      console.log(`6. Keep WhatsApp open even after the notification disappears`);
      console.log(`==========================================\n`);
      
      // Step 1: Subscribe to presence (from official example)
      if (targetGroupJid) {
        console.log('Step 1: Subscribing to group presence...');
        await sock.presenceSubscribe(targetGroupJid);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Step 2: Simulate typing (from official example)
      if (targetGroupJid) {
        console.log('Step 2: Simulating typing activity...');
        await sock.sendPresenceUpdate('composing', targetGroupJid);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('Step 3: Sending paused status...');
        await sock.sendPresenceUpdate('paused', targetGroupJid);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('\n⚠️ OPEN WHATSAPP NOW! ⚠️');
      console.log('Look for "syncing with" notification');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for user to open WhatsApp
      
      // Step 4: Try to trigger message history sync using multiple methods
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`\nAttempt ${attempt}/3 to trigger message sync...`);
        
        // Method 1: Using readMessages
        try {
          console.log('Method 1: Using readMessages...');
          await sock.readMessages([dummyMessageKey]);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.log('Read messages method not fully supported');
        }
        
        // Method 2: Using presence
        if (targetGroupJid) {
          try {
            console.log('Method 2: Using presence updates...');
            await sock.sendPresenceUpdate('available', targetGroupJid);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.log('Presence update method not fully supported');
          }
        }
        
        // Method 3: Using chat fetch
        try {
          console.log('Method 3: Using chat fetch...');
          // @ts-ignore - This is supposed to trigger a sync in Baileys
          const messages = await sock.fetchMessagesFromWA(targetGroupJid, 100);
          console.log(`Fetch attempt returned ${messages?.length || 0} messages`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.log('Chat fetch method not supported in this version');
        }
        
        // Method 4: Using message history fetch
        try {
          if (typeof sock.fetchMessageHistory === 'function') {
            console.log('Method 4: Using fetchMessageHistory...');
            const timestamp = Math.floor(Date.now() / 1000) - (86400 * 30); // 30 days ago
            const result = await sock.fetchMessageHistory(100, dummyMessageKey, timestamp);
            console.log(`History request result: ${result}`);
          }
        } catch (error) {
          console.log('FetchMessageHistory not supported in this version');
        }
        
        // Method 5: Using chat modify
        if (targetGroupJid) {
          try {
            console.log('Method 5: Using chat modifications...');
            // @ts-ignore - Trying to trigger sync with chat modifications
            await sock.chatModify({ markRead: true }, targetGroupJid);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.log('Chat modify method not supported');
          }
        }
        
        // Wait increasingly longer between attempts
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      // Wait for messages to sync
      console.log('\nWaiting for messages to sync...');
      console.log('If you see a "syncing has stopped" notification:');
      console.log('1. Open WhatsApp again and keep it open');
      console.log('2. Look for messages to start appearing');
      
      console.log('\nKEY INSTRUCTIONS:');
      console.log('* After "syncing stopped", wait for messages to appear in WhatsApp');
      console.log('* The script will keep running for 60 seconds to allow sync to complete');
      console.log('\nScript progress will be shown every 10 seconds:');
      
      // Setup progress updates with tips
      let progressCounter = 0;
      const maxWaitTime = 60; // seconds
      const progressTips = [
        '👉 If you see "syncing with" notification, keep WhatsApp open',
        '👉 Did you see "syncing stopped"? That\'s normal, just keep WhatsApp open',
        '👉 WhatsApp should now be downloading messages in the background',
        '👉 Try scrolling in your chat list to encourage messages to appear',
        '👉 The sync is still in progress, please be patient',
        '👉 Final phase: messages should start appearing soon'
      ];
      
      const progressInterval = setInterval(() => {
        progressCounter += 10;
        const tipIndex = Math.min(Math.floor(progressCounter / 10), progressTips.length - 1);
        console.log(`⏱️ Sync in progress... (${progressCounter}/${maxWaitTime} sec)`);
        console.log(progressTips[tipIndex]);
      }, 10000);
      
      // Clear the interval when the script exits
      setTimeout(() => {
        clearInterval(progressInterval);
        console.log('\n✅ Sync process completed. Check your WhatsApp to see if messages appeared.');
        console.log('If no messages appeared, try running the script one more time while following the instructions carefully.');
      }, 59000);
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
