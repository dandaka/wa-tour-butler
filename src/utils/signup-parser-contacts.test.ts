/**
 * Tests for the contact name fallback behavior in the signup parser
 * 
 * This test suite verifies that contact names are ONLY used when no name is
 * provided in the message content, following the fallback pattern requested.
 */

import { parseSignupMessage, WhatsAppMessage, ParsedSignup } from './signup-parser';
import * as contactsService from '../services/contacts';

// Mock the contacts service
jest.mock('../services/contacts', () => ({
  getContactDisplayName: jest.fn()
}));

describe('Signup Parser - Contact Name Fallback', () => {
  // Helper function to create a test message
  function createMessage(content: string, sender: string = '351987654321@s.whatsapp.net'): WhatsAppMessage {
    return {
      content,
      sender,
      timestamp: Date.now()
    };
  }

  // Helper function to get the first result when result could be an array or single item
  function getSingleResult(result: ParsedSignup | ParsedSignup[] | null): ParsedSignup | null {
    if (!result) return null;
    if (Array.isArray(result)) {
      return result[0] || null;
    }
    return result;
  }

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Set up default mock behavior for the contacts service
    // This simulates that we have contact names in the database
    (contactsService.getContactDisplayName as jest.Mock).mockImplementation((jid: string) => {
      // Map specific phone numbers to contact names for testing
      const contacts: Record<string, string> = {
        '351987654321@s.whatsapp.net': 'John Smith',
        '351966314427@s.whatsapp.net': 'Maria Silva',
        '351961234567@s.whatsapp.net': 'David Wong',
        '351910774491@s.whatsapp.net': 'Alex Jones'
      };
      
      return contacts[jid] || jid.replace('@s.whatsapp.net', '');
    });
  });

  describe('Contact Name Fallback Behavior', () => {
    it('should use explicit name from message when provided', () => {
      // Message has an explicit name "Bob"
      const message = createMessage('Bob 15h', '351987654321@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      // Should use "Bob" from message, not "John Smith" from contact info
      expect(result?.names).toEqual(['Bob']);
      
      // Verify contact service was not used for the name
      // The service may be called for other reasons, but the result shouldn't be used
      expect(result?.names).not.toContain('John Smith');
    });
    
    it('should use contact name as fallback when message only contains "in"', () => {
      // Message only says "in" with no name
      const message = createMessage('in', '351966314427@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      // Should use contact name "Maria Silva" as fallback
      expect(result?.names).toEqual(['Maria Silva']);
      expect(contactsService.getContactDisplayName).toHaveBeenCalledWith('351966314427@s.whatsapp.net');
    });
    
    it('should use contact name as fallback when message only contains a time', () => {
      // Message only contains a time with no explicit name
      const message = createMessage('15h', '351961234567@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      // Should use contact name "David Wong" as fallback
      expect(result?.names).toEqual(['David Wong']);
      expect(contactsService.getContactDisplayName).toHaveBeenCalledWith('351961234567@s.whatsapp.net');
    });
    
    it('should use contact name for "in + time" messages with no explicit name', () => {
      // Message has "in" and time but no explicit name
      const message = createMessage('in 15:00', '351910774491@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      // Should use contact name "Alex Jones" as fallback
      expect(result?.names).toEqual(['Alex Jones']);
      expect(contactsService.getContactDisplayName).toHaveBeenCalledWith('351910774491@s.whatsapp.net');
    });
    
    it('should use contact name for OUT messages with no explicit name', () => {
      // OUT message with no explicit name
      const message = createMessage('sorry out today', '351987654321@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      // Should use contact name "John Smith" as fallback
      expect(result?.status).toBe('OUT');
      expect(result?.names).toEqual(['John Smith']);
      expect(contactsService.getContactDisplayName).toHaveBeenCalledWith('351987654321@s.whatsapp.net');
    });
    
    it('should not overwrite explicit names in team messages with contact info', () => {
      // Team message with explicit names
      const message = createMessage('Mike and Tom 15h', '351987654321@s.whatsapp.net');
      const result = getSingleResult(parseSignupMessage(message));
      
      // Should use names from message, not contact info
      expect(result?.names).toContain('Mike');
      expect(result?.names).toContain('Tom');
      
      // Should NOT contain the contact name
      expect(result?.names).not.toContain('John Smith');
    });
  });
});
