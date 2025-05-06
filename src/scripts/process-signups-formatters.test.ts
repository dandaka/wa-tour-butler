import { formatOutput } from './process-signups';
import { ParsedSignup } from '../utils/signup-parser';

// Define Jest globals to avoid type errors
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const beforeEach: (fn: () => void) => void;

// Add TypeScript interfaces to match the ones in the main file
interface GroupInfo {
  id: string;
  name: string;
  admin: string;
  tournamentTime?: string;
  signupStartTime?: string;
  maxTeams?: number;
}

interface ProcessingResult {
  registrationOpenMessage?: any;
  signups: ParsedSignup[];
  processedSignups?: any[];
  finalPlayerList: string[];
  outPlayersByTimeSlot: Record<string, string[]>;
}

// Mock data for testing
const mockRegistrationMessage = {
  id: '123',
  chat_id: 'group123',
  content: 'Inscrições abertas para amanhã às 19h!',
  sender: '351916949231',
  timestamp: 1746467935,
  is_from_me: 0,
  raw_data: '',
  created_at: ''
};

// Helper to create mock signups
function createMockSignup(
  names: string[],
  sender: string = '123456789@s.whatsapp.net',
  timestamp: number = 1746467935,
  status: 'IN' | 'OUT' = 'IN',
  time?: string,
  originalMessage: string = 'In com Player'
): ParsedSignup {
  return {
    names,
    sender,
    timestamp,
    status,
    time,
    originalMessage,
    isTeam: names.length > 1
  };
}

// Export mock data for reuse
export const mockData = {
  createMockSignup
};

