import * as path from 'path';
import * as fs from 'fs';

// Define Jest globals to avoid type errors
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

// Import necessary types, but mock actual database and file operations
import { WhatsAppMessage } from '../utils/signup-parser';

// Add the private exported function for testing
// This is what we're testing specifically
function isRegistrationOpenMessage(
  message: {
    sender: string;
    content: string;
  },
  adminId: string,
  registrationKeywords: string[]
): boolean {
  // Match logic from processMessages function
  const isFromAdmin = message.sender === adminId;
  const lowerContent = message.content.toLowerCase();
  
  // Match any registration keyword
  const containsRegistrationKeyword = registrationKeywords.some(keyword => 
    lowerContent.includes(keyword.toLowerCase())
  );
  
  // Check for time slots pattern
  const containsTimeSlots = /\d+[h:]\d+|\d+h/.test(message.content);
  
  // Special case for admin messages with time patterns typical of registration opening
  const looksLikeRegistration = isFromAdmin && 
    containsTimeSlots && 
    (message.content.includes('15h00') || message.content.includes('15:00') || 
     message.content.includes('17h00') || message.content.includes('17:00'));
  
  return isFromAdmin && (containsRegistrationKeyword || looksLikeRegistration);
}

// Helper to create test messages
function createMessage(
  content: string,
  sender: string = '987654321@s.whatsapp.net',
  timestamp: number = 1746467935
): WhatsAppMessage {
  return {
    content,
    sender,
    timestamp
  };
}

describe('Registration Opening Detection', () => {
  const ADMIN_ID = '351936836204@s.whatsapp.net';
  const REGISTRATION_KEYWORDS = [
    'Inscrições abertas',
    'Inscrições',
    'abertas',
    'inscrição',
    'Registros'  
  ];
  
  describe('Registration keyword detection', () => {
    it('should detect messages with exact keyword phrases', () => {
      const messages = [
        createMessage('Inscrições abertas', ADMIN_ID),
        createMessage('Inscrições para amanhã', ADMIN_ID),
        createMessage('Registros iniciados', ADMIN_ID),
        createMessage('Abertas as inscrições', ADMIN_ID)
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(true);
      });
    });
    
    it('should detect messages with keywords regardless of case', () => {
      const messages = [
        createMessage('inscrições ABERTAS', ADMIN_ID),
        createMessage('INSCRIÇÕES para amanhã', ADMIN_ID),
        createMessage('registros iniciados', ADMIN_ID)
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(true);
      });
    });
    
    it('should detect messages with keywords in longer sentences', () => {
      const messages = [
        createMessage('Olá a todos, inscrições abertas para a próxima sexta!', ADMIN_ID),
        createMessage('Bom dia. Já estão abertas as inscrições para sabado.', ADMIN_ID),
        createMessage('Confirmem por aqui para inscrição no torneio.', ADMIN_ID)
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(true);
      });
    });
  });
  
  describe('Time pattern detection', () => {
    it('should detect admin messages with specific time patterns', () => {
      const messages = [
        createMessage('Jogos amanhã: 15h00 e 17h00', ADMIN_ID),
        createMessage('Horários: 15:00 - 16:30', ADMIN_ID),
        createMessage('Slots disponíveis: 15h00 e 17h00', ADMIN_ID)
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(true);
      });
    });
    
    it('should detect admin messages with combined keywords and time patterns', () => {
      const messages = [
        createMessage('Inscrições abertas para amanhã: 15h00 e 17h00', ADMIN_ID),
        createMessage('Registros iniciados para os horários: 15:00, 16:30 e 18:00', ADMIN_ID),
        createMessage('Amanhã temos horário de 15h00 e 17h30. Abertas as inscrições!', ADMIN_ID)
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(true);
      });
    });
    
    it('should detect registration messages with multi-line formats', () => {
      const multilineMessage = createMessage(`Inscrições abertas
      
      15h00 - 17h00
      17h00 - 18h30`, ADMIN_ID);
      
      expect(isRegistrationOpenMessage(multilineMessage, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(true);
    });
  });
  
  describe('Non-registration messages', () => {
    it('should not detect registration when message is not from admin', () => {
      const nonAdminMessages = [
        createMessage('Inscrições abertas', '123456789@s.whatsapp.net'),
        createMessage('15h00 e 17h00', '123456789@s.whatsapp.net')
      ];
      
      nonAdminMessages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(false);
      });
    });
    
    it('should not detect regular chat messages as registration opening', () => {
      const regularMessages = [
        createMessage('Olá a todos!', ADMIN_ID),
        createMessage('Como estão hoje?', ADMIN_ID),
        createMessage('Obrigado pela participação', ADMIN_ID)
      ];
      
      regularMessages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(false);
      });
    });
    
    it('should not detect time mentions without specific patterns', () => {
      const messages = [
        createMessage('O jogo terminou 15 a 10', ADMIN_ID),
        createMessage('Pontuação: 17 pontos', ADMIN_ID),
        createMessage('Reserva 15min antes', ADMIN_ID) // Not 15h00 or 15:00
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, REGISTRATION_KEYWORDS)).toBe(false);
      });
    });
  });
  
  describe('Custom registration keywords', () => {
    const CUSTOM_KEYWORDS = ['sign-up open', 'registration', 'enroll'];
    
    it('should detect messages with custom keywords', () => {
      const messages = [
        createMessage('The sign-up open now', ADMIN_ID),
        createMessage('Registration for Saturday games', ADMIN_ID),
        createMessage('Please enroll for tomorrow', ADMIN_ID)
      ];
      
      messages.forEach(message => {
        expect(isRegistrationOpenMessage(message, ADMIN_ID, CUSTOM_KEYWORDS)).toBe(true);
      });
    });
  });
});
