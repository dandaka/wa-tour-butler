import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Target group name to display messages from
const TARGET_GROUP_NAME = "Dom19h Saldanha P4ALL M4+";

// SQLite database path
const DB_PATH = path.join(process.cwd(), 'group_messages.db');

// ANSI color codes for better readability
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
    gray: '\x1b[100m',
  }
};

/**
 * Format a timestamp into a readable date string using YYYY-MM-DD HH:MM:SS format
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  
  // Format as YYYY-MM-DD HH:MM:SS
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format a phone number for display
 */
function formatPhoneNumber(phoneNumber: string | null): string {
  if (!phoneNumber) return 'Unknown';
  
  // Remove the @s.whatsapp.net suffix if present
  let formatted = phoneNumber.replace('@s.whatsapp.net', '');
  
  // If it's already a nice name or contains non-numeric chars, return as is
  if (!/^\d+$/.test(formatted)) {
    return formatted;
  }
  
  // Otherwise format as a phone number with country code
  if (formatted.length > 9) {
    // Assume international format with country code
    return formatted.replace(/(\d{2,3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4');
  } else {
    return formatted;
  }
}

/**
 * Main function to display all messages from the target group
 */
async function displayGroupMessages() {
  console.log(`\n${COLORS.bright}${COLORS.fg.cyan}==== WhatsApp Messages from "${TARGET_GROUP_NAME}" ====${COLORS.reset}\n`);
  
  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`${COLORS.fg.red}Error: Database file not found at ${DB_PATH}${COLORS.reset}`);
    console.error(`${COLORS.fg.yellow}Please run the sync-messages script first to populate the database.${COLORS.reset}`);
    process.exit(1);
  }
  
  try {
    // Connect to the database
    const db = new Database(DB_PATH);
    
    // Find the group's JID
    const groupQuery = db.prepare('SELECT jid FROM groups WHERE name = ?');
    const group = groupQuery.get(TARGET_GROUP_NAME) as { jid: string } | undefined;
    
    if (!group) {
      console.error(`${COLORS.fg.red}Error: Group "${TARGET_GROUP_NAME}" not found in the database.${COLORS.reset}`);
      console.error(`${COLORS.fg.yellow}Please run the sync-messages script first to populate the database.${COLORS.reset}`);
      process.exit(1);
    }
    
    const groupJid = group.jid;
    
    // Get message count
    const countQuery = db.prepare('SELECT COUNT(*) as count FROM messages WHERE remoteJid = ?');
    const { count } = countQuery.get(groupJid) as { count: number };
    
    console.log(`${COLORS.fg.green}Found ${count} messages from this group in the database.${COLORS.reset}\n`);
    
    // Get the ordering option from command line arguments
    const newestFirst = process.argv.includes('--newest-first');
    
    // Get messages - default is oldest first, unless --newest-first flag is used
    const orderBy = newestFirst ? 'DESC' : 'ASC';
    
    // Determine limit from command line
    let limit = 0; // 0 means no limit
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
    if (limitArg) {
      limit = parseInt(limitArg.split('=')[1], 10) || 0;
    }
    
    let query = `
      SELECT m.*, p.name as participantName 
      FROM messages m 
      LEFT JOIN participants p ON m.participant = p.jid
      WHERE m.remoteJid = ? 
      ORDER BY m.timestamp ${orderBy}
    `;
    
    if (limit > 0) {
      query += ` LIMIT ${limit}`;
      console.log(`${COLORS.fg.yellow}Showing only the ${limit} ${newestFirst ? 'most recent' : 'oldest'} messages.${COLORS.reset}\n`);
    }
    
    const messagesQuery = db.prepare(query);
    const messages = messagesQuery.all(groupJid) as any[];
    
    // Display messages
    messages.forEach((msg, index) => {
      const timestamp = formatTimestamp(msg.timestamp);
      const sender = msg.fromMe ? 'You' : (msg.participantName || formatPhoneNumber(msg.participant));
      
      console.log(`${COLORS.dim}[${index + 1}/${count}] ${COLORS.reset}`);
      console.log(`${COLORS.fg.yellow}${timestamp}${COLORS.reset}`);
      console.log(`${COLORS.fg.cyan}${sender}:${COLORS.reset}`);
      console.log(`${msg.content}`);
      console.log(`${COLORS.dim}---${COLORS.reset}\n`);
    });
    
    // Display usage hints
    console.log(`${COLORS.fg.gray}TIP: Use --newest-first to show newest messages first${COLORS.reset}`);
    console.log(`${COLORS.fg.gray}TIP: Use --limit=10 to show only 10 messages${COLORS.reset}`);
    
    // Close database
    db.close();
  } catch (error) {
    console.error(`${COLORS.fg.red}Error accessing the database:${COLORS.reset}`, error);
    process.exit(1);
  }
}

// Run the script
displayGroupMessages().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
