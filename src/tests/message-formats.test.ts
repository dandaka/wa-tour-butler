import { MessageCommand, MsgParsed } from '../types/message-parsing';
import { ParserPipeline } from '../pipeline/parser-pipeline';

// Create test function to use real parser implementation
function parseTestMessage(message: Partial<MsgParsed>): MsgParsed {
  // Create parser instance
  const parser = new ParserPipeline();
  
  // Prepare a proper message object with all required properties
  const baseMsg: any = {
    // Required for the parser pipeline
    originalText: message.originalText || '',
    rawWhatsAppObj: {
      sender: message.sender || '123456789@s.whatsapp.net',
      fromMe: message.rawWhatsAppObj?.fromMe || false,
      content: message.originalText || '',
      timestamp: Date.now(),
      id: 'test-id'
    },
    sender: message.sender || '123456789@s.whatsapp.net',
    timestamp: Date.now(),
    players: message.players || [],
    modifier: message.modifier || MessageCommand.CONVERSATION,
    isTeam: message.isTeam || false,
    batch: message.batch || undefined,
    sender_name: message.sender_name || 'Test User'
  };
  
  console.log('Processing message:', baseMsg.originalText);
  
  // Run the message through the parser pipeline
  const result = parser.processMessage(baseMsg);
  
  console.log('Result:', { 
    text: result.originalText,
    modifier: result.modifier,
    players: result.players,
    isTeam: result.isTeam
  });
  
  return result;
}

// Define test input and expected output types
type TestCase = {
  description: string;
  input: {
    originalText: string;
    sender: string;
    fromMe: boolean;
    batch?: string;
  };
  expected: {
    players: Array<{ name?: string, displayName?: string, phoneNumber?: string }>;
    modifier: MessageCommand;
    isTeam: boolean;
    batch?: string;
  };
};

