import { findRegistrationMessage } from './registration';
import { WhatsAppMessage } from '../types/messages';

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

    const result = findRegistrationMessage(messages, adminId);
    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(2000);
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
});
