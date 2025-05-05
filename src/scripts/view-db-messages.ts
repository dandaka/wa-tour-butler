import Database from 'better-sqlite3';
import { format } from 'util';

// Define types for database responses
interface ChatInfo {
  chat_id: string;
  message_count: number;
  last_message_time: number;
  last_message: string | null;
}

interface MessageInfo {
  id: string;
  chat_id: string;
  sender: string;
  timestamp: number;
  message_type: string;
  content: string;
  is_from_me: number;
}

interface ChatStats {
  total_messages: number;
}

// Database connection
const db = new Database('./data/whatsapp_messages.db');

// Parse command line arguments
const args = process.argv.slice(2);
let chatId: string | null = null;
let limit = 20;
let messageFilter: string | null = null;

// Process arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--chat' && i + 1 < args.length) {
    chatId = args[i + 1];
    i++;
  } else if (args[i] === '--limit' && i + 1 < args.length) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--message' && i + 1 < args.length) {
    messageFilter = args[i + 1];
    i++;
  } else if (args[i] === '--help') {
    showHelp();
    process.exit(0);
  }
}

// Show available chats if no chat_id is provided
if (!chatId) {
  showChats();
} else {
  // Show messages for the specified chat
  showMessages(chatId, limit, messageFilter);
}

// Close database connection when done
db.close();

// Function to show help text
function showHelp() {
  console.log('WhatsApp Message Viewer');
  console.log('----------------------');
  console.log('Usage:');
  console.log('  pnpm view-db [options]');
  console.log('');
  console.log('Options:');
  console.log('  --chat <chat_id>     Filter messages by chat ID');
  console.log('  --message <text>     Filter messages containing text');
  console.log('  --limit <number>     Limit number of messages (default: 20)');
  console.log('  --help               Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  pnpm view-db                          Show list of all chats');
  console.log('  pnpm view-db --chat 123456@g.us      Show messages from specific chat');
  console.log('  pnpm view-db --chat 123456@g.us --message "hello"  Show messages containing "hello"');
}

// Function to show available chats
function showChats() {
  try {
    const chats = db.prepare(`
      SELECT 
        chat_id, 
        COUNT(*) as message_count, 
        MAX(timestamp) as last_message_time,
        (SELECT content FROM messages WHERE chat_id = m.chat_id ORDER BY timestamp DESC LIMIT 1) as last_message
      FROM 
        messages m
      GROUP BY 
        chat_id
      ORDER BY 
        last_message_time DESC
    `).all() as ChatInfo[];
    
    if (chats.length === 0) {
      console.log('No chats found in the database.');
      return;
    }
    
    console.log('\nAvailable Chats:');
    console.log('----------------');
    
    chats.forEach((chat, index) => {
      const lastMessageDate = new Date(Number(chat.last_message_time) * 1000).toLocaleString();
      const lastMessage = chat.last_message ? 
        (chat.last_message.length > 30 ? chat.last_message.substring(0, 30) + '...' : chat.last_message) : 
        '[NO MESSAGE]';
      
      console.log(`${index + 1}. Chat: ${chat.chat_id}`);
      console.log(`   Messages: ${chat.message_count}`);
      console.log(`   Last message: ${lastMessageDate}`);
      console.log(`   Preview: ${lastMessage}`);
      console.log('');
    });
    
    console.log('\nTo view messages from a specific chat, use:');
    console.log('pnpm view-db --chat <chat_id>');
    
  } catch (err) {
    console.error('Error listing chats:', err);
  }
}

// Function to show messages for a specific chat
function showMessages(chatId: string, limit: number, messageFilter: string | null) {
  try {
    // Build the query
    let query = `
      SELECT 
        id, chat_id, sender, timestamp, message_type, content, is_from_me
      FROM 
        messages
      WHERE 
        chat_id = ?
    `;
    const params: any[] = [chatId];
    
    // Add message filter if provided
    if (messageFilter) {
      query += ` AND content LIKE ?`;
      params.push(`%${messageFilter}%`);
    }
    
    // Add ordering and limit
    query += `
      ORDER BY 
        timestamp DESC
      LIMIT ?
    `;
    params.push(limit);
    
    // Execute the query
    const messages = db.prepare(query).all(...params) as MessageInfo[];
    
    if (messages.length === 0) {
      console.log(`No messages found for chat ${chatId}${messageFilter ? ` containing "${messageFilter}"` : ''}.`);
      return;
    }
    
    // Get chat info
    const chatInfo = db.prepare(`
      SELECT 
        COUNT(*) as total_messages 
      FROM 
        messages 
      WHERE 
        chat_id = ?
    `).get(chatId) as ChatStats;
    
    console.log(`\nMessages for chat: ${chatId}`);
    console.log(`Total messages in DB: ${chatInfo.total_messages}`);
    if (messageFilter) {
      console.log(`Filtering for messages containing: "${messageFilter}"`);
    }
    console.log(`Showing ${Math.min(limit, messages.length)} most recent messages`);
    console.log('----------------------------------------------\n');
    
    // Display messages in chronological order (oldest first)
    messages.reverse().forEach((msg, index) => {
      const date = new Date(Number(msg.timestamp) * 1000).toLocaleString();
      const senderName = msg.is_from_me ? 'You' : msg.sender;
      
      console.log(`[${date}] ${senderName}:`);
      console.log(`${msg.content}`);
      console.log(`(${msg.message_type}, ID: ${msg.id})`);
      console.log('');
    });
    
  } catch (err) {
    console.error('Error retrieving messages:', err);
  }
}
