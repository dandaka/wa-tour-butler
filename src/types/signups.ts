/**
 * Types related to tournament signups
 * 
 * This module contains types related to tournament signups
 * including parsed signup data and processing results.
 */

// Import necessary types
import { WhatsAppMessage } from './messages';
import { SignupWithTeam } from '../utils/team-numbering';

/**
 * Represents a parsed signup message with player names, time slot, and status
 */
export interface ParsedSignup {
  originalMessage: string;
  names: string[];
  time?: string;
  status: 'IN' | 'OUT';
  timestamp: number;
  sender: string;
  teamNumber?: number; // Team number for teams (1, 2, 3, etc.)
  teamId?: number;     // ID for linking related signups (e.g., for OUT messages to reference existing teams)
  isTeam: boolean;     // Flag to indicate if this signup represents a team
}

/**
 * Result of processing signup messages for a tournament
 */
export interface ProcessingResult {
  registrationOpenMessage?: WhatsAppMessage;
  signups: ParsedSignup[];
  processedSignups?: SignupWithTeam[];
  finalPlayerList: string[];
  outPlayersByTimeSlot: Record<string, string[]>;
  // Additional fields for testing and formatting
  useSuplentesFormat?: boolean;
  suplentesThreshold?: number;
  testForPlayerOrdering?: boolean;
}

/**
 * Information about a WhatsApp group
 */
export interface GroupInfo {
  id: string;
  name: string;
  admin: string;
  tournamentTime?: string;
  signupStartTime?: string;
  maxTeams?: number;
  batches?: string[];
}