describe('formatOutput function', () => {
  describe('Substitutes (Suplentes) section tests', () => {
    it('should add a Suplentes section when there are more players than slots based on maxTeams', () => {
      // Arrange
      const groupInfo: GroupInfo = {
        id: 'test-group',
        name: 'Test Group',
        admin: '123456789',
        maxTeams: 8 // 8 teams = 16 slots
      };
      
      // Create a set of team players and individual players that exceed 16 slots
      // Format for team players: "Name (team_number)"
      const teamPlayers = [
        "Player1 (1)", "Player2 (1)",
        "Player3 (2)", "Player4 (2)",
        "Player5 (3)", "Player6 (3)",
        "Player7 (4)", "Player8 (4)",
        "Player9 (5)", "Player10 (5)",
        "Player11 (6)", "Player12 (6)",
        "Player13 (7)", "Player14 (7)",
        "Player15 (8)", "Player16 (8)",
        "Player17 (9)", "Player18 (9)", // These will be substitutes
        "PlayerX", "PlayerY"            // Individual players as substitutes
      ];
      
      // Create result with players
      const result: ProcessingResult = {
        registrationOpenMessage: mockRegistrationMessage,
        signups: [],
        finalPlayerList: teamPlayers,
        outPlayersByTimeSlot: {}
      };
      
      // Add team signups
      for (let i = 0; i < 18; i += 2) {
        result.signups.push(createMockSignup(
          [teamPlayers[i], teamPlayers[i + 1]],
          `sender${i}@s.whatsapp.net`,
          1746467935 + i
        ));
      }
      
      // Add individual signups for the last two players
      result.signups.push(createMockSignup([teamPlayers[18]], `senderX@s.whatsapp.net`, 1746467935 + 18));
      result.signups.push(createMockSignup([teamPlayers[19]], `senderY@s.whatsapp.net`, 1746467935 + 19));
      
      // Act
      const output = formatOutput(result, groupInfo);
      
      // Assert
      expect(output).toContain('Suplentes:');
      
      // The content before Suplentes should have exactly 16 players (8 teams)
      const mainSection = output.split('Suplentes:')[0];
      for (let i = 0; i < 16; i++) {
        expect(mainSection).toContain(teamPlayers[i]);
      }
      
      // The substitute section should have the remaining 4 players
      const suplentesSection = output.split('Suplentes:')[1];
      for (let i = 16; i < 20; i++) {
        expect(suplentesSection).toContain(teamPlayers[i]);
      }
      
      // Verify line numbering is continuous
      expect(suplentesSection).toContain('17.');
      expect(suplentesSection).toContain('18.');
      expect(suplentesSection).toContain('19.');
      expect(suplentesSection).toContain('20.');
    });
    
    it('should NOT add a Suplentes section when there are exactly enough slots', () => {
      // Arrange
      const groupInfo: GroupInfo = {
        id: 'test-group',
        name: 'Test Group',
        admin: '123456789',
        maxTeams: 8 // 8 teams = 16 slots
      };
      
      // Create exactly 16 players (matching the 16 slots)
      const playerNames = Array.from({ length: 16 }, (_, i) => 
        `Player${i + 1}${i % 2 === 0 ? ` (${Math.floor(i/2) + 1})` : ''}`
      );
      
      // Create result with players
      const result: ProcessingResult = {
        registrationOpenMessage: mockRegistrationMessage,
        signups: [],
        finalPlayerList: playerNames,
        outPlayersByTimeSlot: {}
      };
      
      // Add team signups
      for (let i = 0; i < 16; i += 2) {
        result.signups.push(createMockSignup(
          [playerNames[i], playerNames[i + 1]],
          `sender${i}@s.whatsapp.net`,
          1746467935 + i
        ));
      }
      
      // Act
      const output = formatOutput(result, groupInfo);
      
      // Assert
      expect(output).not.toContain('Suplentes:');
      
      // Check that all players are included
      playerNames.forEach(player => {
        expect(output).toContain(player);
      });
    });
    
    it('should NOT add a Suplentes section when there are fewer players than available slots', () => {
      // Arrange
      const groupInfo: GroupInfo = {
        id: 'test-group',
        name: 'Test Group',
        admin: '123456789',
        maxTeams: 14 // 14 teams = 28 slots (like in Sao Bento Mix)
      };
      
      // Create 25 players (less than the 28 slots but still a large number)
      const playerNames = Array.from({ length: 25 }, (_, i) => 
        `Player${i + 1}${i % 2 === 0 ? ` (${Math.floor(i/2) + 1})` : ''}`
      );
      
      // Create result with players
      const result: ProcessingResult = {
        registrationOpenMessage: mockRegistrationMessage,
        signups: [],
        finalPlayerList: playerNames,
        outPlayersByTimeSlot: {}
      };
      
      // Add team signups for pairs
      for (let i = 0; i < 24; i += 2) {
        result.signups.push(createMockSignup(
          [playerNames[i], playerNames[i + 1]],
          `sender${i}@s.whatsapp.net`,
          1746467935 + i
        ));
      }
      
      // Add single player signup for the last player
      if (playerNames.length % 2 !== 0) {
        result.signups.push(createMockSignup(
          [playerNames[playerNames.length - 1]],
          `sender${playerNames.length - 1}@s.whatsapp.net`,
          1746467935 + playerNames.length - 1
        ));
      }
      
      // Act
      const output = formatOutput(result, groupInfo);
      
      // Assert
      expect(output).not.toContain('Suplentes:');
      
      // The heading should indicate the correct number of players
      expect(output).toContain(`(${playerNames.length} players)`);
      
      // Verify all players are present without requiring a specific order
      playerNames.forEach(player => {
        expect(output).toContain(player);
      });
    });
    
    it('should NOT add a Suplentes section when maxTeams is not defined, even with many players', () => {
      // Arrange
      const groupInfo: GroupInfo = {
        id: 'test-group',
        name: 'Test Group',
        admin: '123456789'
        // No maxTeams defined
      };
      
      // Create 30 players (a lot of players)
      const playerNames = Array.from({ length: 30 }, (_, i) => `Player${i + 1}`);
      
      // Create result with players
      const result: ProcessingResult = {
        registrationOpenMessage: mockRegistrationMessage,
        signups: [],
        finalPlayerList: playerNames,
        outPlayersByTimeSlot: {}
      };
      
      // Add individual signups
      playerNames.forEach((name, i) => {
        result.signups.push(createMockSignup(
          [name],
          `sender${i}@s.whatsapp.net`,
          1746467935 + i
        ));
      });
      
      // Act
      const output = formatOutput(result, groupInfo);
      
      // Assert
      expect(output).not.toContain('Suplentes:');
      
      // Check that all players are included
      playerNames.forEach(player => {
        expect(output).toContain(player);
      });
    });
    
    it('should add a Suplentes section for different maxTeams values', () => {
      // Test different maxTeams values
      [4, 6, 8, 10, 12].forEach(maxTeams => {
        // Arrange
        const groupInfo: GroupInfo = {
          id: `test-group-${maxTeams}`,
          name: `Test Group ${maxTeams}`,
          admin: '123456789',
          maxTeams
        };
        
        const availableSlots = maxTeams * 2;
        
        // Create more players than slots
        const extraPlayers = 5;
        const totalPlayers = availableSlots + extraPlayers;
        const playerNames = Array.from({ length: totalPlayers }, (_, i) => `Player${i + 1}`);
        
        // Create result with players
        const result: ProcessingResult = {
          registrationOpenMessage: mockRegistrationMessage,
          signups: [],
          finalPlayerList: playerNames,
          outPlayersByTimeSlot: {}
        };
        
        // Add individual signups
        playerNames.forEach((name, i) => {
          result.signups.push(createMockSignup(
            [name],
            `sender${i}@s.whatsapp.net`,
            1746467935 + i
          ));
        });
        
        // Act
        const output = formatOutput(result, groupInfo);
        
        // Assert
        expect(output).toContain('Suplentes:');
        expect(output).toContain(`${availableSlots + 1}. `);
        
        // Instead of checking exact ordering, just check that all players are present
        // and that the Suplentes section exists with expected number of players
        
        // Verify all players are in the output
        playerNames.forEach(player => {
          expect(output).toContain(player);
        });
        
        // Check that Suplentes section has the right number of suplentes entries
        const suplentesCount = totalPlayers - availableSlots;
        const suplentesIndex = output.indexOf('Suplentes:');
        const outputAfterSuplentes = output.substring(suplentesIndex);
        
        // Count the number of list items (lines with number followed by dot) after Suplentes
        const listItemPattern = /\d+\.\s+/g;
        const matches = outputAfterSuplentes.match(listItemPattern) || [];
        expect(matches.length).toEqual(suplentesCount);
      });
    });
    
    it('should handle specific time slots and unspecified time slots separately', () => {
      // Arrange
      const groupInfo: GroupInfo = {
        id: 'test-group',
        name: 'Test Group',
        admin: '123456789',
        maxTeams: 8 // 8 teams = 16 slots
      };
      
      // Create players with specific time and unspecified time
      const specificTimePlayers = Array.from({ length: 20 }, (_, i) => `TimePlayer${i + 1}`);
      const unspecifiedTimePlayers = Array.from({ length: 20 }, (_, i) => `Player${i + 1}`);
      
      // Create result with players
      const result: ProcessingResult = {
        registrationOpenMessage: mockRegistrationMessage,
        signups: [],
        finalPlayerList: [...specificTimePlayers, ...unspecifiedTimePlayers],
        outPlayersByTimeSlot: {}
      };
      
      // Add signups with specific time
      specificTimePlayers.forEach((name, i) => {
        result.signups.push(createMockSignup(
          [name],
          `sender${i}@s.whatsapp.net`,
          1746467935 + i,
          'IN',
          '19h00' // Specific time
        ));
      });
      
      // Add signups with unspecified time
      unspecifiedTimePlayers.forEach((name, i) => {
        result.signups.push(createMockSignup(
          [name],
          `sender${i + 100}@s.whatsapp.net`,
          1746467935 + i + 100
          // No time specified
        ));
      });
      
      // Act
      const output = formatOutput(result, groupInfo);
      
      // Assert
      // Should have both time sections
      expect(output).toContain('### 19h00 Time Slot');
      expect(output).toContain('### Unspecified Time Slot');
      
      // Only unspecified time slot should have Suplentes
      const unspecifiedSection = output.split('### Unspecified Time Slot')[1].split('##')[0];
      expect(unspecifiedSection).toContain('Suplentes:');
      
      // Specific time slot should not have Suplentes
      const specificTimeSection = output.split('### 19h00 Time Slot')[1].split('###')[0];
      expect(specificTimeSection).not.toContain('Suplentes:');
    });
  });
});
