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
  TEAM_DELIMITERS: [
    /\s+e\s+/i,
    /\s+and\s+/i,
    /\s+with\s+/i,
    /\s+com\s+/i,
    /\s+\+\s+/i,
    /\s+\/\s+/i,
    /\s+\&\s+/i,
  ],

  // Team formation patterns
  TEAM_UP_PATTERNS: [
    /team\s*up/i,
    /\bteam\b/i,
    /jogo\s*com/i,
    /jogamos\s*juntos/i,
    /play\s*together/i,
    /play\s*with/i
  ],
  
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

  // Partner detection patterns
  ANON_PARTNER_PATTERNS: [
    /(?:\+|\s+\+\s+)partner/i
  ],
};

// Max Words for Player Names
export const MAX_NAME_WORDS = 4;
