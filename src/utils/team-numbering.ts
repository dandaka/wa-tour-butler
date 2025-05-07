/**
 * Team Numbering Module
 * 
 * This module adds team numbering to parsed signup messages.
 * Teams (signups with 2+ players) are assigned sequential numbers per time slot.
 */

import { ParsedSignup } from '../types/signups';

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
  const processedSignups: SignupWithTeam[] = signups.map(signup => {
    // Determine if this is a team (2+ players)
    const isTeam = signup.isTeam !== undefined ? signup.isTeam : signup.names.length > 1;
    
    return {
      ...signup,
      // Initialize formatted names without team numbers
      formattedNames: [...signup.names],
      // Set isTeam flag based on the number of players
      isTeam
    };
  });

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
    // IMPORTANT: Only consider groups of 2+ players as teams
    const teamsForTimeSlot = processedSignups.filter(signup => 
      signup.time === timeSlot && 
      signup.isTeam && 
      signup.names.length > 1 && // Must have at least 2 players to be a team
      signup.status === 'IN'
    );
    
    // Assign team numbers only to actual teams (2+ players)
    teamsForTimeSlot.forEach(signup => {
      // Double-check that this is actually a team
      if (signup.names.length > 1) {
        signup.teamNumber = teamCounter++;
        
        // Format names to include team number: "Name (TeamNumber)"
        signup.formattedNames = signup.names.map(name => 
          `${name} (${signup.teamNumber})`
        );
      }
    });
    
    // Explicitly ensure solo players never have team numbers
    const soloPlayers = processedSignups.filter(signup => 
      signup.time === timeSlot && 
      signup.names.length === 1 && 
      signup.status === 'IN'
    );
    
    soloPlayers.forEach(signup => {
      // Clear any team number that might have been assigned
      signup.teamNumber = undefined;
      
      // Ensure the formatted name is just the name without a team number
      signup.formattedNames = [...signup.names];
      
      // Set isTeam to false explicitly for solo players
      signup.isTeam = false;
    });
  });
  
  // Handle signups without a time slot
  const noTimeSlotTeams = processedSignups.filter(signup => 
    !signup.time && 
    signup.isTeam && // Only actual teams (2+ players)
    signup.names.length > 1 && // Double-check team size
    signup.status === 'IN'
  );
  
  // Assign team numbers for signups without time slots
  if (noTimeSlotTeams.length > 0) {
    let teamCounter = 1;
    
    noTimeSlotTeams.forEach(signup => {
      // Only assign team numbers for actual teams (2+ players)
      if (signup.names.length > 1) {
        signup.teamNumber = teamCounter++;
        
        // Format names to include team number
        signup.formattedNames = signup.names.map(name => 
          `${name} (${signup.teamNumber})`
        );
      }
    });
  }
  
  // Explicitly ensure solo players without time slots never have team numbers
  const noTimeSlotSoloPlayers = processedSignups.filter(signup => 
    !signup.time && 
    signup.names.length === 1 && 
    signup.status === 'IN'
  );
  
  noTimeSlotSoloPlayers.forEach(signup => {
    // Clear any team number that might have been assigned
    signup.teamNumber = undefined;
    
    // Ensure the formatted name is just the name without a team number
    signup.formattedNames = [...signup.names];
    
    // Set isTeam to false explicitly for solo players
    signup.isTeam = false;
  });
  
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
