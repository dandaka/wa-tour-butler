/**
 * Message pattern utility functions
 * 
 * Helper functions to determine if messages contain explicit names
 * or if we should use contact names as fallbacks
 */

/**
 * Determines if a message content appears to contain an explicit player name
 * Returns false if it's just commands (in, out) or just time indicators
 * 
 * @param content Message content to analyze
 * @returns true if the message appears to contain a name, false otherwise
 */
export function messageContainsExplicitName(content: string): boolean {
  // Simple case - empty message has no name
  if (!content.trim()) return false;
  
  // Messages with just "in" or "out" alone have no name
  if (/^\s*(in|out)\s*$/i.test(content.trim())) return false;
  
  // Messages with just a time pattern have no name
  if (/^\s*\d{1,2}[h:\.]?(\d{2})?\s*$/i.test(content.trim())) return false;
  
  // Messages with just "in" + time have no name
  if (/^\s*in\s+\d{1,2}[h:\.]?(\d{2})?\s*$/i.test(content.trim())) return false;
  
  // Messages with just common OUT phrases have no explicit name
  const commonOutPhrases = [
    /^\s*sorry\s+out\b/i,
    /^\s*sorry\s+out\s+today\b/i,
    /^\s*cannot\s+make\s+it\b/i,
    /^\s*can't\s+make\s+it\b/i,
    /^\s*please\s+remove\s+me\b/i,
    /^\s*out\s+today\b/i,
    /^\s*out\s+please\b/i,
    /^\s*can't\s+come\b/i
  ];
  
  if (commonOutPhrases.some(phrase => phrase.test(content.trim()))) return false;
  
  // If we've passed all the checks, assume the message has a name
  return true;
}
