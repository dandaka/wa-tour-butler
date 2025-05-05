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

interface ContactInfo {
  jid?: string;
  name?: string;
  notify?: string;
  short_name?: string;
  push_name?: string;
  is_group?: boolean;
}

// Database connection
const db = new Database('./data/whatsapp_messages.db');

// Parse command line arguments
const args = process.argv.slice(2);
let chatId: string | null = null;
let limit = 20;
let messageFilter: string | null = null;
let compactView = false;

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
  } else if (args[i] === '--compact') {
    compactView = true;
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
  console.log('  --compact            Show only chat IDs and names in a compact format');
  console.log('  --help               Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  pnpm view-db                          Show list of all chats');
  console.log('  pnpm view-db --compact               Show compact list of all chats');
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
    
    if (compactView) {
      // Compact view - just show chat IDs and names
      console.log('\nChat ID | Display Name');
      console.log('----------------------------');
      
      chats.forEach((chat) => {
        console.log(`${chat.chat_id} | ${getContactDisplayName(chat.chat_id)}`);
      });
    } else {
      // Full view with all details
      console.log('\nAvailable Chats:');
      console.log('----------------');
      
      chats.forEach((chat, index) => {
        const lastMessageDate = new Date(Number(chat.last_message_time) * 1000).toLocaleString();
        const lastMessage = chat.last_message ? 
          (chat.last_message.length > 30 ? chat.last_message.substring(0, 30) + '...' : chat.last_message) : 
          '[NO MESSAGE]';
        
        console.log(`${index + 1}. Chat: ${getContactDisplayName(chat.chat_id)}`);
        console.log(`   Chat ID: ${chat.chat_id}`);
        console.log(`   Messages: ${chat.message_count}`);
        console.log(`   Last message: ${lastMessageDate}`);
        console.log(`   Preview: ${lastMessage}`);
        console.log('');
      });
      
      console.log('\nTo view messages from a specific chat, use:');
      console.log('pnpm view-db --chat <chat_id>');
    }
    
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
    
    // Get chat display name
    const chatName = getContactDisplayName(chatId);
    
    console.log(`\nMessages for chat: ${chatName} (${chatId})`);
    console.log(`Total messages in DB: ${chatInfo.total_messages}`);
    if (messageFilter) {
      console.log(`Filtering for messages containing: "${messageFilter}"`);
    }
    console.log(`Showing ${Math.min(limit, messages.length)} most recent messages`);
    console.log('----------------------------------------------\n');
    
    // Display messages in chronological order (oldest first)
    messages.reverse().forEach((msg, index) => {
      const date = new Date(Number(msg.timestamp) * 1000).toLocaleString();
      const senderName = msg.is_from_me ? 'You' : getContactDisplayName(msg.sender);
      
      console.log(`[${date}] ${senderName}:`);
      console.log(`${msg.content}`);
      if (!compactView) {
        console.log(`(${msg.message_type}, ID: ${msg.id})`);
      }
      console.log('');
    });
    
  } catch (err) {
    console.error('Error retrieving messages:', err);
  }
}

