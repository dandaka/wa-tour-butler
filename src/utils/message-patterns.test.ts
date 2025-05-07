/**
 * Tests for the message pattern utilities
 */

import { messageContainsExplicitName } from './message-patterns';

describe('Message Patterns', () => {
  describe('messageContainsExplicitName', () => {
    it('should return false for empty messages', () => {
      expect(messageContainsExplicitName('')).toBe(false);
      expect(messageContainsExplicitName('  ')).toBe(false);
    });
    
    it('should return false for messages with just "in" or "out"', () => {
      expect(messageContainsExplicitName('in')).toBe(false);
      expect(messageContainsExplicitName('OUT')).toBe(false);
      expect(messageContainsExplicitName('  in  ')).toBe(false);
    });
    
    it('should return false for messages with just time formats', () => {
      expect(messageContainsExplicitName('15h')).toBe(false);
      expect(messageContainsExplicitName('15:00')).toBe(false);
      expect(messageContainsExplicitName('18.30')).toBe(false);
    });
    
    it('should return false for messages with just "in" + time', () => {
      expect(messageContainsExplicitName('in 15h')).toBe(false);
      expect(messageContainsExplicitName('IN 15:00')).toBe(false);
      expect(messageContainsExplicitName('in 18.30')).toBe(false);
    });
    
    it('should return false for common OUT phrases', () => {
      expect(messageContainsExplicitName('sorry out')).toBe(false);
      expect(messageContainsExplicitName('cannot make it')).toBe(false);
      expect(messageContainsExplicitName("can't make it")).toBe(false);
      expect(messageContainsExplicitName('please remove me')).toBe(false);
    });
    
    it('should return true for messages with names', () => {
      expect(messageContainsExplicitName('John 15h')).toBe(true);
      expect(messageContainsExplicitName('Alex and Maria in 15:00')).toBe(true);
      expect(messageContainsExplicitName('Diego e Johanna 13h30')).toBe(true);
      expect(messageContainsExplicitName('Sorry, Miguel out for 18.30')).toBe(true);
    });
    
    it('should return true for just names without times or commands', () => {
      expect(messageContainsExplicitName('John')).toBe(true);
      expect(messageContainsExplicitName('Diego e Johanna')).toBe(true);
    });
  });
});
