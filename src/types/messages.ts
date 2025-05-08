/**
 * WhatsApp message type definitions
 * 
 * This module contains types related to WhatsApp messages
 * used throughout the application.
 */
import { MessageCommand } from './message-parsing';

/**
 * Represents a WhatsApp message with basic metadata
 */
export interface WhatsAppMessage {
  id?: string;
  chat_id?: string;
  sender: string;
  sender_name?: string; // Name of the sender from contacts
  timestamp: number;
  timestamp_fmt?: string; // Human-readable formatted timestamp (YYYY-MM-DD HH:MM:SS)
  content: string;
  is_from_me?: number;
  fromMe?: boolean;  // Added for compatibility with message formats that use this property
  batch?: string | null;   // Assigned batch/timeslot based on keywords
  modifier?: string; // Message classification (in, out, team, conversation)
}

/**
 * Enhanced WhatsApp message with all the enriched properties
 * used throughout the parsing pipeline
 */
export interface EnhancedWhatsAppMessage extends WhatsAppMessage {
  timestamp_fmt: string;        // Formatted timestamp
  sender_name: string;          // Name from contacts or default
  batch: string | null;         // Assigned batch/time slot
  modifier: MessageCommand;     // Message classification
  modifier?: string; // Message classification (IN, OUT, TEAM, CONVERSATION)
}

/**
 * Represents a message from the database with additional fields
 */
export interface DatabaseMessage extends WhatsAppMessage {
  id: string;
  chat_id: string;
  is_from_me: number;
}
