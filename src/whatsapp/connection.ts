import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeInMemoryStore,
  Browsers,
  WASocket,
} from 'baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
// Using console for logging instead of the logger module to avoid circular dependencies
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args)
};

// Using require for modules without TypeScript definitions
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrcode = require('qrcode-terminal');

// Store path for session data
const SESSION_DIR = path.join(process.cwd(), 'session');

/**
 * Ensure the session directory exists
 */
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log(`Created session directory at ${SESSION_DIR}`);
  }
}

/**
 * Clear the session directory to start fresh
 */
function clearSession() {
  if (fs.existsSync(SESSION_DIR)) {
    // Read all files in the directory
    const files = fs.readdirSync(SESSION_DIR);
    
    // Delete each file
    for (const file of files) {
      const filePath = path.join(SESSION_DIR, file);
      fs.unlinkSync(filePath);
      console.log(`Deleted session file: ${file}`);
    }
    
    console.log('Session cleared successfully');
  } else {
    console.log('No session directory found');
  }
}

// Ensure directory exists on startup
ensureSessionDir();

// Path for message store
const STORE_PATH = path.join(process.cwd(), 'store.json');

/**
 * Start WhatsApp connection using Baileys
 */
export async function startWhatsAppConnection(): Promise<WASocket> {
  // Initialize message store
  const store = makeInMemoryStore({});
  store.readFromFile(STORE_PATH);
  
  // Save store every 10 seconds
  setInterval(() => {
    store.writeToFile(STORE_PATH);
  }, 10_000);
  
  // Initialize auth state
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  
  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    browser: Browsers.macOS('Chrome'),
  });
  
  // Set up store for socket
  store.bind(sock.ev);
  
  // Handle connection events
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    
    // If QR code is received, display it in terminal
    if (qr) {
      logger.info('Scan the QR code below to login:');
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const errorMessage = (lastDisconnect?.error as Error)?.message || 'Unknown error';
      
      logger.info(`Connection closed with status code: ${statusCode}, error: ${errorMessage}`);
      
      // Handle different disconnect scenarios
      if (statusCode === DisconnectReason.loggedOut) {
        logger.info('Logged out from WhatsApp, clearing session');
        // Clear session data here if needed
        return;
      } else if (statusCode === 440 && errorMessage.includes('conflict')) {
        logger.info('Session conflict detected - this device was probably logged in elsewhere');
        logger.info('Clearing session data and preparing for a fresh login');
        clearSession();
        logger.info('Session cleared. Please restart the application to get a fresh session.');
        return;
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        logger.info('Connection replaced by another session');
        return;
      } else if (statusCode === DisconnectReason.connectionClosed) {
        logger.info('Connection closed by server, reconnecting...');
        setTimeout(async () => {
          await startWhatsAppConnection();
        }, 3000);
        return;
      }
      
      // For other errors, attempt reconnection with backoff
      logger.info('Attempting to reconnect in 5 seconds...');
      setTimeout(async () => {
        await startWhatsAppConnection();
      }, 5000);
      
    } else if (connection === 'open') {
      logger.info('Connection opened successfully');
      logger.info('Waiting for messages in WhatsApp groups...');
    }
  });
  
  // Save credentials whenever they change
  sock.ev.on('creds.update', saveCreds);
  
  return sock;
}
