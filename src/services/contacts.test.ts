/**
 * Tests for the Contacts Service
 */

import { getContactDisplayName } from './contacts';
import BetterSqlite3 from 'better-sqlite3';

// Mock the database
jest.mock('better-sqlite3', () => {
  // Mock implementation of the database
  const mockDb = {
    prepare: jest.fn().mockReturnThis(),
    get: jest.fn(),
    close: jest.fn()
  };
  
  // Return a constructor function that returns our mock
  return jest.fn(() => mockDb);
});

describe('Contacts Service', () => {
  // Get the mocked database instance
  const mockDb = (BetterSqlite3 as jest.Mock)();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('getContactDisplayName', () => {
    it('should return contact name when available in the database', () => {
      // Mock the contact info being found
      mockDb.get.mockReturnValueOnce({
        name: null,
        notify: 'John Smith',
        push_name: null,
        is_group: false
      });
      
      const result = getContactDisplayName('351912345678@s.whatsapp.net');
      
      // Verify the result uses the notify field
      expect(result).toBe('John Smith');
      // Verify the query was called with the right parameters
      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockDb.get).toHaveBeenCalledWith('351912345678@s.whatsapp.net');
    });
    
    it('should use name field first if available', () => {
      // Mock the contact info being found with multiple fields
      mockDb.get.mockReturnValueOnce({
        name: 'John Full Name',
        notify: 'John N',
        push_name: 'Johnny',
        is_group: false
      });
      
      const result = getContactDisplayName('351912345678@s.whatsapp.net');
      
      // Verify the result uses the name field (highest priority)
      expect(result).toBe('John Full Name');
    });
    
    it('should fall back to push_name if name and notify are not available', () => {
      // Mock the contact info with only push_name
      mockDb.get.mockReturnValueOnce({
        name: null,
        notify: null,
        push_name: 'Johnny',
        is_group: false
      });
      
      const result = getContactDisplayName('351912345678@s.whatsapp.net');
      
      // Verify the result uses the push_name field
      expect(result).toBe('Johnny');
    });
    
    it('should return the phone number when no contact info is found', () => {
      // Mock no contact info found
      mockDb.get.mockReturnValueOnce(undefined);
      
      const result = getContactDisplayName('351912345678@s.whatsapp.net');
      
      // Verify the result is just the phone number
      expect(result).toBe('351912345678');
    });
    
    it('should handle group JIDs appropriately', () => {
      // Mock no contact info found for a group
      mockDb.get.mockReturnValueOnce(undefined);
      
      const result = getContactDisplayName('351919755889-1528547030@g.us');
      
      // Verify the result is formatted for a group
      expect(result).toContain('Group by');
    });
    
    it('should close the database connection even on error', () => {
      // Mock a database error
      mockDb.get.mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // The function should handle the error and return the JID
      const result = getContactDisplayName('351912345678@s.whatsapp.net');
      
      // Verify the database was still closed
      expect(mockDb.close).toHaveBeenCalled();
      expect(result).toBe('351912345678');
    });
  });
});
