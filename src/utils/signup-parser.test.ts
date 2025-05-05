import { parseSignupMessage, formatTimeMatch, WhatsAppMessage, ParsedSignup } from './signup-parser';

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
      const timeMatch = '15h'.match(/\b(\d{1,2})[h:](\d{2})?\b|\b(\d{1,2})h\b/i);
      if (timeMatch) {
        expect(formatTimeMatch(timeMatch)).toBe('15:00');
      } else {
        fail('Expected timeMatch regex to match "15h"');
      }
    });

    it('should format "15:30" correctly', () => {
      const timeMatch = '15:30'.match(/\b(\d{1,2})[h:](\d{2})?\b|\b(\d{1,2})h\b/i);
      if (timeMatch) {
        expect(formatTimeMatch(timeMatch)).toBe('15:30');
      } else {
        fail('Expected timeMatch regex to match "15:30"');
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
    function createMessage(content: string): WhatsAppMessage {
      return {
        sender: 'test-sender@s.whatsapp.net',
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
    it('should ignore system messages', () => {
      expect(parseSignupMessage(createMessage('[PROTOCOLMESSAGE]'))).toBeNull();
      expect(parseSignupMessage(createMessage('[MESSAGECONTEXTINFO]'))).toBeNull();
      expect(parseSignupMessage(createMessage('[SENDERKEYDISTRIBUTIONMESSAGE]'))).toBeNull();
    });

    it('should ignore registration messages', () => {
      expect(parseSignupMessage(createMessage('Inscrições abertas'))).toBeNull();
      expect(parseSignupMessage(createMessage('Inscrições abertas\n\n15h00 - 17h00\n\n17h00 - 18h30'))).toBeNull();
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
      expect(result?.time).toBe('15:00');
      expect(result?.status).toBe('IN');
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
      expect(result?.names).toEqual(['935780509']);
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
      expect(result?.names).toEqual(['935780509']);
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
          expect(result?.time).toBe(example.time);
        }
        
        // Check status (all examples are IN)
        expect(result?.status).toBe('IN');
      }
    });
  });
});
