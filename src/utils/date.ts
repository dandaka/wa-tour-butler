/**
 * Date and time utility functions for the WhatsApp Tournament Butler
 */

/**
 * Format a date as YYYY-MM-DD HH:MM:SS
 * @param date The date to format
 * @returns Formatted date string
 */
export function formatDateYYYYMMDDHHMMSS(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

/**
 * Format a date as HH:MM:SS
 * @param date The date to format
 * @returns Formatted time string
 */
export function formatTimeHHMMSS(date: Date): string {
  return date.toTimeString().split(' ')[0];
}

/**
 * Format a timestamp to a human-readable date and time
 * @param timestamp Unix timestamp in seconds
 * @returns Formatted date and time string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return formatDateYYYYMMDDHHMMSS(date);
}

/**
 * Parse a time string like "15h00" or "15:00" into hours and minutes
 * @param timeStr Time string to parse
 * @returns An object with hours and minutes, or null if parsing fails
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  // Handle different time formats: 15h, 15h00, 15:00, 15.00
  const timeMatch = timeStr.match(/(\d+)[h:.]*(\d*)/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    return { hours, minutes };
  }
  return null;
}

/**
 * Check if a string contains a time pattern (HH:MM, HHhMM, etc.)
 * @param content Text to check
 * @returns Boolean indicating if text contains a time pattern
 */
export function containsTimePattern(content: string): boolean {
  return /\d+[h:.]\d*|\d+h/.test(content);
}
