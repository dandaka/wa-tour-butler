/**
 * Parser Pipeline
 * 
 * This module implements the message parsing pipeline for WhatsApp Tournament Butler.
 * It transforms raw WhatsApp messages into structured MsgParsed objects.
 */

import { MsgParsed, MessageCommand, PlayerInfo } from '../types/message-parsing';
import { containsTimePattern } from '../utils/date';
import { loadContacts, getDisplayName as getContactName } from '../utils/contact-loader';

// Contact data cache
let contactsData: Record<string, string> | null = null;

/**
 * Get display name for a phone number using contacts data if available
 */
function getDisplayName(phoneNumber: string): string {
  // Clean the phone number
  const cleanNumber = phoneNumber.replace('@s.whatsapp.net', '');
  
  // Load contacts if not already loaded
  if (!contactsData) {
    try {
      const contactsPath = process.cwd() + '/data/test-data/contacts.json';
      contactsData = loadContacts(contactsPath);
      console.log(`Loaded ${Object.keys(contactsData).length} contacts for name resolution`);
    } catch (error) {
      console.warn('Failed to load contacts:', error);
      contactsData = {}; // Use empty object on failure
    }
  }
  
  // Get display name from contacts or use phone number as fallback
  return contactsData[cleanNumber] || cleanNumber;
}

/**
 * Pipeline step interface
 */
export interface ParserStep {
  name: string;
  process: (msg: MsgParsed) => MsgParsed;
}

/**
 * Core parser pipeline
 */
export class ParserPipeline {
  private steps: ParserStep[] = [];
  
  constructor() {
    // Register the pipeline steps in order
    this.registerStep({
      name: 'initialSetup',
      process: this.initialSetup
    });
    this.registerStep({
      name: 'detectModifier',
      process: this.detectModifier
    });
    this.registerStep({
      name: 'extractPlayers',
      process: this.extractPlayers
    });
    this.registerStep({
      name: 'detectTeams',
      process: this.detectTeams
    });
    this.registerStep({
      name: 'extractBatch',
      process: this.extractBatch
    });
  }
  
  /**
   * Process a single message through the entire pipeline
   */
  public processMessage(message: any): MsgParsed {
    console.log('PARSER: Starting to process message:', message.originalText);
    
    // Create initial MsgParsed object
    const msgParsed: MsgParsed = {
      originalText: message.originalText || (message.content || ''),
      rawWhatsAppObj: message.rawWhatsAppObj || message,
      sender: message.sender || '',
      timestamp: message.timestamp || Date.now(),
      players: message.players || [],
      modifier: message.modifier || MessageCommand.CONVERSATION, // Default
      isTeam: message.isTeam || false,
      batch: message.batch || undefined,
      sender_name: message.sender_name || ''
    };
    
    console.log('PARSER: Initialized message:', msgParsed);
    
    // Run through all pipeline steps
    let result = msgParsed;
    for (const step of this.steps) {
      console.log(`PARSER: Running step: ${step.name}`);
      result = step.process(result);
      console.log(`PARSER: After ${step.name}:`, {
        players: result.players,
        modifier: result.modifier,
        isTeam: result.isTeam,
        batch: result.batch
      });
    }
    
    return result;
  }
  
  /**
   * Process a batch of messages through the pipeline
   */
  public processMessages(messages: any[]): MsgParsed[] {
    return messages.map(msg => this.processMessage(msg));
  }
  
  /**
   * Register a pipeline step
   */
  private registerStep(step: ParserStep): void {
    this.steps.push(step);
  }
  
  // Pipeline step implementations
  
  /**
   * Initial setup step
   */
  private initialSetup(msg: MsgParsed): MsgParsed {
    // Just initialize the structure - no real parsing yet
    return msg;
  }
  
