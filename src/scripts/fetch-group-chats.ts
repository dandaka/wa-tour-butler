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
 * Main function to fetch and print group names and IDs in CSV format
 */
async function fetchGroupChats() {
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

  // Listen for connection events
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('Connected to WhatsApp!');
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('Logged out from WhatsApp');
      } else {
        console.log(`Connection closed with status: ${statusCode}`);
      }
      
      process.exit(0);
    }
  });
}

// Start the script
fetchGroupChats();
