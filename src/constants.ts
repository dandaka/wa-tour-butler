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
  BRACKET_CONTENT: /\[.*?\]/g,

  // Partner detection pattern
  PARTNER_PATTERN: /(?:^|\s)partner(?:\s|$)/i,
};

// Max Words for Player Names
export const MAX_NAME_WORDS = 4;
