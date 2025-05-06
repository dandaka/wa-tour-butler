/**
 * File and CSV utility functions for the WhatsApp Tournament Butler
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { GroupInfo } from '../types/signups';
import { GROUPS_CSV_PATH, OUTPUT_DIR } from '../constants';

/**
 * Ensure a directory exists, create it if it doesn't
 * @param dirPath Path to the directory
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get group information from the CSV file
 * @param groupId WhatsApp group ID to find
 * @returns Promise that resolves to the group info or null if not found
 */
export async function getGroupInfo(groupId: string): Promise<GroupInfo | null> {
  return new Promise((resolve) => {
    const results: GroupInfo[] = [];
    
    fs.createReadStream(GROUPS_CSV_PATH)
      .pipe(csv())
      .on('data', (data: any) => {
        // Adjust for potential column name issues
        const groupInfo: GroupInfo = {
          id: data.ID || data.id,
          name: data.Name || data.name,
          admin: data.Admin || data.admin,
          // Handle missing or empty fields
          tournamentTime: (data.TournamentTime || data.tournamentTime || '').trim(),
          signupStartTime: (data.SignupStartTime || data.signupStartTime || '').trim(),
          maxTeams: parseInt(data.MaxTeams || data.maxTeams || '0')
        };
        
        results.push(groupInfo);
      })
      .on('end', () => {
        const group = results.find(g => g.id === groupId);
        resolve(group || null);
      });
  });
}

/**
 * Parse a CSV file into an array of objects
 * @param filePath Path to the CSV file
 * @returns Promise that resolves to an array of objects
 */
export async function parseCsvFile<T = Record<string, any>>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: any) => results.push(data as T))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Write content to a file, creating directories if needed
 * @param filePath Path to the output file
 * @param content Content to write
 */
export function writeToFile(filePath: string, content: string): void {
  // Ensure the directory exists
  const dirPath = path.dirname(filePath);
  ensureDirectoryExists(dirPath);
  
  // Write the file
  fs.writeFileSync(filePath, content);
}

/**
 * Create an output file path for a group
 * @param groupName Name of the WhatsApp group
 * @param extension File extension (default: 'md')
 * @returns Path to the output file
 */
export function createOutputFilePath(groupName: string, extension: string = 'md'): string {
  const fileName = groupName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return path.join(OUTPUT_DIR, `${fileName}.${extension}`);
}

/**
 * Create a log file path for a group
 * @param groupName Name of the WhatsApp group
 * @returns Path to the log file
 */
export function createLogFilePath(groupName: string): string {
  const fileName = groupName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return path.join(OUTPUT_DIR, 'logs', `${fileName}.log`);
}
