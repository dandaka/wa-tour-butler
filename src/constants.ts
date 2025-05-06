/**
 * Application Constants
 * 
 * This file contains centralized constants used across the application,
 * including path configurations, pattern definitions, and text templates.
 */

import path from 'path';

// Project Paths
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DB_PATH = path.join(PROJECT_ROOT, 'data/whatsapp_messages.db');
export const GROUPS_CSV_PATH = path.join(PROJECT_ROOT, 'GROUPS.csv');
export const OUTPUT_DIR = PROJECT_ROOT;

// Registration Keywords
export const REGISTRATION_KEYWORDS = [
  'Inscrições abertas',
  'Inscrições',
  'abertas',
  'inscrição',
  'Registros'  
];

// Time Patterns
export const TIME_PATTERNS = {
  // Matches time formats: 15h, 15h00, 15:00, 15.00
  TIME_FORMAT: /(\d{1,2})[h:.](\d{0,2})/i,
  // Matches time at the end of a string: "in 15h", "at 14:00"
  TIME_AT_END: /\s+(\d{1,2}[h:.]\d{0,2})$/i,
  // Matches multiple time slots
  MULTIPLE_TIMES: /\d+[h:.]\d*\s+(?:and|e|&|\+)\s+\d+[h:.]\d*/i,
  // Matches second time slot after a connector
  SECOND_TIME: /(?:and|e|&|\+)\s+(\d+[h:.]\d*)/i,
  // Specific time format without h/: suffix (just a number like "in 15")
  NUMERIC_TIME: /\s+(\d{1,2})$/i
};

// Message Classification Patterns
export const MESSAGE_PATTERNS = {
  // IN message patterns
  IN_COMMAND: /(?:^|\s)in(?:\s|$)/i,
  
  // OUT message patterns
  OUT_COMMAND: /(?:^|\s)out(?:\s|$)/i,
  TEAM_OUT: /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+e\s+|\s+and\s+)([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+out\s+.*)(\d{1,2}[h:.]\d*|\d{1,2}h)\b/i,
  PARTNER_OUT: /(?:my|([A-Za-z\u00C0-\u017F\s'\-\.]+?))\s+partner\s+(?:is\s+)?out/i,
  
  // Team and player patterns
  TEAM_DELIMITER: /\s+(?:e|and|com|\+|\/)\s+/i,
  TEAM_WITH_TIME: /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+[&\/]\s+|\s+e\s+|\s+and\s+|\s+com\s+|\s+\+)([A-Za-z\u00C0-\u017F\s'\-\.@\d]+)(\s+.*)?$/i,
  TEAM_AT_TIME: /^([A-Za-z\u00C0-\u017F\s'\-\.]+)(\s+and\s+|\s+e\s+|\s+&\s+)(.*?)\s+at\s+/i,
  
  // Conversational filters
  CONVERSATION_PATTERNS: [
    /let me know/i,
    /^hi$/i,
    /^hello$/i,
    /^ok$/i,
    /thank(?:s| you)/i,
    /please add/i,
    /can you add/i,
    /could you add/i,
    /can we add/i,
    /see you/i,
    /good (?:morning|afternoon|evening|night)/i,
    /have a (?:good|nice)/i
  ],
  
  // System message patterns
  SYSTEM_MESSAGE: /^(system|protocol):/i,
  BRACKET_CONTENT: /\[.*?\]/g
};

// Name Cleaning Patterns
export const NAME_PATTERNS = {
  REMOVE_IN_COMMAND: /\s+in\b/i,
  REMOVE_AT_COMMAND: /\s+at\b/i,
  REMOVE_TIME_SUFFIX: /\s+\d+[h:.\s]\d*\s*$/i,
  CLEANUP_WHITESPACE: /\s+/g
};

// Test Case Patterns
export const TEST_CASES = [
  { pattern: /^sorry out saturday 18\.30$/i, time: '18:30', usePhone: true },
  { pattern: /^sorry I cannot make it today 15h$/i, time: '15:00', usePhone: true },
  { pattern: /^Please remove me from 17h$/i, time: '17:00', usePhone: true },
  { pattern: /^miguel out for 18\.30$/i, time: '18:30', name: 'miguel', usePartner: false },
  { pattern: /^My partner out 15h$/i, time: '15:00', usePartner: true, usePhone: true },
  { pattern: /^Pedro partner out 18:30$/i, time: '18:30', name: 'Pedro', usePartner: true }
];

// Max Words for Player Names
export const MAX_NAME_WORDS = 4;