  /**
   * Detect the message modifier (IN, OUT, TEAM, etc.)
   */
  private detectModifier(msg: MsgParsed): MsgParsed {
    // Ensure originalText exists before trying to use it
    if (!msg.originalText) {
      msg.originalText = '';
    }
    
    const lowerText = msg.originalText.toLowerCase();
    
    // Check for system messages
    if (msg.originalText && /^\[.*\]$/.test(msg.originalText.trim())) {
      msg.modifier = MessageCommand.SYSTEM;
      return msg;
    }
    
    // Check for registration opening messages
    // Only admin messages can be registration opening messages
    const registrationKeywords = ['inscrições abertas', 'inscricoes abertas', 'open registration', 'registration open'];
    const hasRegistrationKeyword = registrationKeywords.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
    
    if (hasRegistrationKeyword) {
      msg.modifier = MessageCommand.REGISTRATION_OPEN;
      return msg;
    }
    
    // Check for OUT messages
    if (/(^|\s)out(\s|$)/.test(lowerText) || 
        lowerText.includes('não posso') || 
        lowerText.includes('nao posso')) {
      msg.modifier = MessageCommand.OUT;
      return msg;
    }
    
    // Check for IN messages
    if (/(^|\s)in(\s|$)/.test(lowerText)) {
      msg.modifier = MessageCommand.IN;
      return msg;
    }
    
    // Check for potential team indicators - match all separators implemented in extractPlayers
    if (lowerText.includes('/') || 
        lowerText.includes(' e ') || 
        lowerText.includes('+') ||
        lowerText.includes(' com ') ||
        lowerText.includes(' and ') ||
        lowerText.includes(' & ') ||
        lowerText.includes(' with partner') ||
        lowerText.includes(' with a partner') ||
        lowerText.includes('partner')) {
      
      // This might be a team signup
      if (!lowerText.includes('out') && !lowerText.includes('não posso')) {
        msg.modifier = MessageCommand.TEAM;
        return msg;
      }
    }
    
    // If we detect a time format but no command, assume it's an IN registration
    const timePatterns = [
      /\b\d{1,2}[:.h]\d{0,2}\b/i,  // Matches patterns like 15h, 15:00, 15.00
      /\b\d{1,2}\b/               // Matches just numbers like "15"
    ];
    
    if (timePatterns.some(pattern => pattern.test(lowerText))) {
      msg.modifier = MessageCommand.IN;
      return msg;
    }
    
    return msg;
  }
  
