import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  proto
} from 'baileys';
import path from 'path';
import fs from 'fs';

// Store path for session data
const SESSION_DIR = path.join(process.cwd(), 'session');

/**
 * Login to WhatsApp and generate session credentials
 * This script is used exclusively for authentication
 */
async function loginToWhatsApp() {
  console.log('Starting WhatsApp login process...');
  
  // Clear session if requested
  const shouldClearSession = process.argv.includes('--clear-session');
  
  // Check if session exists
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log('Created new session directory');
  } else if (shouldClearSession) {
    console.log('Clearing session directory to force new QR code...');
    const files = fs.readdirSync(SESSION_DIR);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(SESSION_DIR, file));
      } catch (err) {
        console.error(`Error deleting file ${file}:`, err);
      }
    }
    console.log(`Cleared ${files.length} session files`);
  }

  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  // Create WhatsApp socket connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Chrome', 'Desktop', '22.04.4']
  });
  
  console.log('\n\x1b[33m==================================\x1b[0m');
  console.log('\x1b[33mIf QR code appears, scan it with your phone!\x1b[0m');
  console.log('\x1b[33m==================================\x1b[0m\n');
  
  // Save credentials when they're updated
  sock.ev.on('creds.update', saveCreds);
  
  // Track login status
  let isNewLogin = false;
  let loginCompleted = false;
  
  // Handle connection events
  sock.ev.on('connection.update', async (update) => {
    console.log('Connection update:', JSON.stringify(update, null, 2));
    
    // Handle QR code updates explicitly
    if (update.qr) {
      console.log('\n\x1b[33m==================================\x1b[0m');
      console.log('\x1b[33mNEW QR CODE RECEIVED! Scan with your phone!\x1b[0m');
      console.log('\x1b[33m==================================\x1b[0m\n');
    }
    
    // Detect new login
    if (update.isNewLogin) {
      isNewLogin = true;
    }
    
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('\n\x1b[32m==================================\x1b[0m');
      console.log('\x1b[32mSUCCESS: Connected to WhatsApp!\x1b[0m');
      console.log('\x1b[32mYour session credentials have been saved.\x1b[0m');
      console.log('\x1b[32m==================================\x1b[0m\n');
      
      console.log('Waiting 5 seconds to ensure credentials are saved...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      loginCompleted = true;
      process.exit(0);
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('\n\x1b[31m==================================\x1b[0m');
        console.log('\x1b[31mERROR: Logged out from WhatsApp\x1b[0m');
        console.log('\x1b[31m==================================\x1b[0m\n');
        process.exit(1);
      } else if (statusCode === 515) {
        if (isNewLogin) {
          console.log('\n\x1b[33m==================================\x1b[0m');
          console.log('\x1b[33mNEW LOGIN DETECTED! You need to run the script again!\x1b[0m');
          console.log('\x1b[33mYour session has been saved. Now run:\x1b[0m');
          console.log('\x1b[36mpnpm run whatsapp-login\x1b[0m');
          console.log('\x1b[33m==================================\x1b[0m\n');
          process.exit(0);
        } else {
          console.log('\n\x1b[31m==================================\x1b[0m');
          console.log('\x1b[31mERROR: Connection closed with status: 515\x1b[0m');
          console.log('\x1b[31mTry clearing the session with --clear-session flag\x1b[0m');
          console.log('\x1b[31m==================================\x1b[0m\n');
          process.exit(1);
        }
      } else {
        console.log(`Connection closed with status: ${statusCode}`);
        process.exit(1);
      }
    }
  });
  
  // Keep the process running until complete
  process.on('SIGINT', () => {
    console.log('Login process interrupted');
    process.exit(0);
  });
  
  // Set a timeout safety mechanism
  setTimeout(() => {
    if (!loginCompleted) {
      console.log('\n\x1b[31m==================================\x1b[0m');
      console.log('\x1b[31mTIMEOUT: Login process took too long\x1b[0m');
      console.log('\x1b[31mPlease try again\x1b[0m');
      console.log('\x1b[31m==================================\x1b[0m\n');
      process.exit(1);
    }
  }, 120000); // 2 minutes timeout
}

// Start login process
loginToWhatsApp().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
