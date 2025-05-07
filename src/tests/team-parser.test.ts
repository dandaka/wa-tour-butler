import { ParserPipeline } from '../pipeline/parser-pipeline';
import { loadContacts } from '../utils/contact-loader';
import * as fs from 'fs';
import * as path from 'path';

// Mock the contact-loader
jest.mock('../utils/contact-loader', () => ({
  loadContacts: jest.fn().mockResolvedValue({
    '351912973590': '351912973590',
    '351936836204': 'André Silva'
  }),
  getDisplayName: jest.fn((phoneNumber: string) => {
    const contacts: Record<string, string> = {
      '351912973590': '351912973590',
      '351936836204': 'André Silva'
    };
    return contacts[phoneNumber] || phoneNumber;
  }),
  addDisplayNames: jest.fn()
}));

describe('Team Registration Parser', () => {
  // Create test message with all required properties that ParserPipeline expects
  function createTestMessage(text = "Vlad Ra e Abilio Duarte 15h") {
    return {
      originalText: text,
      rawWhatsAppObj: {
        id: "3A639B9A9144B9440BED",
        timestamp: 1746467973,
        sender: "351912973590@s.whatsapp.net",
        content: text
      },
      sender: "351912973590@s.whatsapp.net",
      timestamp: 1746467973,
      sender_name: "351912973590",
      // Required properties for the ParserPipeline
      modifier: "in",
      players: [],
      isTeam: false
    };
  }

  test('should correctly parse "Name1 e Name2" format with time', async () => {
    // Create a fresh pipeline instance
    const pipeline = new ParserPipeline();
    
    // Process our test message
    const processedMessage = pipeline.processMessage(createTestMessage());
    
    // Assertions: Check if the processed message has the expected properties
    expect(processedMessage.players).toBeDefined();
    expect(processedMessage.players.length).toBe(2);
    
    // Check player names have correct format (without time)
    expect(processedMessage.players[0].name).toBe("Vlad Ra");
    expect(processedMessage.players[1].name).toBe("Abilio Duarte");
    
    // Check displayName also doesn't have time
    expect(processedMessage.players[0].displayName).toBe("Vlad Ra");
    expect(processedMessage.players[1].displayName).toBe("Abilio Duarte");
    
    // Check that the time was correctly extracted as batch
    expect(processedMessage.batch).toBe("15:00");
    
    // Check that it's recognized as a team
    expect(processedMessage.isTeam).toBe(true);
  });

  test('should handle various time formats in team registration', async () => {
    const timeFormats = [
      { text: "Vlad Ra e Abilio Duarte 15h", expected: "15:00" },
      { text: "Vlad Ra e Abilio Duarte 15:00", expected: "15:00" },
      { text: "Vlad Ra e Abilio Duarte 15.00", expected: "15:00" },
      { text: "Vlad Ra e Abilio Duarte 17h30", expected: "17:30" },
      { text: "Vlad Ra e Abilio Duarte 17:30", expected: "17:30" }
    ];

    const pipeline = new ParserPipeline();
    
    for (const { text, expected } of timeFormats) {
      const message = createTestMessage(text);
      
      const processed = pipeline.processMessage(message);
      
      // Check if the time was extracted properly
      expect(processed.players[0].name).toBe("Vlad Ra");
      expect(processed.players[1].name).toBe("Abilio Duarte");
      
      // Check the batch formatting is standardized
      expect(processed.batch).toBe(expected);
    }
  });
});
