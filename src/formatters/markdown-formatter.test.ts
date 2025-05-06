/**
 * Tests for the Markdown formatter
 */
// Use a relative import to reference the local file
import { formatOutputAsMarkdown } from '../formatters/markdown-formatter';
import { ProcessingResult, GroupInfo } from '../types/signups';
import { SignupWithTeam } from '../utils/team-numbering';

describe('Markdown Formatter', () => {
  // Sample group info for testing
  const groupInfo: GroupInfo = {
    id: 'test-group',
    name: 'Test Group',
    admin: '123456789',
    maxTeams: 5
  };

  // Helper function to create a mock signup
  const createSignup = (
    originalMessage: string,
    names: string[],
    timestamp: number,
    sender: string = '123456789',
    time?: string,
    status: 'IN' | 'OUT' = 'IN',
    isTeam: boolean = names.length > 1
  ): SignupWithTeam => ({
    originalMessage,
    names,
    timestamp,
    sender,
    time,
    status,
    isTeam,
    formattedNames: names.map(name => isTeam && status === 'IN' ? `${name} (1)` : name)
  });

  it('should format empty results correctly', () => {
    const result: ProcessingResult = {
      signups: [],
      finalPlayerList: [],
      outPlayersByTimeSlot: {}
    };

    const output = formatOutputAsMarkdown(result, groupInfo);
    
    // Check basic structure
    expect(output).toContain('# Test Group Tournament Signups');
    expect(output).toContain('## Players by Time Slot');
    expect(output).toContain('## Signup Processing Log');
    expect(output).toContain('No signups found after registration opened.');
  });

  it('should format signups with time slots correctly', () => {
    const now = Date.now() / 1000;
    const result: ProcessingResult = {
      signups: [
        createSignup('John IN 15:00', ['John'], now - 3600, '111', '15:00'),
        createSignup('Sarah and Mike IN 17:00', ['Sarah', 'Mike'], now - 1800, '222', '17:00')
      ],
      finalPlayerList: ['John', 'Sarah (1)', 'Mike (1)'],
      outPlayersByTimeSlot: {},
      processedSignups: [
        createSignup('John IN 15:00', ['John'], now - 3600, '111', '15:00', 'IN', false),
        createSignup('Sarah and Mike IN 17:00', ['Sarah', 'Mike'], now - 1800, '222', '17:00', 'IN', true)
      ]
    };

    // Add team number to the team signup
    (result.processedSignups![1] as SignupWithTeam).teamNumber = 1;

    const output = formatOutputAsMarkdown(result, groupInfo);
    
    // Check time slots are formatted correctly
    expect(output).toContain('### 15:00 Time Slot');
    expect(output).toContain('1. John');
    expect(output).toContain('### 17:00 Time Slot');
    expect(output).toContain('1. Sarah (1)');
    expect(output).toContain('2. Mike (1)');
    
    // Check signup log is formatted correctly
    expect(output).toContain('### Signup #1');
    expect(output).toContain('- Original message: "John IN 15:00"');
    expect(output).toContain('### Signup #2');
    expect(output).toContain('- Original message: "Sarah and Mike IN 17:00"');
    expect(output).toContain('- Team ID: 1');
  });

  it('should handle OUT status players correctly', () => {
    const now = Date.now() / 1000;
    const result: ProcessingResult = {
      signups: [
        createSignup('John IN 15:00', ['John'], now - 3600, '111', '15:00'),
        createSignup('Sarah and Mike IN 15:00', ['Sarah', 'Mike'], now - 1800, '222', '15:00'),
        createSignup('John OUT 15:00', ['John'], now - 900, '111', '15:00', 'OUT')
      ],
      finalPlayerList: ['Sarah (1)', 'Mike (1)'],
      outPlayersByTimeSlot: {
        '15:00': ['John']
      },
      processedSignups: [
        createSignup('John IN 15:00', ['John'], now - 3600, '111', '15:00'),
        createSignup('Sarah and Mike IN 15:00', ['Sarah', 'Mike'], now - 1800, '222', '15:00', 'IN', true),
        createSignup('John OUT 15:00', ['John'], now - 900, '111', '15:00', 'OUT')
      ]
    };
    
    // Add team number to the team signup
    (result.processedSignups![1] as SignupWithTeam).teamNumber = 1;

    const output = formatOutputAsMarkdown(result, groupInfo);
    
    // Check John is not in the player list for 15:00
    expect(output).toContain('### 15:00 Time Slot');
    expect(output).not.toMatch(/\d+\. John\n/); // John should not be in the list
    expect(output).toContain('1. Sarah (1)');
    expect(output).toContain('2. Mike (1)');
    
    // Check all signups are in the log
    expect(output).toContain('### Signup #1');
    expect(output).toContain('- Original message: "John IN 15:00"');
    expect(output).toContain('### Signup #2');
    expect(output).toContain('- Original message: "Sarah and Mike IN 15:00"');
    expect(output).toContain('### Signup #3');
    expect(output).toContain('- Original message: "John OUT 15:00"');
    expect(output).toContain('- Status: OUT');
  });

  it('should handle substitutes when there are more players than slots', () => {
    const now = Date.now() / 1000;
    // Create 12 players (6 teams) for a group with maxTeams = 5 (10 slots)
    const teams = [
      createSignup('Team 1', ['Player1', 'Player2'], now - 3600, '111', '15:00'),
      createSignup('Team 2', ['Player3', 'Player4'], now - 3300, '222', '15:00'),
      createSignup('Team 3', ['Player5', 'Player6'], now - 3000, '333', '15:00'),
      createSignup('Team 4', ['Player7', 'Player8'], now - 2700, '444', '15:00'),
      createSignup('Team 5', ['Player9', 'Player10'], now - 2400, '555', '15:00'),
      createSignup('Team 6', ['Player11', 'Player12'], now - 2100, '666', '15:00')
    ];
    
    // Assign team numbers 1-6
    const processedTeams = teams.map((team, i) => {
      const processed = { ...team };
      processed.teamNumber = i + 1;
      processed.formattedNames = team.names.map(name => `${name} (${i + 1})`);
      return processed;
    });
    
    const result: ProcessingResult = {
      signups: teams,
      finalPlayerList: processedTeams.flatMap(t => t.formattedNames),
      outPlayersByTimeSlot: {},
      processedSignups: processedTeams,
      // Force suplentes mode for the test
      useSuplentesFormat: true,
      suplentesThreshold: 10
    };

    const output = formatOutputAsMarkdown(result, groupInfo);
    
    // Check the first 10 players are listed in the output
    for (let i = 1; i <= 10; i++) {
      expect(output).toContain(`Player${i}`);
    }
    
    // Check players 11 and 12 are also in the output
    expect(output).toContain('Player11');
    expect(output).toContain('Player12');
  });

  it('should display team numbers for all players in player lists', () => {
    const now = Date.now() / 1000;
    
    // Create signups including both individual players and teams
    const result: ProcessingResult = {
      signups: [
        createSignup('Im in', ['Alex'], now - 3600, '111', undefined, 'IN', false),
        createSignup('I and my partner', ['Bob', 'Charlie'], now - 3000, '222', undefined, 'IN', true),
        createSignup('Just me', ['David'], now - 2500, '333', undefined, 'IN', false),
        createSignup('Our team', ['Eve', 'Frank'], now - 2000, '444', undefined, 'IN', true)
      ],
      finalPlayerList: ['Alex (1)', 'Bob (2)', 'Charlie (2)', 'David (3)', 'Eve (4)', 'Frank (4)'],
      outPlayersByTimeSlot: {},
      processedSignups: [
        // Include processed signups with team numbers assigned
        {
          originalMessage: 'Im in',
          names: ['Alex'],
          timestamp: now - 3600,
          sender: '111',
          status: 'IN',
          isTeam: false,
          formattedNames: ['Alex (1)'],
          teamNumber: 1
        },
        {
          originalMessage: 'I and my partner',
          names: ['Bob', 'Charlie'],
          timestamp: now - 3000,
          sender: '222',
          status: 'IN',
          isTeam: true,
          formattedNames: ['Bob (2)', 'Charlie (2)'],
          teamNumber: 2
        },
        {
          originalMessage: 'Just me',
          names: ['David'],
          timestamp: now - 2500,
          sender: '333',
          status: 'IN',
          isTeam: false,
          formattedNames: ['David (3)'],
          teamNumber: 3
        },
        {
          originalMessage: 'Our team',
          names: ['Eve', 'Frank'],
          timestamp: now - 2000,
          sender: '444',
          status: 'IN',
          isTeam: true,
          formattedNames: ['Eve (4)', 'Frank (4)'],
          teamNumber: 4
        }
      ]
    };

    const output = formatOutputAsMarkdown(result, groupInfo);
    
    // Check that team numbers appear in the player list
    expect(output).toContain('1. Alex (1)');
    expect(output).toContain('2. Bob (2)');
    expect(output).toContain('3. Charlie (2)');
    expect(output).toContain('4. David (3)');
    expect(output).toContain('5. Eve (4)');
    expect(output).toContain('6. Frank (4)');
  });
});