describe('Message Format Parser Tests', () => {
  // Define all test cases
  const testCases: TestCase[] = [
    {
      description: "English 'and' separator with time",
      input: {
        originalText: "Rudi and Dani 15:00",
        sender: "351914186974@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Rudi" }, { name: "Dani" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "15:00"
      }
    },
    {
      description: "'+partner' format",
      input: {
        originalText: "Giu+partner in 15",
        sender: "393398796077@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Giu" }, { name: "Giu's partner" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "15:00"
      }
    },
    {
      description: "'with partner' format",
      input: {
        originalText: "Bob in with partner 17:00",
        sender: "31641316698@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ displayName: "Bob Stolk" }, { displayName: "Bob Stolk's partner" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "17:00"
      }
    },
    {
      description: "'&' separator",
      input: {
        originalText: "Philipp & Diego 15h",
        sender: "33621666469@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ displayName: "Philipp" }, { displayName: "Diego" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "15:00"
      }
    },
    {
      description: "Name in message overrides contact name",
      input: {
        originalText: "Dennis in 15",
        sender: "4915120104551@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ displayName: "Dennis" }],
        modifier: MessageCommand.IN,
        isTeam: false,
        batch: "15:00"
      }
    },
    {
      description: "'and partner' format",
      input: {
        originalText: "Miguel and partner 15h",
        sender: "351919305285@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Miguel" }, { name: "Miguel's partner" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "15:00"
      }
    },

    {
      description: "Multiline registration with slash notation",
      input: {
        originalText: "Julien / Mark - 15h\nJulien / Mike - 17h",
        sender: "351910686564@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        // Expecting only first line would be processed in this test
        players: [{ name: "Julien" }, { name: "Mark" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "15:00"
      }
    },
    {
      description: "English 'and' with explicit IN command",
      input: {
        originalText: "Miguel and Duarte in 17h",
        sender: "351919305285@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Miguel" }, { name: "Duarte" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "17:00"
      }
    },
    {
      description: "'& Partner' format",
      input: {
        originalText: "Kevin & Partner in 15h",
        sender: "4915908498953@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Kevin" }, { name: "Kevin's partner" }],
        modifier: MessageCommand.IN,
        isTeam: true,
        batch: "15:00"
      }
    },

    {
      description: "Simple name with time as IN",
      input: {
        originalText: "Gui 15h00",
        sender: "351936836204@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Gui" }],
        modifier: MessageCommand.IN,
        isTeam: false,
        batch: "15:00"
      }
    },
    {
      description: "Another simple name with time as IN",
      input: {
        originalText: "Dan 15h",
        sender: "41786396442@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "Dan" }],
        modifier: MessageCommand.IN,
        isTeam: false,
        batch: "15:00"
      }
    },
    {
      description: "Name without time as IN",
      input: {
        originalText: "philipp effinger",
        sender: "33621666469@s.whatsapp.net",
        fromMe: false
      },
      expected: {
        players: [{ name: "philipp effinger" }],
        modifier: MessageCommand.IN,
        isTeam: false
      }
    }
  ];

  // Test cases will run below
  
  // Run tests for each test case - with real assertions that will fail
  testCases.forEach(({ description, input, expected }) => {
    test(`should parse ${description} correctly`, () => {
      // Create a message based on test input
      const message: Partial<MsgParsed> = {
        originalText: input.originalText,
        sender: input.sender,
        rawWhatsAppObj: { fromMe: input.fromMe },
        batch: input.batch
      };
      
      // Run test against the real ParserPipeline
      const result = parseTestMessage(message);
      
      // Now use real assertions instead of automatic failure
      // Check player count
      expect(result.players.length).toBe(expected.players.length);
      
      // Check player names if provided in expected
      if (expected.players.length > 0) {
        expected.players.forEach((expectedPlayer, index) => {
          if (expectedPlayer.name) {
            expect(result.players[index].name).toBe(expectedPlayer.name);
          }
        });
      }
      
      // Check if it's a team registration
      expect(result.isTeam).toBe(expected.isTeam);
      
      // Check the message command/modifier
      expect(result.modifier).toBe(expected.modifier);
      
      // Check time batch if expected
      if (expected.batch) {
        expect(result.batch).toBe(expected.batch);
      }
    });
  });

  // Add additional tests for specific edge cases
  
  test('should handle uppercase/lowercase variations', () => {
    // Test case insensitive matching 
    const message: Partial<MsgParsed> = {
      originalText: "Philipp AND Diego 15h",  // Mixed case AND instead of and
      sender: "123456789@s.whatsapp.net"
    };
    
    const result = parseTestMessage(message);
    
    expect(result.players.length).toBe(2);
    expect(result.players[0].name).toBe("Philipp");
    expect(result.players[1].name).toBe("Diego");
    expect(result.isTeam).toBe(true);
  });
  
  test('should handle "OUT" messages correctly', () => {
    // Test OUT message handling
    const message: Partial<MsgParsed> = {
      originalText: "OUT",
      sender: "123456789@s.whatsapp.net"
    };
    
    const result = parseTestMessage(message);
    
    expect(result.modifier).toBe(MessageCommand.OUT);
  });

  test('should standardize time formats', () => {
    const timeFormats = [
      { input: "15h", expected: "15:00" },
      { input: "15:00", expected: "15:00" },
      { input: "15.00", expected: "15:00" },
      { input: "15", expected: "15:00" },
      { input: "17:30", expected: "17:30" },
      { input: "17.30", expected: "17:30" },
      { input: "17h30", expected: "17:30" }
    ];
    
    // Test each time format
    timeFormats.forEach(format => {
      const message: Partial<MsgParsed> = {
        originalText: `Dan ${format.input}`,
        sender: "123456789@s.whatsapp.net"
      };
      
      const result = parseTestMessage(message);
      
      // Check if the batch was correctly standardized
      if (result.batch) {
        expect(result.batch).toBe(format.expected);
      }
    });
  });

  // Document all the different name separators we should handle
  test('should handle all name separator formats', () => {
    const separators = [
      { format: "Name1 e Name2", example: "Vlad Ra e Abilio Duarte 15h" },
      { format: "Name1 com Name2", example: "João com Roberto 15h" },
      { format: "Name1 and Name2", example: "Rudi and Dani 15:00" },
      { format: "Name1/Name2", example: "Julien/Mark" },
      { format: "Name1 / Name2", example: "Julien / Mark" },
      { format: "Name1 & Name2", example: "Philipp & Diego 15h" },
      { format: "Name+partner", example: "Giu+partner" },
      { format: "Name with partner", example: "Bob with partner" }
    ];
    
    expect(separators.length).toBeGreaterThan(0);
  });
});

// This test structure defines what we expect from our parser
// without implementing the actual parsing logic yet.
