import { findRegistrationMessage, findPotentialRegistrationMessages } from './registration';
import { WhatsAppMessage } from '../types/messages';
import { REGISTRATION_KEYWORDS } from '../constants';

describe('findRegistrationMessage', () => {
  const adminId = '351916949231';
  // Create test messages
  const createMessage = (content: string, sender: string, timestamp: number): WhatsAppMessage => ({
    content,
    sender,
    timestamp
  });

  test('should find message with registration keyword from admin', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage('Inscrições abertas', adminId, 2000),
      createMessage('I want to sign up', 'otherUser', 3000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(2000);
    expect(result?.content).toBe('Inscrições abertas');
  });

  test('should find admin message with time pattern like 15h00', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage('Tournament starts at 15h00 today', adminId, 2000),
      createMessage('I want to sign up', 'otherUser', 3000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(2000);
  });

  test('should find admin message with time pattern like 15:00', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage('Tournament starts at 15:00 today', adminId, 2000),
      createMessage('I want to sign up', 'otherUser', 3000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(2000);
  });

  test('should ignore non-admin messages with registration keywords', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage('Inscrições abertas', 'otherUser', 2000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeNull();
  });

  test('should return the most recent registration message', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Inscrições abertas for yesterday', adminId, 1000),
      createMessage('Inscrições abertas for today', adminId, 2000)
    ];

    // When groupInfo is not provided, we don't filter by timestamp, so it will find based on content
    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.content).toContain('Inscrições abertas');
  });

  test('should handle admin ID with @s.whatsapp.net suffix', () => {
    const adminWithSuffix = `${adminId}@s.whatsapp.net`;
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', 'someone', 1000),
      createMessage('Inscrições abertas', adminWithSuffix, 2000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(2000);
  });

  test('should return null if no registration message is found', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage('How are you?', adminId, 2000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeNull();
  });

  test('should handle empty message array', () => {
    const messages: WhatsAppMessage[] = [];
    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeNull();
  });

  /**
   * Tests for system message handling
   */
  test('should filter out system messages like SENDERKEYDISTRIBUTIONMESSAGE', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage('[SENDERKEYDISTRIBUTIONMESSAGE]', adminId, 2000),
      createMessage('[PROTOCOLMESSAGE]', adminId, 3000),
      createMessage('[MESSAGECONTEXTINFO]', adminId, 4000),
      createMessage('❗️Inscrições abertas para o PADEL4ALL domingo às 19:00 no SALDANHA 🎾🎾', adminId, 5000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.content).toBe('❗️Inscrições abertas para o PADEL4ALL domingo às 19:00 no SALDANHA 🎾🎾');
    expect(result?.timestamp).toBe(5000);
  });

  test('should recognize the correct opening message format', () => {
    const validAnnouncementMessage = '❗️Inscrições abertas para o PADEL4ALL domingo às 19:00 no SALDANHA 🎾🎾';
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone', adminId, 1000),
      createMessage(validAnnouncementMessage, adminId, 2000),
      createMessage('I want to sign up', 'otherUser', 3000)
    ];

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.content).toBe(validAnnouncementMessage);
  });
});

/**
 * Tests for findPotentialRegistrationMessages
 */
describe('findPotentialRegistrationMessages', () => {
  const adminId = '351916949231';
  // Create test messages
  const createMessage = (content: string, sender: string, timestamp: number): WhatsAppMessage => ({
    content,
    sender,
    timestamp
  });

  test('should filter out system messages', () => {
    const messages: WhatsAppMessage[] = [
      createMessage('Hello everyone, tournament at 15:00', adminId, 1000),
      createMessage('[SENDERKEYDISTRIBUTIONMESSAGE]', adminId, 2000),
      createMessage('[PROTOCOLMESSAGE]', adminId, 3000),
      createMessage('[MESSAGECONTEXTINFO]', adminId, 4000)
    ];

    const result = findPotentialRegistrationMessages(messages, adminId);
    // System messages should be filtered out and only registration-like messages remain
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('Hello everyone, tournament at 15:00');
  });

  test('should correctly identify the expected opening message format', () => {
    const validAnnouncementMessage = '❗️Inscrições abertas para o PADEL4ALL domingo às 19:00 no SALDANHA 🎾🎾';
    const messages: WhatsAppMessage[] = [
      createMessage('[SENDERKEYDISTRIBUTIONMESSAGE]', adminId, 1000),
      createMessage(validAnnouncementMessage, adminId, 2000)
    ];

    const result = findPotentialRegistrationMessages(messages, adminId);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe(validAnnouncementMessage);
  });
});
