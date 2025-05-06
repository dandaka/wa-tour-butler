/**
 * WhatsApp History Fetch Script
 * 
 * This script sends a history sync request to WhatsApp for the last day
 * and then exits immediately. The history will be processed by a separate
 * always-on script that handles the WebSocket events.
 */

import { Boom } from '@hapi/boom';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  WAMessageKey
} from 'baileys'; // Using the standard baileys package as installed in the project
import P from 'pino';
import path from 'path';
import fs from 'fs';

// Set up logger
const logger = P({
  level: 'info'
});

// Auth state path - using the project's standard auth location
const AUTH_FOLDER_PATH = path.join(process.cwd(), 'auth_info_baileys');

// Script execution timeout (will force exit after this time)
const EXIT_TIMEOUT_MS = 10000; // 10 seconds

// Target groups to fetch history from (empty array means all chats)
const TARGET_GROUPS: string[] = [];
// Uncomment and add group IDs if you want to target specific groups
// const TARGET_GROUPS = ['123456789-1234567@g.us', '987654321-7654321@g.us'];

// Track reconnection attempts to prevent loops
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 1; // Only try to reconnect once

async function fetchWhatsAppHistory() {
  console.log('🚀 Starting WhatsApp history fetch request...');
  
  // Schedule the script to exit after timeout regardless of connection status
  const exitTimeoutId = setTimeout(() => {
    console.log(`\n⏱️ Exiting after ${EXIT_TIMEOUT_MS/1000} seconds timeout - no response from WhatsApp`);
    process.exit(0);
  }, EXIT_TIMEOUT_MS);
  
  try {
    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_FOLDER_PATH)) {
      fs.mkdirSync(AUTH_FOLDER_PATH, { recursive: true });
      console.log(`Created auth directory at ${AUTH_FOLDER_PATH}`);
    }
    
    // Use the auth state
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
    
    // Fetch latest version
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using WhatsApp v${version.join('.')}`);

    // Create WhatsApp socket connection with restart disabled
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: state.keys,
      },
      // Browser identification - use a different ID to avoid conflicts
      browser: ['Firefox (macOS)', 'Firefox', '115.0.3'],
      // Disable automatic reconnect to prevent conflicts with always-on handler
      connectTimeoutMs: 10000,
      // Add unique, random session ID to avoid conflicts
      markOnlineOnConnect: false
    });

    // Process events (only handle critical ones for this script)
    sock.ev.process(
      // Explicitly type events as any to avoid TypeScript errors
      async(events: any) => {
        // Handle connection updates
        if(events['connection.update']) {
          const update = events['connection.update'];
          const { connection, lastDisconnect } = update;
          
          if(connection === 'close') {
            // Handle connection close with specific error for conflict
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const errorMessage = (lastDisconnect?.error as Boom)?.message || '';
            
            if (statusCode === DisconnectReason.loggedOut) {
              console.log('Connection closed. You are logged out.');
              clearTimeout(exitTimeoutId);
              process.exit(1);
            } else if (errorMessage.includes('conflict') || errorMessage.includes('replaced')) {
              console.log('\n⚠️ Connection conflict detected - another WhatsApp session is active');
              console.log('This is normal if you have an always-on handler running');
              console.log('Exiting script - the active connection will receive history updates');
              clearTimeout(exitTimeoutId);
              process.exit(0);
            } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              console.log(`Connection closed unexpectedly. Attempting reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
              reconnectAttempts++;
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before reconnecting
              fetchWhatsAppHistory();
            } else {
              console.log('\n⚠️ Failed to maintain connection after multiple attempts.');
              console.log('Exiting script - check if your always-on handler is running');
              clearTimeout(exitTimeoutId);
              process.exit(1);
            }
          }
          
          if(connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            // Once connected, immediately request message history for the past day
            await requestOneDayHistory();
            
            // Don't wait for the response, exit after brief delay to allow request to be sent
            console.log('\n🔄 History sync request sent, exiting script');
            console.log('The always-on WebSocket handler will process the history when received');
            
            // Clear the timeout and set a shorter one to exit quickly after request is sent
            clearTimeout(exitTimeoutId);
            setTimeout(() => {
              process.exit(0);
            }, 2000); // Exit after 2 seconds
          }
        }

        // Update credentials
        if(events['creds.update']) {
          await saveCreds();
        }
      }
    );

    // Function to request history for the past day
    async function requestOneDayHistory() {
      try {
        // Get timestamp for 24 hours ago
        const oneDayAgoTimestamp = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        console.log(`Requesting message history since: ${new Date(oneDayAgoTimestamp * 1000).toISOString()}`);
        
        // If specific target groups are defined, request for each one
        if (TARGET_GROUPS.length > 0) {
          for (const groupId of TARGET_GROUPS) {
            console.log(`Requesting history for group: ${groupId}`);
            try {
              // Create a dummy key for this group
              const dummyKey: WAMessageKey = {
                remoteJid: groupId,
                id: '',
                fromMe: false
              };
              
              try {
                // Try reading messages - this may trigger a sync
                await sock.readMessages([dummyKey]);
                console.log(`Marked messages as read in ${groupId}`);
                
                // Request message history using the fetchMessageHistory API
                const messageId = await sock.fetchMessageHistory(50, dummyKey, oneDayAgoTimestamp);
                console.log(`Requested history for ${groupId}, request ID: ${messageId}`);
              } catch (syncErr: any) {
                console.log(`First approach failed: ${syncErr.message}`);
                // Try alternate approach without reading messages first
                const messageId = await sock.fetchMessageHistory(50, dummyKey, oneDayAgoTimestamp);
                console.log(`Requested history using alternate method, ID: ${messageId}`);
              }
            } catch (err: any) {
              console.error(`Error requesting history for ${groupId}: ${err.message}`);
            }
          }
        } else {
          // Otherwise, get all chats and try to fetch history for all
          console.log('Fetching chats list...');
          try {
            const chats = await sock.groupFetchAllParticipating();
            console.log(`Found ${Object.keys(chats).length} chats`);
            
            // Choose a recent chat to use as a trigger for history sync
            if (Object.keys(chats).length > 0) {
              const chatId = Object.keys(chats)[0];
              const someChat = chats[chatId];
              console.log(`Using chat ${someChat.subject || 'Unknown'} to trigger history sync`);
              
              // Create a dummy key for this chat
              const dummyKey: WAMessageKey = {
                remoteJid: chatId,
                id: '',
                fromMe: false
              };
              
              try {
                // Try reading messages - this may trigger a sync
                await sock.readMessages([dummyKey]);
                console.log(`Marked messages as read in ${chatId}`);
                
                // Request message history
                const messageId = await sock.fetchMessageHistory(50, dummyKey, oneDayAgoTimestamp);
                console.log(`Requested general history sync with ID: ${messageId}`);
              } catch (syncErr: any) {
                console.log(`Direct approach failed: ${syncErr.message}`);
                // Try alternate approach
                const messageId = await sock.fetchMessageHistory(50, dummyKey, oneDayAgoTimestamp);
                console.log(`Requested history using alternate method, ID: ${messageId}`);
              }
            } else {
              console.log('No chats found to request history from');
            }
          } catch (chatErr: any) {
            console.error(`Error fetching chats: ${chatErr.message}`);
          }
        }
      } catch (error: any) {
        console.error(`Error initiating history request: ${error.message}`);
      }
    }
  } catch (err: any) {
    console.error(`Fatal error: ${err.message}`);
    clearTimeout(exitTimeoutId);
    process.exit(1);
  }
}

// Start the history fetch process
fetchWhatsAppHistory();
