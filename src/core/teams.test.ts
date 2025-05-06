/**
 * Tests for core team management functionality
 */
import { assignTeamNumbers, getFormattedPlayerList, TeamProcessingOptions } from './teams';
import { ParsedSignup } from '../types/signups';
import { SignupWithTeam } from '../utils/team-numbering';

describe('Team Management', () => {
  // Helper function to create test signups
  const createSignup = (
    names: string[],
    time?: string,
    status: 'IN' | 'OUT' = 'IN',
    timestamp: number = Date.now(),
    sender: string = 'test-sender'
  ): ParsedSignup => ({
    originalMessage: `${names.join(' and ')} ${time || ''}`,
    names,
    time,
    status,
    timestamp,
    sender,
    isTeam: names.length > 1
  });

  describe('assignTeamNumbers', () => {
    it('should assign sequential team numbers to teams', () => {
      const signups: ParsedSignup[] = [
        createSignup(['John'], '15:00'),              // Single player - not a team
        createSignup(['Mike', 'Tom'], '15:00'),       // Team 1
        createSignup(['Sarah'], '15:00'),             // Single player - not a team
        createSignup(['Alex', 'Chris'], '15:00'),     // Team 2
        createSignup(['Lisa', 'Amy'], '15:00'),       // Team 3
        createSignup(['David'], '15:00'),             // Single player - not a team
      ];

      const result = assignTeamNumbers(signups);

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

      const result = assignTeamNumbers(signups);

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

      const result = assignTeamNumbers(signups);

      // Check that IN teams get numbers
      expect(result[0].teamNumber).toBe(1);
      expect(result[0].status).toBe('IN');
      
      // Check that OUT teams don't get numbers
      expect(result[1].teamNumber).toBeUndefined();
      expect(result[1].status).toBe('OUT');
      
      expect(result[2].teamNumber).toBe(2);
      expect(result[2].status).toBe('IN');
    });

    it('should format names with team numbers', () => {
      const signups: ParsedSignup[] = [
        createSignup(['John', 'Mike'], '15:00'),  // Team 1
        createSignup(['Sarah'], '15:00'),         // Individual
        createSignup(['Alex', 'Chris'], '15:00'), // Team 2
      ];

      const result = assignTeamNumbers(signups);

      expect(result[0].formattedNames).toEqual(['John (1)', 'Mike (1)']);
      expect(result[1].formattedNames).toEqual(['Sarah']); // No team number
      expect(result[2].formattedNames).toEqual(['Alex (2)', 'Chris (2)']);
    });

    it('should support custom team numbering options', () => {
      const signups: ParsedSignup[] = [
        createSignup(['John', 'Mike'], '15:00'),  // Would be Team 1
        createSignup(['Sarah'], '15:00'),         // Individual 
        createSignup(['Alex', 'Chris'], '15:00'), // Would be Team 2
      ];

      // Start team numbering from 10
      const options: TeamProcessingOptions = {
        startNumber: 10
      };

      const result = assignTeamNumbers(signups, options);

      expect(result[0].teamNumber).toBe(10);
      expect(result[0].formattedNames).toEqual(['John (10)', 'Mike (10)']);
      
      expect(result[2].teamNumber).toBe(11);
      expect(result[2].formattedNames).toEqual(['Alex (11)', 'Chris (11)']);
    });

    it('should handle signups without time slots', () => {
      const signups: ParsedSignup[] = [
        createSignup(['John', 'Mike']),      // Team 1, no time slot
        createSignup(['Sarah', 'Alex']),     // Team 2, no time slot
        createSignup(['David']),             // Individual, no time slot
      ];

      const result = assignTeamNumbers(signups);

      expect(result[0].teamNumber).toBe(1);
      expect(result[1].teamNumber).toBe(2);
      expect(result[2].teamNumber).toBeUndefined();
    });
  });

  describe('getFormattedPlayerList', () => {
    it('should return a formatted list of players with team numbers', () => {
      const processedSignups: SignupWithTeam[] = [
        {
          originalMessage: 'John and Mike',
          names: ['John', 'Mike'],
          status: 'IN',
          timestamp: Date.now(),
          sender: 'test',
          isTeam: true,
          teamNumber: 1,
          formattedNames: ['John (1)', 'Mike (1)']
        },
        {
          originalMessage: 'Sarah',
          names: ['Sarah'],
          status: 'IN',
          timestamp: Date.now(),
          sender: 'test',
          isTeam: false,
          formattedNames: ['Sarah']
        },
        {
          originalMessage: 'David and Lisa OUT',
          names: ['David', 'Lisa'],
          status: 'OUT',
          timestamp: Date.now(),
          sender: 'test',
          isTeam: true,
          formattedNames: ['David', 'Lisa']
        }
      ];

      const result = getFormattedPlayerList(processedSignups);
      
      // Should only include IN players
      expect(result).toEqual(['John (1)', 'Mike (1)', 'Sarah']);
      expect(result).not.toContain('David');
      expect(result).not.toContain('Lisa');
    });

    it('should return an empty array if no IN players', () => {
      const processedSignups: SignupWithTeam[] = [
        {
          originalMessage: 'David and Lisa OUT',
          names: ['David', 'Lisa'],
          status: 'OUT',
          timestamp: Date.now(),
          sender: 'test',
          isTeam: true,
          formattedNames: ['David', 'Lisa']
        }
      ];

      const result = getFormattedPlayerList(processedSignups);
      expect(result).toEqual([]);
    });
  });
});
