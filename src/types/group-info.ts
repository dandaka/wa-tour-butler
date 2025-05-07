/**
 * Group information data structure
 * Contains information about WhatsApp groups for tournament management
 */

/**
 * Represents a batch (timeslot) for a tournament
 */
export interface Batch {
  name: string;
  time: string;
  keywords: string[];
  TournamentTime?: string;
}

/**
 * Represents a WhatsApp group with tournament configuration settings
 */
export interface GroupInfo {
  // Basic group information
  ID: string;
  Name: string;
  Admins: string[];
  
  // Tournament settings
  TournamentTime: string;
  SignupStartTime: string;
  MaxTeams: string;
  
  // Optional configuration
  Batches?: Batch[];
}
