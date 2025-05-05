/**
 * Process All Groups Script
 * 
 * This script processes signup data for all groups listed in GROUPS.csv
 * Each group's results are saved to a separate file in data/signup-results/
 * Logs for each group are saved to separate log files
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import csv from 'csv-parser';

// Output directory for results and logs
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'signup-results');
const LOG_DIR = path.join(process.cwd(), 'data', 'logs');

// Use a specific timestamp that works for processing these messages
// May 5, 2025, 6:58:55 PM - this is known to work with the existing messages
const REGISTRATION_TIMESTAMP = 1746467935;

interface GroupInfo {
  ID: string;
  Name: string;
  Admin: string;
  TournamentTime: string;
  SignupStartTime: string;
  MaxTeams: string;
}

/**
 * Ensure output directories exist
 */
function ensureDirectories(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Process a single group using the signup parser
 */
function processGroup(group: GroupInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create safe filename from group name
    const safeGroupName = group.Name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    
    // Output paths
    const outputFile = path.join(OUTPUT_DIR, `${safeGroupName}.md`);
    const logFile = path.join(LOG_DIR, `${safeGroupName}.log`);
    
    console.log(`Processing group: ${group.Name} (${group.ID})`);
    console.log(`Output file: ${outputFile}`);
    console.log(`Log file: ${logFile}`);
    
    // Create write streams for logs
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    
    // Run the process-signups.ts script
    const process = spawn('ts-node', [
      'src/scripts/process-signups.ts',
      group.ID,
      outputFile,
      REGISTRATION_TIMESTAMP.toString()
    ]);
    
    // Pipe stdout and stderr to log file
    process.stdout.pipe(logStream);
    process.stderr.pipe(logStream);
    
    // Handle process completion
    process.on('close', (code) => {
      if (code === 0) {
        console.log(`Successfully processed group: ${group.Name}`);
        resolve();
      } else {
        console.error(`Error processing group: ${group.Name}, exit code: ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

/**
 * Read groups from CSV and process each one
 */
async function processAllGroups(): Promise<void> {
  const groups: GroupInfo[] = [];
  
  // Ensure output directories exist
  ensureDirectories();
  
  // Read the GROUPS.csv file
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(path.join(process.cwd(), 'GROUPS.csv'))
      .pipe(csv())
      .on('data', (data: GroupInfo) => {
        groups.push(data);
      })
      .on('end', () => {
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
  });
  
  console.log(`Found ${groups.length} groups to process`);
  
  // Process each group sequentially
  for (const group of groups) {
    try {
      await processGroup(group);
    } catch (error) {
      console.error(`Error processing group ${group.Name}:`, error);
    }
  }
  
  console.log('All groups processed!');
}

// Run the script
processAllGroups().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
