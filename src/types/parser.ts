/**
 * Registration Parser Types
 * 
 * Defines types used for the WhatsApp message registration parser
 */

import { WhatsAppMessage } from './messages';
import { PlayerInfo } from './message-parsing';

/**
 * Represents a contact in the WhatsApp contacts list
 */
export interface Contact {
  phoneNumber: string;
  name: string;
}

/**
 * Represents a player with display name and optional phone number
 */
export interface Player extends PlayerInfo {
  displayName: string;
  phoneNumber?: string;
}

/**
 * Represents a parsed registration from a WhatsApp message
 */
export interface ParsedRegistration {
  originalText: string;
  rawWhatsAppObj: WhatsAppMessage;
  sender: string;
  timestamp: number;
  players: Player[];
  modifier?: string;
  isTeam: boolean;
  teamId?: number;
  batch?: string;
  sender_name?: string;
}
