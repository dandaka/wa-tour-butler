/**
 * Message Parsing Types
 * 
 * Defines the data structures used in the WhatsApp Tournament Butler parsing pipeline.
 * Each message goes through the pipeline and gets transformed into a MsgParsed object.
 */

/**
 * Types of message commands
 */
export enum MessageCommand {
  IN = 'in',
  OUT = 'out',
  TEAM = 'team',
  REGISTRATION_OPEN = 'registration_open',
  SYSTEM = 'system',
  CONVERSATION = 'conversation'
}

/**
 * Information about a player referenced in a message
 */
export interface PlayerInfo {
  phoneNumber?: string;
  name?: string;
  displayName: string; // Combined representation for output
}

/**
 * Parsed message structure
 * Contains both the original message data and the parsed information
 */
export interface MsgParsed {
  // Source data
  originalText: string;
  rawWhatsAppObj: any; // Original message from WhatsApp API
  sender: string; // Phone number of sender
  sender_name?: string; // Display name from contacts
  timestamp: number; // Unix timestamp
  
  // Parsed information (populated step by step)
  players: PlayerInfo[];
  modifier: MessageCommand;
  isTeam: boolean;
  teamId?: number;
  batch?: string; // Generic grouping (time slots, event types, etc.)
}