  /**
   * Extract player information
   */
  private extractPlayers(msg: MsgParsed): MsgParsed {
    const result = { ...msg };
    result.players = [];
    
    // Skip system messages and registration messages
    if (msg.modifier === MessageCommand.SYSTEM || msg.modifier === MessageCommand.REGISTRATION_OPEN) {
      return result;
    }
    
    // Process messages based on format patterns
    if (msg.originalText) {
      let foundPlayers = false;
      
      // 1. Handle "Name1 and Name2" format (e.g., "Rudi and Dani 15:00")
      if (!foundPlayers && msg.originalText.toLowerCase().includes('and')) {
        // Special case for "and partner"
        if (msg.originalText.match(/\b([A-Za-z\s]+)\s+and\s+partner\b/i)) {
          const match = msg.originalText.match(/\b([A-Za-z\s]+)\s+and\s+partner\b/i);
          if (match && match[1]) {
            const name1 = match[1].trim();
            const name2 = `${name1}'s partner`;
            
            result.players.push({ name: name1 });
            result.players.push({ name: name2 });
            result.isTeam = true;
            foundPlayers = true;
          }
        } 
        // Regular "Name1 and Name2" format
        else if (msg.originalText.match(/\b([A-Za-z\s]+)\s+and\s+([A-Za-z\s]+)\b/i)) {
          const match = msg.originalText.match(/\b([A-Za-z\s]+)\s+and\s+([A-Za-z\s]+)\b/i);
          if (match && match[1] && match[2]) {
            const name1 = match[1].trim();
            let name2 = match[2].trim();
            
            // Clean up time pattern and 'in' word
            name2 = name2.replace(/\s+in\s+\d{1,2}[:.h]?\d{0,2}$|\s+\d{1,2}[:.h]?\d{0,2}$|\s+in$/i, '');
            
            result.players.push({ name: name1 });
            result.players.push({ name: name2 });
            result.isTeam = true;
            foundPlayers = true;
          }
        }
      }
      
      // 2. Handle "+partner" format (e.g., "Giu+partner in 15")
      if (!foundPlayers && msg.originalText.toLowerCase().includes('+partner')) {
        const match = msg.originalText.match(/\b([A-Za-z\s]+)\+partner\b/i);
        if (match && match[1]) {
          const name1 = match[1].trim();
          const name2 = `${name1}'s partner`;
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      
      // 3. Handle "with partner" format (e.g., "Bob in with partner 17:00")
      if (!foundPlayers && msg.originalText.toLowerCase().includes('with partner')) {
        const match = msg.originalText.match(/\b([A-Za-z\s]+)\s+(?:in\s+)?with\s+partner\b/i);
        if (match && match[1]) {
          const name1 = match[1].trim();
          const name2 = `${name1}'s partner`;
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      
      // 4. Handle "Name1 & Name2" format (e.g., "Philipp & Diego 15h")
      if (!foundPlayers && msg.originalText.includes('&')) {
        // Special case for "& Partner"
        if (msg.originalText.match(/\b([A-Za-z\s]+)\s+&\s+partner\b/i)) {
          const match = msg.originalText.match(/\b([A-Za-z\s]+)\s+&\s+partner\b/i);
          if (match && match[1]) {
            const name1 = match[1].trim();
            const name2 = `${name1}'s partner`;
            
            result.players.push({ name: name1 });
            result.players.push({ name: name2 });
            result.isTeam = true;
            foundPlayers = true;
          }
        }
        // Regular "Name1 & Name2" format
        else if (msg.originalText.match(/\b([A-Za-z\s]+)\s+&\s+([A-Za-z\s]+)\b/i)) {
          const match = msg.originalText.match(/\b([A-Za-z\s]+)\s+&\s+([A-Za-z\s]+)\b/i);
          if (match && match[1] && match[2]) {
            const name1 = match[1].trim();
            let name2 = match[2].trim();
            
            result.players.push({ name: name1 });
            result.players.push({ name: name2 });
            result.isTeam = true;
            foundPlayers = true;
          }
        }
      }
      
      // 5. Handle slash notation "Name1/Name2" format
      if (!foundPlayers && msg.originalText.includes('/')) {
        const match = msg.originalText.match(/\b([A-Za-z\s]+)\s*\/\s*([A-Za-z\s]+)\b/i);
        if (match && match[1] && match[2]) {
          const name1 = match[1].trim();
          const name2 = match[2].trim();
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      
      // 6. Handle simple name with time format
      if (!foundPlayers) {
        // Try to match a full name consisting of one or more words at the start of the message
        // This will capture names like "philipp effinger"
        const match = msg.originalText.match(/^([A-Za-z\s]+?)(?:\s+(?:in|out|\d{1,2}[:.h]?\d{0,2})|$)/i);
        if (match && match[1]) {
          let name = match[1].trim();
          
          // Clean up the name - remove any trailing 'in' or 'out'
          name = name.replace(/\s+in$|\s+out$/i, '').trim();
          
          if (name.length > 0) {
            result.players.push({ name });
            foundPlayers = true;
            
            // If not explicitly set as OUT, treat as IN
            // Captures cases like "philipp effinger" or "John Smith 15:00"
            if (result.modifier === MessageCommand.CONVERSATION && !msg.originalText.toLowerCase().includes('out')) {
              result.modifier = MessageCommand.IN;
            }
          }
        }
      }
      
      // Handle OUT messages
      if (msg.originalText.toLowerCase().includes('out')) {
        msg.modifier = MessageCommand.OUT;
      }
      
      // Extract time information if present
      const timeMatch = msg.originalText.match(/(\d{1,2})[:.h]?(\d{0,2})/i);
      if (timeMatch) {
        const hour = timeMatch[1];
        const minutes = timeMatch[2] || '00';
        result.batch = `${hour.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
      }
      
      if (foundPlayers) {
        return result;
      }
    }
    
    // For team messages, IN, and OUT messages, extract all player names
    if (msg.modifier === MessageCommand.TEAM || msg.modifier === MessageCommand.IN || msg.modifier === MessageCommand.OUT) {
      // Extract players mentioned in the message
      let foundPlayers = false;
      
      // 1. Check for mentions in the format "@number"
      const mentions = msg.originalText.match(/@(\d+)/g);
      if (mentions) {
        mentions.forEach(mention => {
          const phoneNumber = mention.substring(1);
          result.players.push({
            phoneNumber,
            name: phoneNumber,
            displayName: getDisplayName(phoneNumber)
          });
        });
        foundPlayers = true;
      }
      
      // 2. Check for "+partner" format (e.g., "Giu+partner in 15")
      const plusPartnerMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\+(?:partner|Partner)(?:[^\n,]*)/i);
      if (plusPartnerMatch && plusPartnerMatch[1] && !foundPlayers) {
        const name1 = plusPartnerMatch[1].trim();
        const name2 = `${name1}'s partner`;
        
        result.players.push({ name: name1, displayName: name1 });
        result.players.push({ name: name2, displayName: name2 });
        result.isTeam = true;
        foundPlayers = true;
      }
      // 3. Check for "with partner" format (e.g., "Bob in with partner 17:00")
      else if (!foundPlayers && msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+(?:with|with\s+a)\s+partner(?:[^\n,]*)/i)) {
        const nameMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+(?:with|with\s+a)\s+partner(?:[^\n,]*)/i);
        if (nameMatch && nameMatch[1]) {
          const name1 = nameMatch[1].trim();
          const name2 = `${name1}'s partner`;
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      // 4. Check for "and partner" format (e.g., "Miguel and partner 15h")
      else if (!foundPlayers && msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+and\s+partner(?:[^\n,]*)/i)) {
        const nameMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+and\s+partner(?:[^\n,]*)/i);
        if (nameMatch && nameMatch[1]) {
          const name1 = nameMatch[1].trim();
          const name2 = `${name1}'s partner`;
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      // 5. Check for "Name1 and Name2" format (e.g., "Rudi and Dani 15:00")
      console.log('DEBUG: Checking for "and" pattern in:', msg.originalText);
      const andRegex = /([A-Za-z\u00C0-\u017F\s'\.-]+)\s+and\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i;
      const hasAndMatch = andRegex.test(msg.originalText);
      console.log('DEBUG: Has "and" match?', hasAndMatch);
      
      if (!foundPlayers && hasAndMatch) {
        const andMatch = msg.originalText.match(andRegex);
        console.log('DEBUG: "and" match result:', andMatch);
        
        if (andMatch && andMatch[1] && andMatch[2]) {
          const name1 = andMatch[1].trim();
          // Clean the second name by removing 'in' and time patterns
          let name2 = andMatch[2].trim();
          // Remove time patterns and the word 'in' if present
          name2 = name2.replace(/\s+(?:in\s+)?(?:\d{1,2}[:.h]?\d{0,2})?$/i, '').trim();
          
          console.log('DEBUG: Extracted names from "and" pattern:', { name1, name2 });
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
          console.log('DEBUG: After adding players, result.players:', result.players);
        }
      }
      // 6. Check for "Name1 & Name2" format (e.g., "Philipp & Diego 15h")
      else if (!foundPlayers && msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+&\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i)) {
        const ampersandMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+&\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i);
        if (ampersandMatch && ampersandMatch[1] && ampersandMatch[2]) {
          const name1 = ampersandMatch[1].trim();
          let name2 = ampersandMatch[2].trim();
          // Remove time patterns and the word 'in' if present
          name2 = name2.replace(/\s+(?:in\s+)?(?:\d{1,2}[:.h]?\d{0,2})?$/i, '').trim();
          
          // Special case for "& Partner" format
          if (name2.toLowerCase() === 'partner') {
            name2 = `${name1}'s partner`;
          }
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      // 7. Check for "Name1 com Name2" format (e.g., "João com Roberto 15h")
      else if (!foundPlayers && msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+com\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i)) {
        const comMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+com\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i);
        if (comMatch && comMatch[1] && comMatch[2]) {
          const name1 = comMatch[1].trim();
          let name2 = comMatch[2].trim();
          // Remove time patterns and the word 'in' if present
          name2 = name2.replace(/\s+(?:in\s+)?(?:\d{1,2}[:.h]?\d{0,2})?$/i, '').trim();
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      // 8. Check for "Name1 e Name2" format - common team registration pattern
      else if (!foundPlayers && msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+e\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i)) {
        const eMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)\s+e\s+([A-Za-z\u00C0-\u017F\s'\.-]+)/i);
        if (eMatch && eMatch[1] && eMatch[2]) {
          const name1 = eMatch[1].trim();
          let name2 = eMatch[2].trim();
          // Remove time patterns and the word 'in' if present
          name2 = name2.replace(/\s+(?:in\s+)?(?:\d{1,2}[:.h]?\d{0,2})?$/i, '').trim();
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      // 9. Check for slash notation "Name1/Name2" or "Name1 / Name2"
      else if (!foundPlayers && msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)[\s]*\/[\s]*([A-Za-z\u00C0-\u017F\s'\.-]+)/i)) {
        const slashMatch = msg.originalText.match(/([A-Za-z\u00C0-\u017F\s'\.-]+)[\s]*\/[\s]*([A-Za-z\u00C0-\u017F\s'\.-]+)/i);
        if (slashMatch && slashMatch[1] && slashMatch[2]) {
          const name1 = slashMatch[1].trim();
          let name2 = slashMatch[2].trim();
          // Remove time patterns and the word 'in' if present
          name2 = name2.replace(/\s+(?:in\s+)?(?:\d{1,2}[:.h]?\d{0,2})?$/i, '').trim();
          
          result.players.push({ name: name1, displayName: name1 });
          result.players.push({ name: name2, displayName: name2 });
          result.isTeam = true;
          foundPlayers = true;
        }
      }
      // 10. Simple name with time as IN - if no other patterns matched but we have a player name
      else if (!foundPlayers) {
        // Try to extract a simple name (possibly with time)
        const simpleNameMatch = msg.originalText.match(/^([A-Za-z\u00C0-\u017F\s'\.-]+)(?:\s+(?:in\s+)?(\d+[h:.]?\d*)?)?$/i);
        if (simpleNameMatch && simpleNameMatch[1] && simpleNameMatch[1].trim().toLowerCase() !== 'in') {
          const name = simpleNameMatch[1].trim();
          result.players.push({ name, displayName: name });
          result.isTeam = false; // This is a single player registration
          foundPlayers = true;
        }
      }
      
      // If no players found yet and it's an IN message, try using sender name as player
      if (!foundPlayers && msg.modifier === MessageCommand.IN) {
        const senderPhone = msg.sender.replace('@s.whatsapp.net', '');
        const isFromMe = msg.rawWhatsAppObj?.fromMe === true;
        
        if (!isFromMe) {
          result.players.push({
            phoneNumber: senderPhone,
            name: msg.sender_name || getDisplayName(senderPhone),
            displayName: msg.sender_name || getDisplayName(senderPhone)
          });
        }
      }
      
      // Extract time patterns from all player names
      // This handles cases where time is appended to names like "Abilio Duarte 15h"
      for (const player of result.players) {
        if (player.name) {
          // Remove time patterns (15h, 15:00, 15.00, etc.) from names
          // Updated regex to handle more time formats
          let cleanName = player.name
            // Remove standard time formats like 15h, 15:00, 15.00, etc.
            .replace(/\s+(?:1[0-9]|2[0-3])[:.h]?[0-9]{0,2}\s*$/i, '')
            // Remove just numbers at the end that might be hour references
            .replace(/\s+(?:1[0-9]|2[0-3])\s*$/i, '')
            // Remove the "in" keyword if it's at the end of the name
            .replace(/\s+in\s*$/i, '');
          
          player.name = cleanName.trim();
          player.displayName = cleanName.trim();
        }
      }
      
      // Extract batch/time information from the message
      // This will be useful for the extractBatch step
      const timeMatch = msg.originalText.match(/\b(1[0-9]|2[0-3])\s*[:.h]?\s*\d{0,2}\b/i);
      if (timeMatch) {
        const extractedTime = timeMatch[0];
        // Standardize the time format to HH:MM
        let standardTime = extractedTime
          .replace(/h/i, ':00')
          .replace(/\.(\d{2})/, ':$1')
          .replace(/\.$/, ':00')
          .replace(/:$/, ':00');
        
        // If there's no minutes part, add :00
        if (!/:\d{2}/.test(standardTime)) {
          standardTime = standardTime.replace(/:$/, ':00').replace(/^(\d{1,2})$/, '$1:00');
        }
        
        // Make sure the hour has 2 digits
        standardTime = standardTime.replace(/^(\d)(:)/, '0$1$2');
        
        // Set batch information
        result.batch = standardTime;
      }
      
      // For OUT messages, handle specially
      if (msg.modifier === MessageCommand.OUT) {
        // Set correctly for tests
        result.modifier = MessageCommand.OUT;
      }
    }
    
    return result;
  }
  
  /**
   * Detect if the message represents a team signup
   */
  private detectTeams(msg: MsgParsed): MsgParsed {
    const result = { ...msg };
    
    // Check for explicit team indicators in the message text
    const lowerText = msg.originalText.toLowerCase();
    const hasTeamIndicator = (
      lowerText.includes(' e ') || 
      lowerText.includes('/') || 
      lowerText.includes(' com ') || 
      lowerText.includes('+')
    );
    
    // A message is a team signup if it has multiple players
    // or contains explicit team indicators
    result.isTeam = result.players.length > 1 || hasTeamIndicator;
    
    // Team messages should be marked as IN by default
    if (result.isTeam && result.modifier === MessageCommand.TEAM) {
      result.modifier = MessageCommand.IN;
    }
    
    return result;
  }
  
  /**
   * Extract batch information (time slots, event groups, etc.)
   */
  private extractBatch(msg: MsgParsed): MsgParsed {
    const result = { ...msg };
    
    // Skip system messages and registration messages
    if (msg.modifier === MessageCommand.SYSTEM || msg.modifier === MessageCommand.REGISTRATION_OPEN) {
      return result;
    }
    
    // Look for time patterns like "15h", "15:00"
    if (containsTimePattern(msg.originalText)) {
      // Extract the time - this would use existing logic from signup-parser.ts
      // Simplified for demonstration
      const timeMatch = msg.originalText.match(/(\d{1,2})[h:.](\d{0,2})/);
      if (timeMatch) {
        const hour = timeMatch[1];
        const minute = timeMatch[2] || "00";
        result.batch = `${hour}:${minute.padEnd(2, '0')}`;
      }
    }
    
    return result;
  }
  
  /**
   * Assign team IDs across all parsed messages
   * This is done in a second pass after individual message parsing
   */
  public assignTeamIds(parsedMessages: MsgParsed[]): MsgParsed[] {
    // Group by batch (time slot)
    const messagesByBatch = new Map<string, MsgParsed[]>();
    
    // Add "unspecified" batch
    messagesByBatch.set('unspecified', []);
    
    // Group messages by batch
    parsedMessages.forEach(msg => {
      if (msg.modifier !== MessageCommand.IN) return;
      
      const batch = msg.batch || 'unspecified';
      if (!messagesByBatch.has(batch)) {
        messagesByBatch.set(batch, []);
      }
      messagesByBatch.get(batch)!.push(msg);
    });
    
    // Assign team IDs within each batch
    messagesByBatch.forEach((messages, batch) => {
      let teamCounter = 1;
      
      // Only assign team IDs to actual teams (multiple players)
      messages.filter(msg => msg.isTeam).forEach(msg => {
        msg.teamId = teamCounter++;
      });
    });
    
    return parsedMessages;
  }
}
