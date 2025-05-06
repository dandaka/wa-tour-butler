import { formatOutput } from './process-signups';
import { ProcessingResult } from '../types/signups';
import { SignupWithTeam } from '../utils/team-numbering';

// Import GroupInfo from process-signups if not exported from tournament types
interface GroupInfo {
  id: string;
  name: string;
  admin: string;
  tournamentTime?: string;
  signupStartTime?: string;
  maxTeams?: number;
}

describe('Player Ordering', () => {
  it('should maintain chronological order between teams and individual players', () => {
    // Mock group info
    const groupInfo: GroupInfo = {
      id: 'test-group',
      name: 'Test Group',
      admin: '123456789@s.whatsapp.net'
    };
    
    // Create test result with signups in chronological order
    const result: ProcessingResult = {
      signups: [
        {
          originalMessage: 'Player1',
          names: ['Player1'],
          status: 'IN',
          timestamp: 1000, // Earliest signup
          sender: '123@s.whatsapp.net',
          isTeam: false
        },
        {
          originalMessage: 'TeamA/TeamB',
          names: ['TeamA', 'TeamB'],
          status: 'IN',
          timestamp: 2000, // Middle signup
          sender: '456@s.whatsapp.net',
          isTeam: true
        },
        {
          originalMessage: 'Player2',
          names: ['Player2'],
          status: 'IN',
          timestamp: 3000, // Latest signup
          sender: '789@s.whatsapp.net',
          isTeam: false
        }
      ],
      finalPlayerList: [],
      outPlayersByTimeSlot: {},
      processedSignups: [
        {
          originalMessage: 'Player1',
          names: ['Player1'],
          status: 'IN',
          timestamp: 1000,
          sender: '123@s.whatsapp.net',
          isTeam: false,
          formattedNames: ['Player1']
        },
        {
          originalMessage: 'TeamA/TeamB',
          names: ['TeamA', 'TeamB'],
          status: 'IN',
          timestamp: 2000,
          sender: '456@s.whatsapp.net',
          isTeam: true,
          teamNumber: 1,
          formattedNames: ['TeamA (1)', 'TeamB (1)']
        },
        {
          originalMessage: 'Player2',
          names: ['Player2'],
          status: 'IN',
          timestamp: 3000,
          sender: '789@s.whatsapp.net',
          isTeam: false,
          formattedNames: ['Player2']
        }
      ]
    };
    
    // Format the output
    const output = formatOutput(result, groupInfo);
    
    // Extract the player list from the formatted output
    const playerListSection = output.split('## Players by Time Slot')[1].split('## Signup Processing Log')[0];
    
    // Verify Player1 appears before TeamA (1)
    expect(playerListSection.indexOf('Player1')).toBeLessThan(playerListSection.indexOf('TeamA (1)'));
    
    // Verify TeamA (1) and TeamB (1) are grouped together
    const teamAIndex = playerListSection.indexOf('TeamA (1)');
    const teamBIndex = playerListSection.indexOf('TeamB (1)');
    
    // Ensure there's no other player between team members
    const contentBetweenTeams = playerListSection.substring(teamAIndex, teamBIndex);
    expect(contentBetweenTeams.indexOf('Player')).toBe(-1);
    
    // Verify TeamB (1) appears before Player2
    expect(teamBIndex).toBeLessThan(playerListSection.indexOf('Player2'));
  });

  it('should handle the real-world case with Afonso and Carlos Lopes team', () => {
    // Mock group info
    const groupInfo: GroupInfo = {
      id: 'test-group',
      name: 'Test Group',
      admin: '123456789@s.whatsapp.net'
    };
    
    // Timestamps converted from the example
    // Signup #6 (16:04:19) - "Afonso Guimarães" - timestamp ~1620317059
    // Signup #7 (16:08:14) - "Carlos Lopes e Carlos Lopes JR" - timestamp ~1620317294
    
    const result: ProcessingResult = {
      signups: [
        {
          originalMessage: 'Afonso Guimarães',
          names: ['Afonso Guimarães'],
          status: 'IN',
          timestamp: 1620317059, // Earlier signup
          sender: '351912721443@s.whatsapp.net',
          isTeam: false
        },
        {
          originalMessage: 'Carlos Lopes e Carlos Lopes JR',
          names: ['Carlos Lopes', 'Carlos Lopes JR'],
          status: 'IN',
          timestamp: 1620317294, // Later signup
          sender: '351966655095@s.whatsapp.net',
          isTeam: true
        }
      ],
      finalPlayerList: [],
      outPlayersByTimeSlot: {},
      processedSignups: [
        {
          originalMessage: 'Afonso Guimarães',
          names: ['Afonso Guimarães'],
          status: 'IN',
          timestamp: 1620317059,
          sender: '351912721443@s.whatsapp.net',
          isTeam: false,
          formattedNames: ['Afonso Guimarães']
        },
        {
          originalMessage: 'Carlos Lopes e Carlos Lopes JR',
          names: ['Carlos Lopes', 'Carlos Lopes JR'],
          status: 'IN',
          timestamp: 1620317294,
          sender: '351966655095@s.whatsapp.net',
          isTeam: true,
          teamNumber: 6, // They're team 6 in the output
          formattedNames: ['Carlos Lopes (6)', 'Carlos Lopes JR (6)']
        }
      ]
    };
    
    // Format the output
    const output = formatOutput(result, groupInfo);
    
    // Extract the player list from the formatted output
    const playerListSection = output.split('## Players by Time Slot')[1].split('## Signup Processing Log')[0];
    
    // Verify Afonso appears before Carlos Lopes
    expect(playerListSection.indexOf('Afonso Guimarães')).toBeLessThan(playerListSection.indexOf('Carlos Lopes (6)'));
    
    // Verify Carlos Lopes and Carlos Lopes JR are grouped together
    const carlosIndex = playerListSection.indexOf('Carlos Lopes (6)');
    const carlosJrIndex = playerListSection.indexOf('Carlos Lopes JR (6)');
    
    // Ensure Carlos team members stay together
    expect(carlosJrIndex - carlosIndex).toBeLessThan(50); // They should be adjacent or very close
  });
});
