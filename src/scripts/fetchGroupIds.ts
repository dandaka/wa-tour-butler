import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from 'baileys';
import path from 'path';
import fs from 'fs';

// Store path for session data
const SESSION_DIR = path.join(process.cwd(), 'session');

/**
 * Main function to fetch and print group IDs
 * This simplified script only outputs group names and IDs in CSV format
 * for easy copy/paste into groups.csv
 */
async function fetchGroupIds() {
  console.log('Starting WhatsApp connection to fetch group IDs...');
  
  // Check if session exists
  if (!fs.existsSync(SESSION_DIR)) {
    console.error('No WhatsApp session found. Please run the main app first to log in.');
    process.exit(1);
  }

  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  // Create WhatsApp socket connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });
  
  // Save credentials when they're updated
  sock.ev.on('creds.update', saveCreds);

  // Handle connection events
  let connectionOpen = false;
  
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      connectionOpen = true;
      console.log('Connected to WhatsApp!');
    } else if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect) {
        console.log('Connection lost, reconnecting...');
        fetchGroupIds();
      } else {
        console.log('Connection closed.');
      }
    }
  });
  
  // Wait for connection to establish
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!connectionOpen && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (!connectionOpen) {
    console.error('Failed to connect to WhatsApp after multiple attempts');
    process.exit(1);
  }
  
  try {
    // Fetch all participating groups
    const groups = await sock.groupFetchAllParticipating();
    
    if (Object.keys(groups).length === 0) {
      console.log('No WhatsApp groups found.');
    } else {
      // Print CSV header
      console.log('Group ID,Name');
      
      // Print each group in CSV format (ID,Name)
      Object.entries(groups).forEach(([id, info]) => {
        // Escape commas in group names to maintain CSV format
        const escapedName = info.subject.includes(',') ? 
          `"${info.subject}"` : info.subject;
        
        console.log(`${id},${escapedName}`);
      });
      
      console.log(`\nFound ${Object.keys(groups).length} groups`);
    }
  } catch (error) {
    console.error('Error fetching groups:', error);
  } finally {
    // Always close the connection
    await sock.logout();
    console.log('Logged out from WhatsApp');
  }
}

// Run the script
fetchGroupIds();
