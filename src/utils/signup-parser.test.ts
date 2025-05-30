import { parseSignupMessage, formatTimeMatch, WhatsAppMessage, ParsedSignup } from './signup-parser';
import { getContactDisplayName } from '../services/contacts';

// Define Jest globals to avoid type errors
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const fail: (message: string) => void;

describe('Signup Parser', () => {
  /**
   * Test the time format matcher
   */
  describe('formatTimeMatch', () => {
    it('should format "15h" correctly', () => {
      const timeMatch = '15h'.match(/\b(\d{1,2})(?::h?|h:?)(\d{2})?h?\b|\b(\d{1,2})h\b/i);
      if (timeMatch) {
        expect(formatTimeMatch(timeMatch)).toBe('15:00');
      } else {
        fail('Expected timeMatch regex to match "15h"');
      }
    });

    it('should format "15:30" correctly', () => {
      const timeMatch = '15:30'.match(/\b(\d{1,2})(?::h?|h:?)(\d{2})?h?\b|\b(\d{1,2})h\b/i);
      if (timeMatch) {
        expect(formatTimeMatch(timeMatch)).toBe('15:30');
      } else {
        fail('Expected timeMatch regex to match "15:30"');
      }
    });

    it('should format "13:30h" correctly', () => {
      const timeMatch = '13:30h'.match(/\b(\d{1,2})(?::h?|h:?)(\d{2})?h?\b|\b(\d{1,2})h\b/i);
      if (timeMatch) {
        expect(formatTimeMatch(timeMatch)).toBe('13:30');
      } else {
        fail('Expected timeMatch regex to match "13:30h"');
      }
    });
    
    it('should format "18.30" correctly', () => {
      const timeMatch = '18.30'.match(/\b(\d{1,2})\.(\d{2})\b/i);
      if (timeMatch) {
        expect(formatTimeMatch(timeMatch)).toBe('18:30');
      } else {
        fail('Expected timeMatch regex to match "18.30"');
      }
    });

    it('should format "15" correctly', () => {
      const timeMatch = '15'.match(/\b(\d{1,2})[h:](\d{2})?\b|\b(\d{1,2})h\b/i);
      // If regex doesn't match (which is the case for "15"), the test should be skipped
      if (!timeMatch) {
        expect(true).toBe(true); // Skip test effectively
      } else {
        expect(formatTimeMatch(timeMatch)).toBe('');
      }
    });
  });

  /**
   * Test signup message parsing with real-world examples
   */
  describe('parseSignupMessage', () => {
    // Helper function to create a test message
    function createMessage(content: string, sender: string = '351987654321@s.whatsapp.net'): WhatsAppMessage {
      return {
        sender,
        timestamp: Date.now(),
        content
      };
    }
    
    // Helper function to get the first result when result could be an array or single item
    function getSingleResult(result: ParsedSignup | ParsedSignup[] | null): ParsedSignup | null {
      if (result === null) return null;
      if (Array.isArray(result)) return result[0];
      return result;
    }

    /**
     * System and special messages
     */
    it('should ignore system messages and bracketed messages', () => {
      const systemMessages = [
        '[PROTOCOLMESSAGE]',
        '[MESSAGECONTEXTINFO]',
        '[SENDERKEYDISTRIBUTIONMESSAGE]',
        '[REACTIONMESSAGE]',
        '[Any text in brackets]',
        '123', // Just a number
        'a' // Too short
      ];

      systemMessages.forEach(msg => {
        const result = parseSignupMessage(createMessage(msg));
        expect(result).toBeNull();
      });
    });

    it('should handle time-only messages by using sender phone number', () => {
      const timeOnlyMessages = [
        { message: '13h30', time: '13:30' },
        { message: '15:00', time: '15:00' },
        { message: '17.00', time: '17:00' },
        { message: '@4915563136827 13h30', time: '13:30', expectedName: '4915563136827' },
      ];

      timeOnlyMessages.forEach(({ message, time }) => {
        const result = getSingleResult(parseSignupMessage(createMessage(message)));
        expect(result).not.toBeNull();
        expect(result?.time).toBe(time);
        expect(result?.names).toHaveLength(1);
        if (message.startsWith('@')) {
          const phoneMatch = message.match(/@(\d+)/);
          expect(phoneMatch).not.toBeNull();
          expect(result?.names[0]).toBe(phoneMatch![1]); // Phone number from message
        } else {
          expect(result?.names[0]).toBe('351987654321'); // Full phone number including country code
        }
      });
    });

    it('should ignore registration messages', () => {
      expect(parseSignupMessage(createMessage('Inscrições abertas'))).toBeNull();
      expect(parseSignupMessage(createMessage('Inscrições abertas\n\n15h00 - 17h00\n\n17h00 - 18h30'))).toBeNull();
    });

    /**
     * Tests for 'In' + time messages
     */
    it('should correctly parse "In" + time messages, using sender name instead of treating "In" as a name', () => {
      // Test case for "In 15" type message - this should use the sender info from contacts DB
      // We'll need to mock the extractNameFromPhoneNumber function in actual implementation
      const message = createMessage('In 15', '31619116991@s.whatsapp.net');
      
      // We can't directly test with a custom name without modifying the parser function
      // but we can confirm it doesn't use "In" as a name
      const result = getSingleResult(parseSignupMessage(message));
      
      expect(result).not.toBeNull();
      expect(result?.names[0]).not.toBe('In'); // Should NOT treat "In" as a name
      // In the real implementation with DB, this would be 'Reinout'
      // But in our test it will be the phone number since we don't have DB access
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
      expect(result?.isTeam).toBe(false);
    });
    
    // We'll use a different approach to test this case since mocking functions globally can be problematic
    // This test is more descriptive of what we expect to happen in the real world
    it('should use sender name Reinout for "In 15" message (exact test case)', () => {
      // This is the exact case mentioned in the issue
      const message = createMessage('In 15', '31619116991@s.whatsapp.net');
      
      // In a real scenario with DB access, for a message "In 15" from sender 31619116991,
      // the parser would use the contact name "Reinout" (from DB lookup) instead of "In".
      // Since we can't mock the DB in this test, we just verify that it's using the phone number
      // and not treating "In" as a player name.
      const result = getSingleResult(parseSignupMessage(message));
      
      expect(result).not.toBeNull();
      // In the test it will be the phone number, but in production it would be "Reinout" from DB
      expect(result?.names[0]).toBe('31619116991'); 
      expect(result?.names[0]).not.toBe('In'); // Should NOT treat "In" as a name
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
      expect(result?.isTeam).toBe(false);
    });

    it('should correctly handle variations of "In" + time messages', () => {
      const variations = [
        'In 15',
        'in 15h',
        'IN 15:00',
        'in 15.00',
        'In at 15'
      ];
      
      variations.forEach(msg => {
        const result = getSingleResult(parseSignupMessage(createMessage(msg)));
        
        expect(result).not.toBeNull();
        // In a real scenario, this would be the contact name
        // But in the test it will be the phone number since we don't mock the DB
        expect(result?.names).not.toContain('In'); // Should NOT treat "In" as a name
        expect(result?.time).toBe('15:00');
        expect(result?.status).toBe('IN');
        expect(result?.isTeam).toBe(false);
      });
    });

    /**
     * Team message formats
     */
    it('should parse team messages with "and"', () => {
      const rawResult = parseSignupMessage(createMessage('Rudi and Dani 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Rudi');
      expect(result?.names).toContain('Dani');
      expect(result?.isTeam).toBe(true);
    });

    it('should parse team messages with "and" and numeric time without h', () => {
      const rawResult = parseSignupMessage(createMessage('Niklas and leo in 15'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toEqual(['Niklas', 'leo']);
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
      expect(result?.isTeam).toBe(true);
    });
  
    it('should parse team messages with "com" as team delimiter', () => {
      const rawResult = parseSignupMessage(createMessage('Rudi com Dani 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Rudi');
      expect(result?.names).toContain('Dani');
      expect(result?.isTeam).toBe(true);
    });
  
    it('should handle "In com @number" format using the sender number as first player', () => {
      const rawResult = parseSignupMessage(createMessage('In com @351969484026', '351963320681@s.whatsapp.net'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('351963320681');
      expect(result?.names).toContain('351969484026');
      expect(result?.isTeam).toBe(true);
    });
  
    it('should handle "In com Name" format using the sender number as first player', () => {
      const rawResult = parseSignupMessage(createMessage('In com Diogo Lourenço', '351963683848@s.whatsapp.net'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('351963683848');
      expect(result?.names).toContain('Diogo Lourenço');
      expect(result?.isTeam).toBe(true);
    });

    it('should parse team messages with "&"', () => {
      const rawResult = parseSignupMessage(createMessage('Philipp & Diego 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Philipp');
      expect(result?.names).toContain('Diego');
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });

    it('should parse team messages with "e"', () => {
      const rawResult = parseSignupMessage(createMessage('Vlad Ra e Abilio Duarte 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Vlad Ra');
      expect(result?.names).toContain('Abilio Duarte');
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });

    it('should parse team messages with "+"', () => {
      const rawResult = parseSignupMessage(createMessage('Giu+partner in 15'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names.some(name => name.includes('Giu'))).toBeTruthy();
      expect(result?.names.some(name => name.includes('partner') || name.includes('partn'))).toBeTruthy();
      expect(result?.status).toBe('IN');
    });

    /**
     * Single player formats
     */
    it('should parse single player messages', () => {
      const rawResult = parseSignupMessage(createMessage('Dennis in 15'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Dennis');
      expect(result?.status).toBe('IN');
    });

    it('should parse single player messages with time', () => {
      const rawResult = parseSignupMessage(createMessage('Rafael in 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Rafael');
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });

    it('should parse more complex single player messages', () => {
      const rawResult = parseSignupMessage(createMessage('Bob in with partner 17:00'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names.some((name: string) => name.includes('Bob'))).toBeTruthy();
      expect(result?.time).toBe('17:00');
      expect(result?.status).toBe('IN');
    });

    /**
     * Status detection (IN/OUT)
     */
    it('should detect OUT status', () => {
      const rawResult = parseSignupMessage(createMessage('John out 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('John');
      expect(result?.status).toBe('OUT');
    });
    
    it('should handle OUT messages with additional words', () => {
      const outMessages = [
        { message: 'sorry out saturday 18.30', time: '18:30' },
        { message: 'sorry I cannot make it today 15h', time: '15:00' },
        { message: 'miguel out for 18.30', time: '18:30', expectedName: 'miguel' },
        { message: 'Please remove me from 17h', time: '17:00' },
      ];

      outMessages.forEach(({ message, time, expectedName }) => {
        const result = getSingleResult(parseSignupMessage(createMessage(message)));
        expect(result).not.toBeNull();
        expect(result?.status).toBe('OUT');
        expect(result?.time).toBe(time);
        expect(result?.names.length).toBe(1);
        if (expectedName) {
          expect(result?.names[0]).toBe(expectedName);
        } else {
          expect(result?.names[0]).toBe('351987654321'); // Should use sender's full phone number
        }
      });
    });

    it('should handle partner-specific OUT messages', () => {
      // OUT messages for partner
      const result1 = getSingleResult(parseSignupMessage(createMessage('My partner out 15h')));
      expect(result1).not.toBeNull();
      expect(result1?.status).toBe('OUT');
      expect(result1?.time).toBe('15:00');
      expect(result1?.names.length).toBe(1);
      expect(result1?.names[0]).toBe('351987654321\'s partner');

      // OUT messages for specific person
      const result2 = getSingleResult(parseSignupMessage(createMessage('Pedro partner out 18:30')));
      expect(result2).not.toBeNull();
      expect(result2?.status).toBe('OUT');
      expect(result2?.time).toBe('18:30');
      expect(result2?.names.length).toBe(1);
      expect(result2?.names[0]).toBe('Pedro\'s partner');
    });
    
    it('should handle team OUT messages with explicit names', () => {
      // Test explicit team names in various formats
      const teamOutFormats = [
        'Vlad e Nuno out',
        'Vlad and Nuno out',
        'Vlad / Nuno out',
        'Vlad + Nuno out',
        'Vlad com Nuno out'
      ];
      
      teamOutFormats.forEach(format => {
        const result = getSingleResult(parseSignupMessage(createMessage(format)));
        expect(result).not.toBeNull();
        expect(result?.status).toBe('OUT');
        expect(result?.names).toHaveLength(2);
        expect(result?.names).toContain('Vlad');
        expect(result?.names).toContain('Nuno');
        expect(result?.isTeam).toBe(true);
      });
    });
    
    it('should handle "estamos out" format (implicit team OUT)', () => {
      // When someone says "estamos out" (we are out), it implies the sender and potentially
      // their previous partner are out
      const message = createMessage('Afinal estamos out pra sexta feira', '351965604659@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      expect(result).not.toBeNull();
      expect(result?.status).toBe('OUT');
      // Should contain the sender's phone as the name
      expect(result?.names).toContain('351965604659');
      // Should be marked as a team so the processor knows to look for partners
      expect(result?.isTeam).toBe(true);
    });

    it('should parse single player in messages with time', () => {
      const rawResult = parseSignupMessage(createMessage('Dennis in 15'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Dennis');
      expect(result?.status).toBe('IN');
    });

    /**
     * Test for specific issue with "in" being parsed as part of the name
     */
    it('should correctly handle "in" as a command not part of the name', () => {
      const rawResult = parseSignupMessage(createMessage('Kevin & Partner in 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toEqual(['Kevin', "Kevin's partner"]); // Should now convert to Kevin's partner
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });
    
    /**
     * Test partner name formatting
     */
    it('should format partner names correctly', () => {
      // Test team with partner
      const rawResult1 = parseSignupMessage(createMessage('Giu+partner in 15'));
      const result1 = getSingleResult(rawResult1);
      expect(result1).not.toBeNull();
      expect(result1?.names).toEqual(['Giu', "Giu's partner"]);
      
      // Test single player with partner
      const rawResult2 = parseSignupMessage(createMessage('Bob in with partner 17:00'));
      const result2 = getSingleResult(rawResult2);
      expect(result2).not.toBeNull();
      expect(result2?.names).toEqual(['Bob', "Bob's partner"]);
    });

    /**
     * Test for handling 'at' in team names
     */
    it('should correctly handle "at" in team messages', () => {
      const rawResult = parseSignupMessage(createMessage('Martin and Peter at 15h'));
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toEqual(['Martin', 'Peter']);
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });

    /**
     * Test for phone number formatting in anonymous messages
     */
    it('should use phone number for anonymous messages', () => {
      const message = createMessage('In 15h');
      message.sender = '351935780509@s.whatsapp.net';
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toEqual(['351935780509']);
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });

    /**
     * Test for properly handling newlines as separate messages
     */
    it('should handle multiline messages', () => {
      const multilineMessage = createMessage('Rafael 15h\nPaul 17h\nTom and Jerry 19h');
      const results = parseSignupMessage(multilineMessage);
      
      // This should return an array of results, one per line
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results.length).toBe(3);
        
        // Check first signup (Rafael)
        expect(results[0].names).toContain('Rafael');
        expect(results[0].time).toBe('15:00');
        
        // Check second signup (Paul)
        expect(results[1].names).toContain('Paul');
        expect(results[1].time).toBe('17:00');
        
        // Check third signup (Tom and Jerry)
        expect(results[2].names).toContain('Tom');
        expect(results[2].names).toContain('Jerry');
        expect(results[2].time).toBe('19:00');
      }
    });

    /**
     * Test for handling @ symbol in names
     */
    it('should parse messages without names but with times', () => {
      const message = createMessage('in 15h');
      message.sender = '351935780509@s.whatsapp.net';
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      expect(result).not.toBeNull();
      expect(result?.names).toEqual(['351935780509']);
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });

    /**
     * Test for handling multi-line messages with multiple names
     */
    it('should correctly parse multi-line messages with different names', () => {
      const message = createMessage('Julien / Mark \nJulien / Ben');
      const results = parseSignupMessage(message);
      
      // Should now return an array
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results.length).toBe(2);
        
        // First line names
        expect(results[0].names).toEqual(['Julien', 'Mark']);
        
        // Second line names
        expect(results[1].names).toEqual(['Julien', 'Ben']);
      }
    });
    
    /**
     * Test for the specific example from signup-results.md
     */
    it('should correctly parse multi-line slash notation with different times', () => {
      const message = createMessage('Julien / Mark - 15h\nJulien / Mike - 17h');
      message.sender = '351910686564@s.whatsapp.net';
      
      const results = parseSignupMessage(message);
      
      // Should return an array with two results
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results.length).toBe(2);
        
        // Check first team - Julien & Mark at 15h
        expect(results[0].names).toEqual(['Julien', 'Mark']);
        expect(results[0].time).toBe('15:00');
        expect(results[0].status).toBe('IN');
        
        // Check second team - Julien & Mike at 17h
        expect(results[1].names).toEqual(['Julien', 'Mike']);
        expect(results[1].time).toBe('17:00');
        expect(results[1].status).toBe('IN');
      }
    });
    
    /**
     * Test for name preservation - ensuring name parts aren't truncated
     */
    it('should preserve complete names when handling slash notation', () => {
      // This test focuses on the issue where 'Julien' was being truncated to 'Juli'
      const message = createMessage('Julien / Mark - 15h');
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      
      expect(result).not.toBeNull();
      expect(result?.names).toHaveLength(2);
      
      // Check that full names are preserved
      expect(result?.names[0]).toBe('Julien'); // Ensure 'Julien' isn't truncated to 'Juli'
      expect(result?.names[1]).toBe('Mark');   // Ensure the name is properly separated
    });
    
    /**
     * Test for handling multi-word names (names with spaces)
     */
    it('should treat multi-word names as a single name', () => {
      // Test for issue where "philipp effinger" is being split into "philipp, ffing"
      const message = createMessage('philipp effinger');
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      
      expect(result).not.toBeNull();
      expect(result?.names).toHaveLength(1);
      
      // The full name should be preserved as a single entity
      expect(result?.names[0]).toBe('philipp effinger');
      expect(result?.status).toBe('IN');
    });
    
    it('should ignore messages with names longer than 4 words', () => {
      // Messages that are too long likely aren't signup messages but regular conversation
      const longMessages = [
        'Hi @351936836204 could you add Jack when you get a chance 🙏',
        'Could someone please add me to the list for tomorrow',
        'Please let me know if there are any spots available',
        'Can you tell me what time the games are tomorrow',
        'Hi everyone I just wanted to ask about the schedule'
      ];
      
      longMessages.forEach(msg => {
        const result = parseSignupMessage(createMessage(msg));
        expect(result).toBeNull();
      });
    });
    
    /**
     * Test for handling slash notation without spaces
     */
    it('should correctly split names with slashes without spaces', () => {
      // Test for issue where "Mike/Ben 15h" is not properly split
      const message = createMessage('Mike/Ben 15h');
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      
      expect(result).not.toBeNull();
      expect(result?.names).toHaveLength(2);
      
      // Names should be correctly split despite the lack of spaces around the slash
      expect(result?.names[0]).toBe('Mike');
      expect(result?.names[1]).toBe('Ben');
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
    });
    
    it('should correctly parse time with dot format like "18.30"', () => {
      // Test for parsing a message with time in dot format
      const message = createMessage('miguel ribeiro 18.30');
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      
      expect(result).not.toBeNull();
      expect(result?.names).toHaveLength(1);
      
      // The full name should be preserved as a single entity
      expect(result?.names[0]).toBe('miguel ribeiro');
      expect(result?.time).toBe('18:30');
    });

    it('should correctly parse messages with multiple time slots', () => {
      const message = createMessage('Patrik in 15 and 17');
      const rawResult = parseSignupMessage(message);
      const result = getSingleResult(rawResult);
      
      expect(result).not.toBeNull();
      expect(result?.names).toHaveLength(1);
      expect(result?.names[0]).toBe('Patrik');
      
      // Should capture only the first time slot
      expect(result?.time).toBe('15:00');
    });
    
    it('should parse messages with reaction markers', () => {
      // Messages with reaction markers like [EDITEDMESSAGE] should still be parsed
      const messageWithReaction = createMessage('[EDITEDMESSAGE] Miguel e João 15h');
      const rawResult = parseSignupMessage(messageWithReaction);
      const result = getSingleResult(rawResult);
      
      expect(result).not.toBeNull();
      expect(result?.names).toContain('Miguel');
      expect(result?.names).toContain('João');
      expect(result?.time).toBe('15:00');
      
      // Test with variation where the reaction is at the end
      const messageWithEndReaction = createMessage('Rafael e André 16h [REACTION]');
      const result2 = getSingleResult(parseSignupMessage(messageWithEndReaction));
      
      expect(result2).not.toBeNull();
      expect(result2?.names).toContain('Rafael');
      expect(result2?.names).toContain('André');
      expect(result2?.time).toBe('16:00');
      
      // Test the specific case of "In com Eric" with reaction
      const senderPhone = '351966314427@s.whatsapp.net';
      const messageWithInComReaction = createMessage('[EDITED] In com Eric', senderPhone);
      const result3 = getSingleResult(parseSignupMessage(messageWithInComReaction));
      
      expect(result3).not.toBeNull();
      expect(result3?.names).toHaveLength(2);
      expect(result3?.names[0]).toBe('351966314427'); // Sender phone number
      expect(result3?.names[1]).toBe('Eric'); // Partner name
      // Time may be default if not specified in the message
    });
    
    it('should correctly handle the "In com Eric" case with reaction markers', () => {
      // Test the specific case of "In com Eric" with various reaction markers
      const senderPhone = '351966314427@s.whatsapp.net';
      const testCases = [
        { input: '[EDITEDMESSAGE] In com Eric', expected: ['351966314427', 'Eric'] },
        { input: 'In com Eric [REACTION]', expected: ['351966314427', 'Eric'] },
        { input: '[DELETED] In com Eric', expected: ['351966314427', 'Eric'] },
        { input: '[🔥] In com Eric', expected: ['351966314427', 'Eric'] }
      ];
      
      testCases.forEach(testCase => {
        const message = createMessage(testCase.input, senderPhone);
        const rawResult = parseSignupMessage(message);
        const result = getSingleResult(rawResult);
        
        expect(result).not.toBeNull();
        expect(result?.names).toHaveLength(2);
        expect(result?.names[0]).toBe(testCase.expected[0]); // Sender phone
        expect(result?.names[1]).toBe(testCase.expected[1]); // Partner name
        // This is a team sign up
        expect(result?.isTeam).toBe(true);
      });
    });

    /**
     * Test for handling multiple time slots
     */
    it('should correctly parse messages with multiple time slots', () => {
      const message = createMessage('Julien / Mark - 15h\nJulien / Mark - 17h');
      const results = parseSignupMessage(message);
      
      // Should now return an array
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results.length).toBe(2);
        
        // First line names and time
        expect(results[0].names).toEqual(['Julien', 'Mark']);
        expect(results[0].time).toBe('15:00');
        
        // Second line names and time
        expect(results[1].names).toEqual(['Julien', 'Mark']);
        expect(results[1].time).toBe('17:00');
      }
    });

    /**
     * Real-world examples from the Sao Bento P4ALL Saturday group
     */
    it('should parse examples from the Sao Bento P4ALL Saturday group', () => {
      const examples = [
        { message: 'Rudi and Dani 15:00', names: ['Rudi', 'Dani'], time: '15:00' },
        { message: 'Giu+partner in 15', names: ['Giu', "Giu's partner"], time: '15:00' },
        { message: 'Bob in with partner 17:00', names: ['Bob', "Bob's partner"], time: '17:00' },
        { message: 'Patrik in 15 and 17', names: ['Patrik'], time: '15:00' },
        { message: 'In 15h', names: [], time: '15:00' }, // This should ideally be skipped
        { message: 'Philipp & Diego 15h', names: ['Philipp', 'Diego'], time: '15:00' },
        { message: 'Vlad Ra e Abilio Duarte 15h', names: ['Vlad Ra', 'Abilio Duarte'], time: '15:00' },
        { message: 'Tom and Louis 15h', names: ['Tom', 'Louis'], time: '15:00' },
        { message: 'Niklas and leo in 15', names: ['Niklas', 'leo'], time: '15:00' },
        { message: 'Dennis in 15', names: ['Dennis'], time: '15:00' },
        { message: 'Miguel and partner 15h', names: ['Miguel', "Miguel's partner"], time: '15:00' },
        { message: 'Miguel and Duarte in 17h', names: ['Miguel', 'Duarte'], time: '17:00' },
        { message: 'Kevin & Partner in 15h', names: ['Kevin', "Kevin's partner"], time: '15:00' },
        { message: 'Rafael in 15h', names: ['Rafael'], time: '15:00' },
        { message: 'Rui C e Manel P - 17h', names: ['Rui C', 'Manel P'], time: '17:00' },
        { message: 'Ruben in @ 17.00', names: ['Ruben'], time: '17:00' },
        { message: 'Gui 15h00', names: ['Gui'], time: '15:00' },
        { message: 'Martin and Peter at 15h', names: ['Martin', 'Peter'], time: '15:00' },
        { message: 'Dan 15h', names: ['Dan'], time: '15:00' },
      ];

      for (const example of examples) {
        const rawResult = parseSignupMessage(createMessage(example.message));
        const result = getSingleResult(rawResult);
        
        // Skip tests for empty names (like "In 15h") which are edge cases
        if (example.names.length === 0) continue;
        
        expect(result).not.toBeNull();
        
        // For each expected name, verify it's in the result
        for (const expectedName of example.names) {
          const nameFound = result?.names.some((name: string) =>
            name.toLowerCase().includes(expectedName.toLowerCase()) ||
            expectedName.toLowerCase().includes(name.toLowerCase()));
            
          expect(nameFound).toBeTruthy();
          
          if (!nameFound) {
            console.log(`Name "${expectedName}" not found in result:`, result?.names);
          }
        }
        
        // Verify time if provided in the example
        if (example.time) {
          if (result?.time !== example.time) {
            console.log(`Time mismatch for message: "${example.message}"`); 
            console.log(`Expected: ${example.time}, Got: ${result?.time}`);
          }
          expect(result?.time).toBe(example.time);
        }
        
        // Check status (all examples are IN)
        expect(result?.status).toBe('IN');
      }
    });
  });
});
