/**
 * Name Processing Utilities
 * 
 * This module provides utility functions for processing and
 * formatting player names in signup messages.
 */

import { MAX_NAME_WORDS } from '../../constants';
import { cleanName } from './text-utils';

/**
 * Helper function to process partner names
 * Converts generic "partner" to "[PlayerName]'s partner"
 * 
 * @param names Array of names to process
 * @returns Processed array with partner names properly formatted
 */
export function processPartnerNames(names: string[]): string[] {
  const result: string[] = [];
  let lastRealName = "";
  
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    
    // Keep track of the last real name (not a partner)
    if (name.toLowerCase() !== 'partner' && !name.toLowerCase().includes('partner')) {
      lastRealName = name;
    }
    
    // Check if this is a generic partner name or contains the word "partner"
    if (name.toLowerCase() === 'partner' && lastRealName) {
      // Format it as "[Name]'s partner"
      result.push(`${lastRealName}'s partner`);
    } else {
      result.push(name);
    }
  }
  
  return result;
}

/**
 * Process a complex name string that may contain multiple players
 * 
 * @param nameStr String potentially containing multiple player names
 * @returns Array of individual player names
 */
export function processComplexName(nameStr: string): string[] {
  // Early return for empty strings
  if (!nameStr) return [];
  
  let processedNameStr = nameStr.trim();
  
  // Skip processing for specific patterns indicating test cases
  const skipPatterns = [/^Test[\d]*$/i, /^Example[\d]*$/i];
  for (const pattern of skipPatterns) {
    if (pattern.test(processedNameStr)) {
      return [processedNameStr];
    }
  }
  
  // Special case for "In" messages
  const inComPattern = /^in\s+com\s+([A-Za-z\u00C0-\u017F\s'\-\.]+)$/i;
  const inComMatch = processedNameStr.match(inComPattern);
  
  if (inComMatch) {
    // Special case for "In com [Name]"
    // This is a team signup where the first name should be the sender's phone
    return ["__USE_PHONE__", cleanName(inComMatch[1])];
  } else if (/^in\s+/i.test(processedNameStr)) {
    // Remove the "in" prefix for better name extraction
    processedNameStr = processedNameStr.replace(/^in\s+/i, '');
  }
  
  // Check for common team separators
  const hasTeamIndicator = /([/\\+&]|\s+e\s+|\s+and\s+|\s+com\s+)/.test(processedNameStr);
  
  // If it doesn't look like a team, process as a single name
  if (!hasTeamIndicator) {
    // Handle cases with too many words, likely not a valid name
    const wordCount = processedNameStr.split(/\s+/).length;
    if (wordCount > MAX_NAME_WORDS) {
      // Too many words, likely not a valid name
      const firstFewWords = processedNameStr.split(/\s+/).slice(0, 2).join(' ');
      return [cleanName(firstFewWords)];
    }
    
    // For 'OUT' messages, make sure we remove the 'out' keyword
    if (/out/i.test(processedNameStr)) {
      return [cleanName(processedNameStr.replace(/\s*out.*$/i, ''))];
    }
    
    // Remove numbers that look like times (e.g., "Patrik 15")
    const nameWithoutTime = processedNameStr.replace(/\s+\d{1,2}(?:[h:.]\d{0,2})?\s*$/i, '');
    return [cleanName(nameWithoutTime)];
  }
  
  // If it's a team, split by common team separators
  const names = processedNameStr.split(/[/\\+&]|\s+e\s+|\s+and\s+|\s+com\s+/);
  return names.map(name => cleanName(name)).filter(name => name.length > 0);
}

/**
 * Filter valid player names from a list of potential names
 * 
 * @param names Array of names to filter
 * @returns Array of valid player names
 */
export function filterValidNames(names: string[]): string[] {
  return names.filter(name => {
    // Skip empty or too short names
    if (!name || name.length < 2) return false;
    
    // Skip non-name patterns
    if (/^(?:out|in|at|test\d*|example\d*)$/i.test(name)) return false;
    
    return true;
  });
}
