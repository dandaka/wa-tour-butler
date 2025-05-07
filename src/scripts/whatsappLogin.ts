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
 * Clear the WhatsApp session directory
 */
function clearSessionDirectory() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log('Created new session directory');
    return;
  }
  
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

/**
 * Login to WhatsApp and generate session credentials
 * This script is used exclusively for authentication
 */
async function loginToWhatsApp() {
  console.log('Starting WhatsApp login process...');
  
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
  let pairingSuccessful = false;
  
  // Setup log interception to detect pairing success
  // Store the original console.log function
  const originalConsoleLog = console.log;
  
  // Override console.log to catch pairing success messages
  console.log = function(message, ...args) {
    // Call the original console.log
    originalConsoleLog.apply(console, [message, ...args]);
    
    // Check if the message contains pairing success
    if (typeof message === 'string' && message.includes('pairing configured successfully')) {
      originalConsoleLog('\n\x1b[32m==================================\x1b[0m');
      originalConsoleLog('\x1b[32mPAIRING SUCCESSFUL!\x1b[0m');
      originalConsoleLog('\x1b[32mYour session has been created.\x1b[0m');
      originalConsoleLog('\x1b[32m==================================\x1b[0m\n');
      pairingSuccessful = true;
    }
  };

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
      
      // Check the specific error details to determine if session should be cleared
      const errorData = (lastDisconnect?.error as Boom)?.data;
      const errorMessage = (lastDisconnect?.error as Boom)?.output?.payload?.message;
      
      // Only clear session for specific authentication errors
      // DisconnectReason.loggedOut (401) means we're definitely logged out
      // But temporary connection issues should preserve the session
      if (statusCode === 515) {
        // 515 error is almost always a success case after pairing
        // The "Stream Errored (restart required)" is normal behavior when WhatsApp
        // completes pairing and needs to restart the connection
        console.log('\n\x1b[32m==================================\x1b[0m');
        console.log('\x1b[32mSUCCESS! WhatsApp Session Created Successfully\x1b[0m');
        console.log('\x1b[32m==================================\x1b[0m');
        console.log('\x1b[32mDon\'t worry about the "error" message - this is normal.\x1b[0m');
        console.log('\x1b[32mThe 515 error simply means WhatsApp needs to restart\x1b[0m');
        console.log('\x1b[32mafter creating your session. This is expected behavior.\x1b[0m');
        console.log('\n\x1b[32mYour session is now ready! You can run:\x1b[0m');
        console.log('\x1b[36mpnpm start\x1b[0m - To start the WhatsApp message storage service');
        console.log('\x1b[36mpnpm fetch-group-ids\x1b[0m - To fetch group IDs from WhatsApp');
        console.log('\x1b[32m==================================\x1b[0m\n');
        process.exit(0);
      } else if (statusCode === DisconnectReason.loggedOut && errorMessage === 'Logged Out') {
        // Session is definitely invalid, clear it and try again
        console.log('\n\x1b[33m==================================\x1b[0m');
        console.log('\x1b[33mExplicitly logged out (status: ' + statusCode + ')\x1b[0m');
        console.log('\x1b[33mClearing session and restarting...\x1b[0m');
        console.log('\x1b[33m==================================\x1b[0m\n');
        
        // Clear the session and try again
        clearSessionDirectory();
        
        // Restart login process with a fresh session
        // Use a short timeout to allow the first connection to be properly closed
        setTimeout(() => {
          console.log('Restarting login process with clean session...');
          loginToWhatsApp();
        }, 1000);
      } else if (statusCode === 401) {
        // Any 401 Unauthorized error means the session is invalid
        // This could be Connection Failure, device_removed, etc.
        // Check for specific cases in the error data
        const errorData = (lastDisconnect?.error as Boom)?.data;
        let errorDetails = '';
        
        // Check for device_removed conflict
        if (errorData?.content?.[0]?.tag === 'conflict' && 
            errorData?.content?.[0]?.attrs?.type === 'device_removed') {
          errorDetails = ' (device removed)'; 
        }
        
        console.log('\n\x1b[33m==================================\x1b[0m');
        console.log(`\x1b[33mSession invalid (401 Unauthorized)${errorDetails}\x1b[0m`);
        console.log('\x1b[33mClearing session and creating a new one...\x1b[0m');
        console.log('\x1b[33m==================================\x1b[0m\n');
        
        // Clear the session and try again
        clearSessionDirectory();
        
        // Restart login process with a fresh session
        setTimeout(() => {
          console.log('Restarting login process with clean session...');
          loginToWhatsApp();
        }, 1000);
      } else {
        console.log(`\n\x1b[31m==================================\x1b[0m`);
        console.log(`\x1b[31mConnection closed with status: ${statusCode}\x1b[0m`);
        console.log(`\x1b[31m==================================\x1b[0m\n`);
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
