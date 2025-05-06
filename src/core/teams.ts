/**
 * Core Team Management Module
 * 
 * This module handles team-related logic including:
 * - Assigning team numbers to signups
 * - Formatting player names with team information
 * - Managing team-based processing operations
 */

import { ParsedSignup } from '../types/signups';

/**
 * Extended interface with team numbering and formatted names
 */
export interface TeamSignup extends ParsedSignup {
  teamNumber?: number;
  formattedNames: string[]; // Names with team numbers e.g. "John (1)"
}

/**
 * Options for team processing
 */
export interface TeamProcessingOptions {
  // Starting number for team numbering (default: 1)
  startNumber?: number;
  // Format for displaying team numbers (default: " ({number})")
  teamNumberFormat?: string;
  // Whether to add team numbers to individual players (default: false)
  numberIndividuals?: boolean;
}

/**
 * Default options for team processing
 */
const defaultOptions: TeamProcessingOptions = {
  startNumber: 1,
  teamNumberFormat: " ({number})",
  numberIndividuals: false
};

/**
 * Assign team numbers to signups
 * 
 * Teams are defined as signups with 2 or more names with status IN
 * Team numbers are assigned sequentially per time slot
 * 
 * @param signups Array of parsed signups
 * @param options Processing options (optional)
 * @returns Array of signups with team numbers and formatted names
 */
export function assignTeamNumbers(
  signups: ParsedSignup[], 
  options?: TeamProcessingOptions
): TeamSignup[] {
  // Merge provided options with defaults
  const opts = { ...defaultOptions, ...options };
  
  // Convert all signups to TeamSignup without team numbers yet
  const processedSignups: TeamSignup[] = signups.map(signup => ({
    ...signup,
    formattedNames: [...signup.names],
    // Set isTeam for any signups that might not have it
    isTeam: signup.isTeam !== undefined ? signup.isTeam : signup.names.length > 1
  }));

  // Group by time slot for team numbering
  const timeSlots = new Set<string>();
  
  // Collect all time slots
  processedSignups.forEach(signup => {
    if (signup.time) {
      timeSlots.add(signup.time);
    }
  });
  
  // Process each time slot separately
  timeSlots.forEach(timeSlot => {
    // Use 1 as default if startNumber is undefined
    let teamCounter = opts.startNumber || 1;
    
    // Get all teams for this time slot that are IN status
    const teamsForTimeSlot = processedSignups.filter(signup => 
      signup.time === timeSlot && 
      signup.isTeam && 
      signup.status === 'IN'
    );
    
    // Assign team numbers
    teamsForTimeSlot.forEach(signup => {
      signup.teamNumber = teamCounter++;
      
      // Format names to include team number: "Name (TeamNumber)"
      signup.formattedNames = signup.names.map(name => 
        formatNameWithTeam(name, signup.teamNumber, opts.teamNumberFormat)
      );
    });
    
    // Optionally assign numbers to individuals
    if (opts.numberIndividuals) {
      const individualsForTimeSlot = processedSignups.filter(signup => 
        signup.time === timeSlot && 
        !signup.isTeam && 
        signup.status === 'IN'
      );
      
      individualsForTimeSlot.forEach(signup => {
        signup.teamNumber = teamCounter++;
        signup.formattedNames = signup.names.map(name => 
          formatNameWithTeam(name, signup.teamNumber, opts.teamNumberFormat)
        );
      });
    }
  });
  
  // Handle signups without a time slot
  const noTimeSlotTeams = processedSignups.filter(signup => 
    !signup.time && 
    signup.isTeam && 
    signup.status === 'IN'
  );
  
  // Assign team numbers for signups without time slots
  if (noTimeSlotTeams.length > 0) {
    // Use 1 as default if startNumber is undefined
    let teamCounter = opts.startNumber || 1;
    
    noTimeSlotTeams.forEach(signup => {
      signup.teamNumber = teamCounter++;
      
      // Format names to include team number
      signup.formattedNames = signup.names.map(name => 
        formatNameWithTeam(name, signup.teamNumber, opts.teamNumberFormat)
      );
    });
    
    // Optionally assign numbers to individuals without time slots
    if (opts.numberIndividuals) {
      const noTimeSlotIndividuals = processedSignups.filter(signup => 
        !signup.time && 
        !signup.isTeam && 
        signup.status === 'IN'
      );
      
      // Make sure teamCounter is defined (should be at this point, but TypeScript needs reassurance)
      if (teamCounter !== undefined) {
        noTimeSlotIndividuals.forEach(signup => {
          signup.teamNumber = teamCounter++;
          signup.formattedNames = signup.names.map(name => 
            formatNameWithTeam(name, signup.teamNumber, opts.teamNumberFormat)
          );
        });
      }
    }
  }
  
  return processedSignups;
}

/**
 * Get formatted player list with team numbers for display
 * 
 * @param processedSignups Signups with team numbers
 * @returns Array of formatted player names
 */
export function getFormattedPlayerList(processedSignups: TeamSignup[]): string[] {
  return processedSignups
    .filter(signup => signup.status === 'IN') // Only include players who are IN
    .flatMap(signup => signup.formattedNames);
}

/**
 * Format a player name with team number
 * 
 * @param name Player name
 * @param teamNumber Team number
 * @param format Format string (default: " ({number})")
 * @returns Formatted name with team number
 */
function formatNameWithTeam(
  name: string, 
  teamNumber?: number, 
  format: string = " ({number})"
): string {
  if (teamNumber === undefined) {
    return name;
  }
  return `${name}${format.replace('{number}', teamNumber.toString())}`;
}
