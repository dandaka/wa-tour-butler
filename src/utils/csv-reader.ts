/**
 * CSV Reader Utility
 * 
 * This module provides utilities for reading CSV files,
 * particularly the groups.csv file with tournament group information.
 */

import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { GroupInfo } from '../types/signups';

/**
 * Parse a CSV line properly handling quoted values
 * 
 * @param line CSV line to parse
 * @returns Array of values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;
  
  // Process character by character to handle quoted values with commas
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // Toggle quote state
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      // End of field
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      // Add to current field
      currentValue += char;
    }
  }
  
  // Add the last field
  values.push(currentValue.trim());
  
  // Remove quotes from all values
  return values.map(value => {
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.substring(1, value.length - 1);
    }
    return value;
  });
}

/**
 * Read groups from CSV file
 * 
 * @param csvPath Path to the CSV file
 * @returns Array of group info objects
 */
export function readGroupsFromCsv(csvPath: string): GroupInfo[] {
  try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    
    // Split into lines and filter out empty ones
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    
    // Parse header line
    const headers = parseCSVLine(lines[0]);
    
    // Parse data lines
    const records = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const record: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        if (index < values.length) {
          record[header] = values[index];
        }
      });
      
      return record;
    });
    
    // Map CSV records to GroupInfo objects
    return records.map((record: any) => {
      // Process batches field - split by comma if present
      let batches: string[] | undefined = undefined;
      if (record.Batches && record.Batches.trim() !== '') {
        batches = record.Batches.split(',').map((batch: string) => batch.trim());
      }
      
      return {
        id: record.ID,
        name: record.Name,
        admin: record.Admin,
        tournamentTime: record.TournamentTime || undefined,
        signupStartTime: record.SignupStartTime || undefined,
        maxTeams: record.MaxTeams ? parseInt(record.MaxTeams, 10) : undefined,
        batches: batches
      };
    });
    
  } catch (error) {
    console.error(`Error reading groups from CSV: ${error}`);
    return [];
  }
}

/**
 * Find a specific group in the CSV file
 * 
 * @param groupId ID of the group to find
 * @param csvPath Path to the CSV file
 * @returns Group info or null if not found
 */
export function findGroupInCsv(groupId: string, csvPath: string): GroupInfo | null {
  const groups = readGroupsFromCsv(csvPath);
  const group = groups.find(g => g.id === groupId);
  
  return group || null;
}
