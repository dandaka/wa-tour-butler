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
 * Based on the official Baileys example
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
  
  // Trigger sync of messages
  async function triggerMessageSync() {
    try {
      // Show instructions to the user regardless of reference message
      console.log(`\n====== IMPORTANT INSTRUCTIONS ======`);
      console.log(`1. Make sure your phone is NEARBY with WhatsApp installed`);
      console.log(`2. CLOSE WhatsApp completely (swipe it away)`);
      console.log(`3. Wait for this script to print "OPEN WHATSAPP NOW"`);
      console.log(`4. When prompted, OPEN WhatsApp immediately`);
      console.log(`5. Wait for "syncing with" notification to appear`);
      console.log(`6. Keep WhatsApp open even after the notification disappears`);
      console.log(`==========================================\n`);
      
      // First, create a dummy message key that points to the group
      console.log('Attempting to trigger WhatsApp sync...');
      const messageKey = {
        remoteJid: targetGroupJid,
        id: `dummy_${Date.now()}`, // This is just for the function call, not critical
        fromMe: false
      };
        
        // Show instructions to the user
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
        
        // Step 2: First read receipt to trigger initial sync
        console.log('Step 2: Sending first read receipt...');
        await sock.readMessages([messageKey]);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 3: Tell user to open WhatsApp
        console.log('\n⚠️ OPEN WHATSAPP NOW! ⚠️');
        console.log('Look for "syncing with" notification');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for user to open WhatsApp
        
        // Step 4: Simulate typing activity (from official example)
        if (targetGroupJid) {
          console.log('Step 4: Simulating typing activity...');
          await sock.sendPresenceUpdate('composing', targetGroupJid);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Step 5: Send paused status (exactly like official example)
          console.log('Step 5: Sending paused status...');
          await sock.sendPresenceUpdate('paused', targetGroupJid);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Step 6: Send second read receipt
        console.log('Step 6: Sending second read receipt...');
        await sock.readMessages([messageKey]);
          }
        } catch (err) {
          console.log(`History request method not supported: ${err.message}`);
        }

        // Method 3: Try another approach from the Baileys example
        try {
          console.log(`Method 3: Trying conversation load...`);
          // @ts-ignore - This is a fallback method
          await sock.chatModify({ markRead: true }, targetGroupJid!);
        } catch (err) {
          console.log('Chat modification method not supported');
        }

        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Increasing delay
      } catch (error) {
        console.error(`Error fetching history (attempt ${attempt}):`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('No reference message found in database');
      }
      
      // Wait for messages to sync
      console.log('\nWaiting for messages to sync...');
      console.log('If you see a "syncing has stopped" notification:');
      console.log('1. Immediately OPEN WhatsApp on your iOS device');
      console.log('2. Keep it open and watch for messages to appear');
      
      console.log('\nKEY INSTRUCTIONS:');
      console.log('* When you see "syncing with", KEEP THE SCRIPT RUNNING');
      console.log('* After "syncing stopped", wait for messages to appear in WhatsApp');
      console.log('* This script will keep running for 60 seconds to allow sync to complete');
      console.log('\nScript progress will be shown every 10 seconds:');
      
      // Setup progress updates with tips for each stage of the process
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
