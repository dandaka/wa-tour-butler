import { ParserPipeline } from '../pipeline/parser-pipeline';
import { MsgParsed, MessageCommand, PlayerInfo } from '../types/message-parsing';

// Mock the contact loader functions
jest.mock('../utils/contact-loader', () => ({
  loadContacts: jest.fn().mockResolvedValue({
    '351912973590': '351912973590',
    '351936836204': 'André Silva',
    '351919032041': 'Nuno Bon De Sousa'
  }),
  getDisplayName: jest.fn((phoneNumber: string) => {
    const contacts: Record<string, string> = {
      '351912973590': '351912973590',
      '351936836204': 'André Silva',
      '351919032041': 'Nuno Bon De Sousa'
    };
    return contacts[phoneNumber] || phoneNumber;
  }),
  addDisplayNames: jest.fn()
}));

// Test helper function to parse a message and extract players
function parseMessage(message: MsgParsed): { players: PlayerInfo[], isTeam?: boolean, modifier?: MessageCommand } {
  // Process the message through the parser's public methods
  const parsedResult = new ParserPipeline().processMessage(message);
  
  return {
    players: parsedResult.players || [],
    isTeam: parsedResult.isTeam,
    modifier: parsedResult.modifier
  };
}

describe('Player Extraction Tests', () => {
  test('should not add sender as player for "Name1 e Name2" format when fromMe is true', () => {
    const message: MsgParsed = {
      originalText: "Vlad Ra e Abilio Duarte 15h",
      rawWhatsAppObj: {
        id: "3A639B9A9144B9440BED",
        timestamp: 1746467973,
        sender: "351912973590@s.whatsapp.net",
        content: "Vlad Ra e Abilio Duarte 15h",
        fromMe: true
      },
      sender: "351912973590@s.whatsapp.net",
      timestamp: 1746467973,
      modifier: MessageCommand.IN,
      players: [],
      isTeam: false
    };

    const result = parseMessage(message);
    
    // Should have exactly 2 players (not 3 - no sender)
    expect(result.players.length).toBe(2);
    expect(result.players[0].name).toBe("Vlad Ra");
    expect(result.players[1].name).toBe("Abilio Duarte");
    
    // Should be marked as a team
    expect(result.isTeam).toBe(true);
  });

  test('should strip time from player names', () => {
    const message: MsgParsed = {
      originalText: "João Silva 15h",
      rawWhatsAppObj: {
        id: "3A639B9A9144B9440BED123",
        timestamp: 1746467974,
        sender: "351919032041@s.whatsapp.net",
        content: "João Silva 15h",
        fromMe: false
      },
      sender: "351919032041@s.whatsapp.net",
      timestamp: 1746467974,
      modifier: MessageCommand.IN,
      players: [],
      isTeam: false
    };

    const result = parseMessage(message);
    
    // Should extract player name without time
    expect(result.players.length).toBe(1);
    expect(result.players[0].name).toBe("João Silva");
  });

  test('should add sender as player when no explicit players and not fromMe', () => {
    const message: MsgParsed = {
      originalText: "in 15h",
      rawWhatsAppObj: {
        id: "3A639B9A9144B9440BED456",
        timestamp: 1746467975,
        sender: "351919032041@s.whatsapp.net",
        content: "in 15h",
        fromMe: false
      },
      sender: "351919032041@s.whatsapp.net",
      timestamp: 1746467975,
      modifier: MessageCommand.IN,
      players: [],
      isTeam: false
    };

    const result = parseMessage(message);
    
    // Should add sender as only player
    expect(result.players.length).toBe(1);
    expect(result.players[0].phoneNumber).toBe("351919032041");
    expect(result.players[0].displayName).toBe("Nuno Bon De Sousa");
  });

  test('should handle various time formats in names', () => {
    // Test different time formats
    const testCases = [
      { input: "João Silva 15h", expected: "João Silva" },
      { input: "João Silva 15:00", expected: "João Silva" },
      { input: "João Silva 15.00", expected: "João Silva" },
      { input: "João Silva 15", expected: "João Silva" },
      { input: "João Silva 17:30", expected: "João Silva" },
      { input: "João Silva 17h30", expected: "João Silva" },
      { input: "João Silva 17.30", expected: "João Silva" }
    ];

    testCases.forEach(({ input, expected }) => {
      const message: MsgParsed = {
        originalText: input,
        rawWhatsAppObj: {
          id: "test",
          timestamp: 1746467976,
          sender: "351919032041@s.whatsapp.net",
          content: input,
          fromMe: false
        },
        sender: "351919032041@s.whatsapp.net",
        timestamp: 1746467976,
        modifier: MessageCommand.IN,
        players: [],
        isTeam: false
      };

      const result = parseMessage(message);
      
      // Should have 1 player with the correct name (time removed)
      expect(result.players.length).toBe(1);
      expect(result.players[0].name).toBe(expected);
    });
  });

  test('should handle explicit OUT command', () => {
    const message: MsgParsed = {
      originalText: "OUT 15h",
      rawWhatsAppObj: {
        id: "3A639B9A9144B9440BED789",
        timestamp: 1746467977,
        sender: "351919032041@s.whatsapp.net",
        content: "OUT 15h",
        fromMe: false
      },
      sender: "351919032041@s.whatsapp.net",
      timestamp: 1746467977,
      modifier: MessageCommand.OUT,
      players: [],
      isTeam: false
    };

    const result = parseMessage(message);
    
    // Should add sender as player for OUT message
    expect(result.players.length).toBe(1);
    expect(result.players[0].phoneNumber).toBe("351919032041");
    expect(result.modifier).toBe(MessageCommand.OUT);
  });

  test('should handle multiple player registrations with "e" format', () => {
    const testCases = [
      { text: "João e Maria 15h", expected: ["João", "Maria"] },
      { text: "Pedro Silva e Ana Costa 17:00", expected: ["Pedro Silva", "Ana Costa"] },
      { text: "Carlos e Roberto e Luís 15.00", expected: ["Carlos", "Roberto e Luís"] } // Note: Only handles first "e"
    ];

    testCases.forEach(({ text, expected }) => {
      const message: MsgParsed = {
        originalText: text,
        rawWhatsAppObj: {
          id: "teamtest",
          timestamp: 1746467978,
          sender: "351919032041@s.whatsapp.net",
          content: text,
          fromMe: false
        },
        sender: "351919032041@s.whatsapp.net",
        timestamp: 1746467978,
        modifier: MessageCommand.IN,
        players: [],
        isTeam: false
      };

      const result = parseMessage(message);
      
      // Verify the expected number of players (without sender as a player)
      expect(result.players.length).toBe(expected.length);
      
      // Check each expected name
      for (let i = 0; i < expected.length; i++) {
        expect(result.players[i].name).toBe(expected[i]);
      }
    });
  });
});
