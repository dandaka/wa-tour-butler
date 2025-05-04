import { WASocket } from 'baileys';
import logger from '../utils/logger';

/**
 * Set up message handlers for incoming WhatsApp messages
 */
export function setupMessageHandlers(sock: WASocket) {
  // Listen for new messages
  sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[], type: string }) => {
    if (type !== 'notify') return;
    
    for (const message of messages) {
      // Skip messages that are from myself
      if (message.key.fromMe) continue;
      
      // Process incoming message
      handleIncomingMessage(sock, message);
    }
  });
  
  logger.info('Message handlers set up successfully');
}

/**
 * Process individual incoming messages
 */
async function handleIncomingMessage(sock: WASocket, message: any) {
  try {
    const chat = message.key.remoteJid;
    if (!chat) return;

    // Get the message content
    const messageContent = message.message?.conversation 
      || message.message?.extendedTextMessage?.text
      || '';
    
    // Skip empty messages
    if (!messageContent.trim()) return;
    
    // Check if it's a group
    const isGroup = chat.endsWith('@g.us');
    
    if (isGroup) {
      // Log group messages
      logger.info(`[GROUP] ${chat}: ${messageContent}`);
      
      // Reply with acknowledgment if needed
      // await sock.sendMessage(chat, { text: `Received: ${messageContent}` });
    } else {
      // Log direct messages
      logger.info(`[DM] ${chat}: ${messageContent}`);
    }
    
  } catch (error) {
    logger.error('Error handling message:', error);
  }
}

/**
 * Helper function to send text messages
 */
export async function sendTextMessage(sock: WASocket, to: string, text: string) {
  await sock.sendMessage(to, { text });
}