// Helper function to get contact display name from chat ID
function getContactDisplayName(jid: string): string {
  try {
    // First try to get the name from the contacts table
    const contactInfo = db.prepare(`
      SELECT name, notify, push_name, is_group 
      FROM contacts 
      WHERE jid = ?
    `).get(jid) as ContactInfo | undefined;
    
    if (contactInfo) {
      // Use the best available name
      if (contactInfo.name) {
        return contactInfo.name;
      } else if (contactInfo.notify) {
        return contactInfo.notify;
      } else if (contactInfo.push_name) {
        return contactInfo.push_name;
      }
    }
    
    // If we don't have the contact info, fall back to formatting the JID
    // Check if it's a group chat
    if (jid.endsWith('@g.us')) {
      // Look for known patterns
      if (jid.includes('Dom19h Saldanha P4ALL M4+')) {
        return 'Dom19h Saldanha P4ALL M4+';
      }
      
      const isNumericGroup = /^\d+-\d+@g\.us$/.test(jid);
      if (isNumericGroup) {
        // Extract the creation timestamp part which might help identify the group
        const parts = jid.split('@')[0].split('-');
        if (parts.length >= 2) {
          // Format as "Phone ending with XXXXX - Group created on YYYY"
          const phoneNumber = parts[0].substring(Math.max(0, parts[0].length - 5));
          const timestamp = parseInt(parts[1].substring(0, 10));
          if (!isNaN(timestamp)) {
            // If it's a valid timestamp, show a formatted date
            try {
              const date = new Date(timestamp * 1000);
              const dateStr = date.toLocaleDateString();
              return `Group by ${phoneNumber} (${dateStr})`;
            } catch (e) {
              // If date parsing fails
              return `Group ${phoneNumber}-${parts[1].substring(0, 4)}`;
            }
          }
        }
      }
      
      // Format modern group IDs (they often start with numbers like 120363...)
      if (jid.startsWith('120363')) {
        // These are newer group formats
        return `WhatsApp Group ${jid.substring(6, 12)}`;
      }
      
      return `Group ${jid.split('@')[0]}`;
    } else {
      // For regular contacts
      // Format phone numbers nicely
      return formatPhoneNumber(jid.split('@')[0]);
    }
  } catch (err) {
    console.error(`Error getting display name for ${jid}:`, err);
    return jid.split('@')[0]; // Fallback to just the ID
  }
}

// Helper to format phone numbers
function formatPhoneNumber(phone: string): string {
  try {
    // Try to detect country code and format accordingly
    if (phone.startsWith('351')) { // Portugal
      // Format for Portugal: +351 XX XXX XXXX
      return formatWithPattern(phone, '+351', [3, 5, 9]);
    } else if (phone.startsWith('7')) { // Russia
      // Format for Russia: +7 XXX XXX XXXX
      return formatWithPattern(phone, '+7', [1, 4, 7]);
    } else if (phone.startsWith('1')) { // US/Canada
      // Format for US/Canada: +1 XXX XXX XXXX
      return formatWithPattern(phone, '+1', [1, 4, 7]);
    } else if (phone.startsWith('44')) { // UK
      // Format for UK: +44 XXXX XXX XXX
      return formatWithPattern(phone, '+44', [2, 6, 9]);
    } else if (phone.startsWith('33')) { // France
      // Format for France: +33 X XX XX XX XX
      return formatWithPattern(phone, '+33', [2, 3, 5, 7, 9]);
    } else if (phone.startsWith('49')) { // Germany
      // Format for Germany: +49 XXX XXXXXXX
      return formatWithPattern(phone, '+49', [2, 5]);
    } else {
      // Generic international format
      if (phone.length > 7) {
        return `+${phone.substring(0, 2)} ${phone.substring(2)}`;
      }
      return phone;
    }
  } catch (err) {
    return phone; // If anything goes wrong, just return the original
  }
}

// Format a phone number with a specific pattern
function formatWithPattern(phone: string, prefix: string, separatorPositions: number[]): string {
  try {
    // Remove the country code that's already in the prefix
    let number = phone.substring(prefix.length - 1);
    let formatted = prefix;
    let lastPos = 0;
    
    for (const pos of separatorPositions) {
      const adjustedPos = pos - prefix.length + 1;
      if (adjustedPos > 0 && adjustedPos < number.length) {
        formatted += ' ' + number.substring(lastPos, adjustedPos);
        lastPos = adjustedPos;
      }
    }
    
    // Add remaining digits
    if (lastPos < number.length) {
      formatted += ' ' + number.substring(lastPos);
    }
    
    return formatted;
  } catch (err) {
    // If anything goes wrong, return the original number
    return `+${phone}`;
  }
}
