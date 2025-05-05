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
