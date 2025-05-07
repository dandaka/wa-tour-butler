/**
 * Tests for team numbering functionality
 */
import { processSignupsWithTeams, SignupWithTeam } from './team-numbering';
import { ParsedSignup } from './signup-parser';

describe('Team Numbering', () => {
  // Helper function to create test signups
  const createSignup = (
    names: string[],
    time?: string,
    status: 'IN' | 'OUT' = 'IN'
  ): ParsedSignup => ({
    originalMessage: `${names.join(' and ')} ${time || ''}`,
    names,
    time,
    status,
    timestamp: Date.now(),
    sender: 'test',
    isTeam: names.length > 1
  });

  it('should assign sequential team numbers to teams', () => {
    const signups: ParsedSignup[] = [
      createSignup(['John'], '15:00'),              // Single player - not a team
      createSignup(['Mike', 'Tom'], '15:00'),       // Team 1
      createSignup(['Sarah'], '15:00'),             // Single player - not a team
      createSignup(['Alex', 'Chris'], '15:00'),     // Team 2
      createSignup(['Lisa', 'Amy'], '15:00'),       // Team 3
      createSignup(['David'], '15:00'),             // Single player - not a team
    ];

    const result = processSignupsWithTeams(signups);

    // Check that teams got sequential numbers
    expect(result[1].teamNumber).toBe(1);
    expect(result[1].isTeam).toBe(true);

    expect(result[3].teamNumber).toBe(2);
    expect(result[3].isTeam).toBe(true);

    expect(result[4].teamNumber).toBe(3);
    expect(result[4].isTeam).toBe(true);

    // Check that individual players don't have team numbers
    expect(result[0].teamNumber).toBeUndefined();
    expect(result[0].isTeam).toBe(false);

    expect(result[2].teamNumber).toBeUndefined();
    expect(result[2].isTeam).toBe(false);

    expect(result[5].teamNumber).toBeUndefined();
    expect(result[5].isTeam).toBe(false);
  });

  it('should handle multiple time slots with separate team numbering', () => {
    const signups: ParsedSignup[] = [
      createSignup(['John', 'Mike'], '15:00'),      // Team 1 for 15:00
      createSignup(['Sarah', 'Alex'], '17:00'),     // Team 1 for 17:00
      createSignup(['David', 'Lisa'], '15:00'),     // Team 2 for 15:00
      createSignup(['Chris', 'Amy'], '17:00'),      // Team 2 for 17:00
      createSignup(['Bob'], '15:00'),               // Single player - not a team
      createSignup(['Tim', 'Kate'], '15:00'),       // Team 3 for 15:00
    ];

    const result = processSignupsWithTeams(signups);

    // Check 15:00 teams
    expect(result[0].teamNumber).toBe(1);
    expect(result[0].time).toBe('15:00');
    
    expect(result[2].teamNumber).toBe(2);
    expect(result[2].time).toBe('15:00');
    
    expect(result[5].teamNumber).toBe(3);
    expect(result[5].time).toBe('15:00');

    // Check 17:00 teams
    expect(result[1].teamNumber).toBe(1);
    expect(result[1].time).toBe('17:00');
    
    expect(result[3].teamNumber).toBe(2);
    expect(result[3].time).toBe('17:00');

    // Check single player
    expect(result[4].teamNumber).toBeUndefined();
    expect(result[4].isTeam).toBe(false);
  });

  it('should handle OUT status teams', () => {
    const signups: ParsedSignup[] = [
      createSignup(['John', 'Mike'], '15:00'),          // Team 1 IN
      createSignup(['Sarah', 'Alex'], '15:00', 'OUT'),  // Team - OUT (no number)
      createSignup(['David', 'Lisa'], '15:00'),         // Team 2 IN
    ];

    const result = processSignupsWithTeams(signups);

    // Check that IN teams get numbers
    expect(result[0].teamNumber).toBe(1);
    expect(result[0].status).toBe('IN');
    
    expect(result[2].teamNumber).toBe(2);
    expect(result[2].status).toBe('IN');
    
    // Check that OUT teams don't get numbers
    expect(result[1].teamNumber).toBeUndefined();
    expect(result[1].status).toBe('OUT');
  });

  it('should never display team numbers for solo players in formatted output', () => {
    const signups: ParsedSignup[] = [
      createSignup(['John'], undefined),               // Solo player, no time
      createSignup(['Mike', 'Tom'], undefined),        // Team 1, no time
      createSignup(['Sarah'], '15:00'),               // Solo player with time
      createSignup(['Chris'], '15:00'),               // Another solo player
      createSignup(['Lisa', 'Amy'], '15:00'),         // Team 1 for 15:00
      createSignup(['David'], undefined),             // Another solo player, no time
      createSignup(['Hanson', 'Elena'], undefined)    // Team 2, no time
    ];

    const result = processSignupsWithTeams(signups);

    // Check solo players have no team numbers in their formatted names
    expect(result[0].formattedNames[0]).toBe('John'); // No team number
    expect(result[0].teamNumber).toBeUndefined();

    expect(result[2].formattedNames[0]).toBe('Sarah'); // No team number
    expect(result[2].teamNumber).toBeUndefined();

    expect(result[3].formattedNames[0]).toBe('Chris'); // No team number
    expect(result[3].teamNumber).toBeUndefined();

    expect(result[5].formattedNames[0]).toBe('David'); // No team number
    expect(result[5].teamNumber).toBeUndefined();

    // Check team players have team numbers in their formatted names
    expect(result[1].formattedNames[0]).toMatch(/Mike \(\d+\)/); // Has team number
    expect(result[1].formattedNames[1]).toMatch(/Tom \(\d+\)/); // Has team number
    expect(result[1].teamNumber).toBeDefined();

    expect(result[4].formattedNames[0]).toMatch(/Lisa \(\d+\)/); // Has team number
    expect(result[4].formattedNames[1]).toMatch(/Amy \(\d+\)/); // Has team number
    expect(result[4].teamNumber).toBeDefined();

    expect(result[6].formattedNames[0]).toMatch(/Hanson \(\d+\)/); // Has team number
    expect(result[6].formattedNames[1]).toMatch(/Elena \(\d+\)/); // Has team number
    expect(result[6].teamNumber).toBeDefined();
  });
  
  it('should differentiate between teams and solo players for markdown display', () => {
    // Create a mix of solo players and teams
    const signups: ParsedSignup[] = [
      createSignup(['James', 'Chris'], undefined),    // Team 1
      createSignup(['Francisco'], undefined),        // Solo player
      createSignup(['Tom', 'Louis'], undefined),     // Team 2
      createSignup(['Hanson'], undefined),           // Solo player
      createSignup(['Marcos'], undefined),           // Solo player
      createSignup(['Chris'], undefined),            // Solo player
      createSignup(['Roman'], undefined),            // Solo player
    ];

    const result = processSignupsWithTeams(signups);
    
    // Verify team assignments
    // Teams should have team numbers
    expect(result[0].teamNumber).toBeDefined();
    expect(result[0].isTeam).toBe(true);
    expect(result[2].teamNumber).toBeDefined();
    expect(result[2].isTeam).toBe(true);
    
    // Solo players should NOT have team numbers
    expect(result[1].teamNumber).toBeUndefined();
    expect(result[1].isTeam).toBe(false);
    expect(result[3].teamNumber).toBeUndefined();
    expect(result[3].isTeam).toBe(false);
    expect(result[4].teamNumber).toBeUndefined();
    expect(result[4].isTeam).toBe(false);
    expect(result[5].teamNumber).toBeUndefined();
    expect(result[5].isTeam).toBe(false);
    expect(result[6].teamNumber).toBeUndefined();
    expect(result[6].isTeam).toBe(false);
    
    // Formatted names should match our requirements
    // Team players should have team numbers included
    expect(result[0].formattedNames[0]).toMatch(/James \(\d+\)/);
    expect(result[0].formattedNames[1]).toMatch(/Chris \(\d+\)/);
    expect(result[2].formattedNames[0]).toMatch(/Tom \(\d+\)/);
    expect(result[2].formattedNames[1]).toMatch(/Louis \(\d+\)/);
    
    // Solo players should not have team numbers
    expect(result[1].formattedNames[0]).toBe('Francisco');
    expect(result[3].formattedNames[0]).toBe('Hanson');
    expect(result[4].formattedNames[0]).toBe('Marcos');
    expect(result[5].formattedNames[0]).toBe('Chris');
    expect(result[6].formattedNames[0]).toBe('Roman');
  });

  it('should format team names with team numbers', () => {
    const processedSignups: SignupWithTeam[] = [
      {
        originalMessage: 'John 15:00',
        names: ['John'],
        time: '15:00',
        status: 'IN',
        timestamp: Date.now(),
        sender: 'test',
        isTeam: false,
        formattedNames: ['John']
      },
      {
        originalMessage: 'Mike and Tom 15:00',
        names: ['Mike', 'Tom'],
        time: '15:00',
        status: 'IN',
        timestamp: Date.now(),
        sender: 'test',
        isTeam: true,
        teamNumber: 1,
        formattedNames: ['Mike (1)', 'Tom (1)']
      }
    ];

    // Check that the team members have team numbers in parentheses
    expect(processedSignups[1].formattedNames[0]).toBe('Mike (1)');
    expect(processedSignups[1].formattedNames[1]).toBe('Tom (1)');
    
    // Check that individual players don't have team numbers
    expect(processedSignups[0].formattedNames[0]).toBe('John');
  });
});
