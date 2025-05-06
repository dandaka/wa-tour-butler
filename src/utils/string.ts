/**
 * String manipulation utility functions for the WhatsApp Tournament Butler
 */

/**
 * Remove emoji and reaction markers from message content
 * @param content Original message content
 * @returns Cleaned message content
 */
export function removeEmojiAndReactions(content: string): string {
  // Remove reactions that look like "\uxxxx text"
  const noReactions = content.replace(/\u200e[^\s]+/g, '').trim();
  
  // Remove other common emoji characters
  return noReactions.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}

/**
 * Normalize whitespace in a string (replace multiple spaces with a single space)
 * @param text Text to normalize
 * @returns Normalized text
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize name case (capitalize first letter of each word)
 * @param name Name to format
 * @returns Formatted name
 */
export function formatName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract names from a team message like "Name1/Name2" or "Name1 and Name2"
 * @param namesText Text containing multiple names
 * @returns Array of individual names
 */
export function extractTeamNames(namesText: string): string[] {
  // Common separators in team messages
  const separators = [
    '/',  // Name1/Name2
    ' e ', // Name1 e Name2 (Portuguese)
    ' and ', // Name1 and Name2
    ' & ', // Name1 & Name2
    '+', // Name1+Name2
    ' with ', // Name1 with Name2
    ' com ' // Name1 com Name2 (Portuguese)
  ];
  
  let names: string[] = [namesText];
  
  // Try each separator
  for (const separator of separators) {
    if (namesText.toLowerCase().includes(separator.toLowerCase())) {
      names = namesText
        .split(new RegExp(separator, 'i'))
        .map(n => n.trim())
        .filter(Boolean);
      break;
    }
  }
  
  // Format each name
  return names.map(formatName);
}

/**
 * Check if text indicates an "OUT" message
 * @param text Text to check
 * @returns Boolean indicating if this is an OUT message
 */
export function isOutMessage(text: string): boolean {
  const lowerText = text.toLowerCase().trim();
  const outPatterns = [
    'out', 
    'saio', // Portuguese
    'fora', // Portuguese
    'não vou', // Portuguese
    'no puedo', // Spanish
    'can\'t make', 
    'cannot come',
    'won\'t be able'
  ];
  
  return outPatterns.some(pattern => lowerText.includes(pattern));
}

/**
 * Sanitize a group name for file naming
 * @param groupName Group name to sanitize
 * @returns Sanitized string safe for use in filenames
 */
export function sanitizeForFilename(groupName: string): string {
  return groupName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}
