/**
 * Time Formatting Utilities
 * 
 * This module provides utility functions for time extraction and formatting
 */

import { TIME_PATTERNS } from '../../constants';

/**
 * Extract time pattern from content
 * Handles various formats like 15h, 15:00, 15.00, etc.
 * 
 * @param content The text content to extract time from
 * @returns RegExpMatchArray if time found, null otherwise
 */
export function extractTimePattern(content: string): RegExpMatchArray | null {
  // For multi-time patterns like "15 and 17", capture the first time only
  if (TIME_PATTERNS.MULTIPLE_TIMES.test(content)) {
    const match = content.match(TIME_PATTERNS.MULTIPLE_TIMES);
    if (match) {
      // Use a separate variable to track multi-time patterns
      (match as any).isMultiTime = true;
      return match;
    }
  }

  // Try to match exact time formats like 13h30, 15:00, 17.00
  const hourMinutesMatch = content.match(TIME_PATTERNS.TIME_FORMAT_HOUR_MINUTES);
  if (hourMinutesMatch) {
    return hourMinutesMatch;
  }
  
  // Check for time at the end of a message
  const timeAtEndMatch = content.match(TIME_PATTERNS.TIME_AT_END);
  if (timeAtEndMatch) {
    return timeAtEndMatch;
  }
  
  // Check for numeric-only time (like "in 15")
  const numericTimeMatch = content.match(TIME_PATTERNS.NUMERIC_TIME);
  if (numericTimeMatch) {
    return numericTimeMatch;
  }
  
  // Last resort - try to match just a simple hour
  const hourOnlyMatch = content.match(TIME_PATTERNS.TIME_FORMAT_HOUR_ONLY);
  if (hourOnlyMatch) {
    return hourOnlyMatch;
  }
  
  return null;
}

/**
 * Format extracted time matches into a consistent format
 * 
 * @param timeMatch RegExpMatchArray or string containing time information
 * @returns Formatted time string in "HH:MM" format
 */
export function formatTimeMatch(timeMatch: RegExpMatchArray | string): string {
  // Convert string to a format we can process (treat it as a simple hour)
  if (typeof timeMatch === 'string') {
    // Simple format: if just numbers, treat as hours
    const hourMatch = timeMatch.match(/^(\d{1,2})([:.]?(\d{1,2}))?h?$/);
    if (hourMatch) {
      const hour = hourMatch[1];
      const minutes = hourMatch[3] || '00';
      return `${hour}:${minutes}`;
    }
    return timeMatch; // Return as is if we can't parse it
  }
  
  // Handle multi-time pattern (e.g., "15 and 17")
  if ((timeMatch as any).isMultiTime) {
    return `${timeMatch[1]}:00`; // Just take the first time
  }

  // For matches from TIME_FORMAT_HOUR_MINUTES pattern
  if (timeMatch[1] && timeMatch[2]) {
    // Format like "15:00", "15:30h", "15h30", "15.00"
    const hour = timeMatch[1];
    const minutes = timeMatch[2].padEnd(2, '0');
    return `${hour}:${minutes}`;
  } 
  
  // For matches that just have hour (including numeric-only times)
  else if (timeMatch[1]) {
    // Format like "15", "15h"
    return `${timeMatch[1]}:00`;
  }
  
  return "";
}
