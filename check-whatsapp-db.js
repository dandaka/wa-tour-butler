#!/usr/bin/env node

// Script to check for and examine whatsapp_messages.db
const betterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Group ID for the Kia4all group
const GROUP_ID = '351919755889-1528547030@g.us';
// Target timestamp - after the Carlos Lopes signup
const TARGET_TIMESTAMP = 1746397694; // 5/5/2025, 4:08:14 PM

// Find all potential database files
function findDatabaseFiles() {
  const potentialPaths = [
    path.resolve(process.cwd(), 'data/whatsapp_messages.db'),
    path.resolve(process.cwd(), 'session/whatsapp_messages.db'),
    path.resolve(process.cwd(), 'whatsapp_messages.db'),
    // Also check for any db files with "whatsapp" in the name
    ...findFiles(process.cwd(), 'whatsapp')
  ];
  
  console.log("Searching for WhatsApp database files...");
  
  const existingFiles = potentialPaths.filter(p => fs.existsSync(p));
  
  if (existingFiles.length === 0) {
    console.log("No WhatsApp database files found in the expected locations.");
    // Also list all .db files to help locate the right one
    const allDbFiles = findFiles(process.cwd(), '.db');
    console.log(`\nFound ${allDbFiles.length} total .db files:`);
    allDbFiles.forEach(file => console.log(` - ${file}`));
    return [];
  }
  
  console.log(`Found ${existingFiles.length} potential WhatsApp database files:`);
  existingFiles.forEach(file => console.log(` - ${file}`));
  return existingFiles;
}

// Find files with specific naming pattern
function findFiles(dir, pattern, depth = 3) {
  if (depth <= 0) return [];
  if (!fs.existsSync(dir)) return [];

  try {
    const files = fs.readdirSync(dir);
    let results = [];

    for (const file of files) {
      if (file.startsWith('.') || file === 'node_modules') continue;
      
      const filePath = path.join(dir, file);
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          results = results.concat(findFiles(filePath, pattern, depth - 1));
        } else if (file.includes(pattern)) {
          results.push(filePath);
        }
      } catch (e) {
        // Skip files we can't access
      }
    }

    return results;
  } catch (e) {
    return [];
  }
}

// Examine a database file
function examineDatabase(dbPath) {
  console.log(`\nExamining database: ${dbPath}`);
  
  try {
    const db = new betterSqlite3(dbPath, { readonly: true });
    
    // List all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`Found ${tables.length} tables:`);
    tables.forEach(table => console.log(` - ${table.name}`));
    
    // For each table, examine schema and look for messages
    for (const table of tables) {
      console.log(`\nExamining table: ${table.name}`);
      
      // Get column info
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
      console.log(`Schema for ${table.name}:`);
      columns.forEach(col => console.log(` - ${col.name} (${col.type})`));
      
      // Get row count
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        console.log(`Row count: ${count.count}`);
        
        // If table has few rows or seems promising, show sample
        if (count.count > 0 && count.count < 1000) {
          const sample = db.prepare(`SELECT * FROM ${table.name} LIMIT 1`).get();
          console.log("Sample row:");
          console.log(JSON.stringify(sample, null, 2));
          
          // If this has content/message column, search for "eric" and "in com"
          const contentColumns = columns.filter(col => 
            col.name.toLowerCase().includes('message') || 
            col.name.toLowerCase().includes('content') ||
            col.name.toLowerCase().includes('text')
          ).map(col => col.name);
          
          if (contentColumns.length > 0) {
            console.log(`\nSearching for "eric" and "in com" in columns: ${contentColumns.join(', ')}`);
            
            for (const colName of contentColumns) {
              try {
                // Search for messages containing both "eric" and "in com" (case insensitive)
                const query = `SELECT * FROM ${table.name} WHERE 
                  LOWER(${colName}) LIKE ? AND LOWER(${colName}) LIKE ?`;
                const matches = db.prepare(query).all('%eric%', '%in com%');
                
                console.log(`Found ${matches.length} matching messages in column ${colName}`);
                
                if (matches.length > 0) {
                  matches.forEach((row, i) => {
                    console.log(`\nMatch ${i+1}:`);
                    console.log(`Content: "${row[colName]}"`);
                    
                    // Show all other columns too
                    Object.entries(row).forEach(([key, value]) => {
                      if (key !== colName) {
                        console.log(`${key}: ${value}`);
                      }
                    });
                  });
                }
              } catch (e) {
                console.log(`Error searching column ${colName}: ${e.message}`);
              }
            }
          }
        }
      } catch (e) {
        console.log(`Error getting row count: ${e.message}`);
      }
    }
  } catch (error) {
    console.error(`Error examining database: ${error.message}`);
  }
}

// Main function
function main() {
  const dbFiles = findDatabaseFiles();
  
  if (dbFiles.length > 0) {
    dbFiles.forEach(examineDatabase);
  }
}

// Run the script
main();
