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
  // Common formats: 15h, 15:00, 15:30h, 15.00
  TIME_FORMAT_HOUR_MINUTES: /\b(\d{1,2})(?::h?|h:?|\.)?(\d{2})?h?\b/i,
  // Simple hour format: 15h or just 15
  TIME_FORMAT_HOUR_ONLY: /\b(\d{1,2})h?\b/i,
  // Matches time at the end of a string: "in 15h", "at 14:00"
  TIME_AT_END: /\s+(\d{1,2}(?:[h:.]\d{0,2})?)$/i,
  // Matches multiple time slots - capturing the first time
  MULTIPLE_TIMES: /\b(\d{1,2})\s+(?:and|e|&|\+)\s+\d{1,2}\b/i,
  // Matches second time slot after a connector
  SECOND_TIME: /(?:and|e|&|\+)\s+(\d+[h:.]?\d*)/i,
  // Specific time format without h/: suffix (just a number like "in 15")
  NUMERIC_TIME: /\s+(\d{1,2})$/i
};

// Message Classification Patterns
export const MESSAGE_PATTERNS = {
  // IN message patterns
  IN_COMMAND: /(?:^|\s)in(?:\s|$)/i,
  
  // OUT message patterns
  OUT_COMMAND: /(?:^|\s)out(?:\s|$)/i,
  
  // Team and player patterns
  TEAM_DELIMITER: /\s+(?:e|and|com|\+|\/)\s+/i,

  TEAM_UP: /(?:team\s*up|team|jogo\s*com|jogamos\s*juntos)/i,
  
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
    /looking for/i,
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

// Max Words for Player Names
export const MAX_NAME_WORDS = 4;
