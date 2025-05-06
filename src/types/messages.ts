/**
 * WhatsApp message type definitions
 * 
 * This module contains types related to WhatsApp messages
 * used throughout the application.
 */

/**
 * Represents a WhatsApp message with basic metadata
 */
export interface WhatsAppMessage {
  id?: string;
  chat_id?: string;
  sender: string;
  timestamp: number;
  content: string;
  is_from_me?: number;
}

/**
 * Represents a message from the database with additional fields
 */
export interface DatabaseMessage extends WhatsAppMessage {
  id: string;
  chat_id: string;
  is_from_me: number;
}
