// WA Padel Tournament Butler - Main Application Entry
import { startWhatsAppConnection } from './whatsapp/connection';
import { setupMessageHandlers } from './handlers/messageHandler';
import logger from './utils/logger';

async function bootstrap() {
  try {
    logger.info('Starting WA Tournament Butler...');
    
    // Start WhatsApp connection
    const sock = await startWhatsAppConnection();
    
    // Set up message handlers
    setupMessageHandlers(sock);
    
    logger.info('WA Tournament Butler is running!');
    
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      // Perform cleanup
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start the application:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();
