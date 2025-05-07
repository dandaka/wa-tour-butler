/**
 * Tests for the registration parser
 */

import * as path from 'path';
// Import functions from parser
import { 
  loadMessages, 
  loadContacts
} from '../parser/parser-main';
// Import types directly from types directories
import { WhatsAppMessage } from '../types/messages';
import { Contact } from '../types/parser';

describe('Registration Parser', () => {
  let messages: WhatsAppMessage[];
  let contacts: Contact[];

  // Load test data before running tests
  beforeAll(() => {
    const messagesPath = path.resolve(__dirname, '../../data/test-data/120363028202164779-messages.json');
    const contactsPath = path.resolve(__dirname, '../../data/test-data/contacts.json');
    
    messages = loadMessages(messagesPath);
    contacts = loadContacts(contactsPath);
  });

  test('should load messages correctly', () => {
    expect(messages).toBeDefined();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
  });

  test('should load contacts correctly', () => {
    expect(contacts).toBeDefined();
    expect(Array.isArray(contacts)).toBe(true);
    expect(contacts.length).toBeGreaterThan(0);
  });

  // Basic test for the parser - we'll expand these tests
  /* Commenting out the parsing test until we implement the function
  test('should parse a basic message', () => {
    const testMessage: WhatsAppMessage = {
      id: "3A53DAC7839ECF9C2859",
      timestamp: 1746467948,
      sender: "351914186974@s.whatsapp.net",
      content: "Rudi and Dani 15:00",
      fromMe: false
    };

    // Will implement this test when we add the parsing function
    // const result = parseRegistration(testMessage, contacts);
    // expect(result).toBeDefined();
    // expect(result.originalText).toBe(testMessage.content);
    // expect(result.rawWhatsAppObj).toEqual(testMessage);
  });
  */
});
