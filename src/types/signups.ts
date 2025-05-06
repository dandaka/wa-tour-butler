/**
 * Types related to tournament signups
 * 
 * This module contains types related to tournament signups
 * including parsed signup data and processing results.
 */

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
  isTeam: boolean; // Flag to indicate if this signup represents a team
}

/**
 * Result of processing signup messages for a tournament
 */
export interface ProcessingResult {
  registrationOpenMessage?: any; // The message that started registration
  signups: ParsedSignup[]; // All parsed signup messages
  processedSignups?: any[]; // Signups with additional processing (like team numbering)
  finalPlayerList: string[]; // Final list of players
  outPlayersByTimeSlot: Record<string, string[]>; // Players who opted out by time slot
}

/**
 * Information about a tournament group
 */
export interface GroupInfo {
  id: string;
  name: string;
  admin: string;
  tournamentTime?: string;
  signupStartTime?: string;
  maxTeams?: number;
}
