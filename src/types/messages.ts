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
  timestamp_fmt?: string; // Human-readable formatted timestamp (YYYY-MM-DD HH:MM:SS)
  content: string;
  is_from_me?: number;
  fromMe?: boolean;  // Added for compatibility with message formats that use this property
}

/**
 * Represents a message from the database with additional fields
 */
export interface DatabaseMessage extends WhatsAppMessage {
  id: string;
  chat_id: string;
  is_from_me: number;
}
