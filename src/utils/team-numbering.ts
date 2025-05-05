/**
 * Team Numbering Module
 * 
 * This module adds team numbering to parsed signup messages.
 * Teams (signups with 2+ players) are assigned sequential numbers per time slot.
 */

import { ParsedSignup } from './signup-parser';

/**
 * Extended interface with formatted names including team numbers
 */
export interface SignupWithTeam extends ParsedSignup {
  teamNumber?: number;
  formattedNames: string[]; // Names with team numbers e.g. "John (1)"
}

/**
 * Process parsed signups and add team numbering
 * Teams are defined as signups with 2 or more names
 * Team numbers are assigned sequentially per time slot
 * 
 * @param signups Array of parsed signups
 * @returns Array of signups with team numbers and formatted names
 */
export function processSignupsWithTeams(signups: ParsedSignup[]): SignupWithTeam[] {
  // Convert all signups to SignupWithTeam without team numbers yet
  const processedSignups: SignupWithTeam[] = signups.map(signup => ({
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
    let teamCounter = 1;
    
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
        `${name} (${signup.teamNumber})`
      );
    });
  });
  
  // Handle signups without a time slot
  const noTimeSlotTeams = processedSignups.filter(signup => 
    !signup.time && 
    signup.isTeam && 
    signup.status === 'IN'
  );
  
  // Assign team numbers for signups without time slots
  if (noTimeSlotTeams.length > 0) {
    let teamCounter = 1;
    
    noTimeSlotTeams.forEach(signup => {
      signup.teamNumber = teamCounter++;
      
      // Format names to include team number
      signup.formattedNames = signup.names.map(name => 
        `${name} (${signup.teamNumber})`
      );
    });
  }
  
  return processedSignups;
}

/**
 * Simple formatter for displaying players with team numbers
 * 
 * @param processedSignups Signups with team numbers
 * @returns Array of formatted strings for display
 */
export function formatPlayersWithTeams(processedSignups: SignupWithTeam[]): string[] {
  return processedSignups
    .filter(signup => signup.status === 'IN') // Only include players who are IN
    .flatMap(signup => signup.formattedNames);
}
