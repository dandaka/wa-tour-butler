/**
 * Parser Pipeline
 * 
 * This module implements the message parsing pipeline for WhatsApp Tournament Butler.
 * It transforms raw WhatsApp messages into structured MsgParsed objects.
 */

import { MsgParsed, MessageCommand, PlayerInfo } from '../types/message-parsing';
import { containsTimePattern } from '../utils/date';

// Simple placeholder function until we properly export this from signup-parser
function getDisplayName(phoneNumber: string): string {
  return phoneNumber.replace('@s.whatsapp.net', '');
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
    // Create initial MsgParsed object
    const msgParsed: MsgParsed = {
      originalText: message.content,
      rawWhatsAppObj: message,
      sender: message.sender,
      timestamp: message.timestamp,
      players: [],
      modifier: MessageCommand.CONVERSATION, // Default
      isTeam: false
    };
    
    // Run through all pipeline steps
    let result = msgParsed;
    for (const step of this.steps) {
      result = step.process(result);
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
    const lowerText = msg.originalText.toLowerCase();
    
    // Check for system messages
    if (/^\[.*\]$/.test(msg.originalText.trim())) {
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
    
    // Check for potential team indicators
    if (lowerText.includes('/') || 
        lowerText.includes(' e ') || 
        lowerText.includes('+') ||
        lowerText.includes('com ')) {
      
      // This might be a team signup
      if (!lowerText.includes('out') && !lowerText.includes('não posso')) {
        msg.modifier = MessageCommand.TEAM;
        return msg;
      }
    }
    
    return msg;
  }
  
  /**
   * Extract player information
   */
  private extractPlayers(msg: MsgParsed): MsgParsed {
    const result = { ...msg };
    
    // Skip system messages and registration messages
    if (msg.modifier === MessageCommand.SYSTEM || msg.modifier === MessageCommand.REGISTRATION_OPEN) {
      return result;
    }
    
    // For team messages, extract all player names
    if (msg.modifier === MessageCommand.TEAM || msg.modifier === MessageCommand.IN) {
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
      
      // 2. Check for "com <name>" format
      const comMatch = msg.originalText.match(/com\s+([^@\d][^\n,]*)/i);
      if (comMatch && comMatch[1]) {
        const name = comMatch[1].trim();
        result.players.push({
          name,
          displayName: name
        });
        foundPlayers = true;
      }
      
      // 3. Check for "Name1 e Name2" format
      const eMatch = msg.originalText.match(/([^\d@][^\n,]+?)\s+e\s+([^\d@][^\n,]+)/i);
      if (eMatch && eMatch[1] && eMatch[2]) {
        const name1 = eMatch[1].trim();
        const name2 = eMatch[2].trim();
        
        result.players.push({ name: name1, displayName: name1 });
        result.players.push({ name: name2, displayName: name2 });
        foundPlayers = true;
      }
      
      // 4. Check for slash notation "Name1/Name2"
      const slashMatch = msg.originalText.match(/([^\d@][^\n,\/]+?)\/([^\d@][^\n,]+)/i);
      if (slashMatch && slashMatch[1] && slashMatch[2]) {
        const name1 = slashMatch[1].trim();
        const name2 = slashMatch[2].trim();
        
        result.players.push({ name: name1, displayName: name1 });
        result.players.push({ name: name2, displayName: name2 });
        foundPlayers = true;
      }
      
      // Always add the sender as the first player if no explicit names found
      // For team messages with names like "João Silva e Pedro Barco", sender should be added
      const senderPhone = msg.sender.replace('@s.whatsapp.net', '');
      
      if (!foundPlayers || msg.modifier === MessageCommand.TEAM) {
        // Add sender as the first player
        result.players.unshift({
          phoneNumber: senderPhone,
          displayName: getDisplayName(senderPhone)
        });
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
