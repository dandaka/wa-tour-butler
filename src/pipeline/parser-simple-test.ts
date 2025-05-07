#!/usr/bin/env node
/**
 * Simple Parser Test
 * 
 * This script demonstrates the parsing capabilities of the new pipeline
 * using mock data that doesn't require database access.
 */

import { ParserPipeline } from './parser-pipeline';
import { MessageCommand } from '../types/message-parsing';

// Sample messages mimicking real WhatsApp data
const mockMessages = [
  // Registration opening message
  {
    content: "Inscrições abertas para o torneio deste domingo!",
    sender: "351918852769@s.whatsapp.net", // Admin
    timestamp: 1620231737, // May 5, 2021
    id: "123456",
    fromMe: false
  },
  // System message
  {
    content: "[SENDERKEYDISTRIBUTIONMESSAGE]",
    sender: "351918852769@s.whatsapp.net",
    timestamp: 1620231738,
    id: "123457",
    fromMe: false
  },
  // Player signup (IN message)
  {
    content: "In 15h",
    sender: "351963320681@s.whatsapp.net",
    timestamp: 1620231740,
    id: "123458",
    fromMe: false
  },
  // Team signup message
  {
    content: "In com @351969484026",
    sender: "351963320681@s.whatsapp.net",
    timestamp: 1620231750,
    id: "123459",
    fromMe: false
  },
  // Another team signup format
  {
    content: "In com Diogo Lourenço",
    sender: "351963683848@s.whatsapp.net",
    timestamp: 1620231760,
    id: "123460",
    fromMe: false
  },
  // Team signup with slash notation
  {
    content: "João Silva e Pedro Barco",
    sender: "351918852769@s.whatsapp.net",
    timestamp: 1620231770,
    id: "123461",
    fromMe: false
  },
  // OUT message
  {
    content: "Out hoje, não posso",
    sender: "351963683111@s.whatsapp.net",
    timestamp: 1620231780,
    id: "123462",
    fromMe: false
  }
];

// Run the test
function runTest() {
  console.log("Running Parser Pipeline Test");
  console.log("============================\n");
  
  // Initialize parser pipeline
  const pipeline = new ParserPipeline();
  
  // Process all messages
  const parsedMessages = pipeline.processMessages(mockMessages);
  
  // Assign team IDs
  const messagesWithTeamIds = pipeline.assignTeamIds(parsedMessages);
  
  // Display results for each message
  messagesWithTeamIds.forEach((msg, index) => {
    console.log(`\nMessage #${index + 1}: "${msg.originalText}"`);
    console.log(`Command: ${msg.modifier}`);
    
    if (msg.players.length > 0) {
      console.log("Players:");
      msg.players.forEach((player, i) => {
        console.log(`  ${i + 1}. ${player.displayName}`);
      });
    }
    
    if (msg.isTeam) {
      console.log(`Is Team: ${msg.isTeam}`);
    }
    
    if (msg.teamId) {
      console.log(`Team ID: ${msg.teamId}`);
    }
    
    if (msg.batch) {
      console.log(`Batch: ${msg.batch}`);
    }
    
    console.log("------------------------------");
  });
  
  // Count message types
  const registrationMessages = messagesWithTeamIds.filter(msg => msg.modifier === MessageCommand.REGISTRATION_OPEN).length;
  const systemMessages = messagesWithTeamIds.filter(msg => msg.modifier === MessageCommand.SYSTEM).length;
  const inMessages = messagesWithTeamIds.filter(msg => msg.modifier === MessageCommand.IN).length;
  const outMessages = messagesWithTeamIds.filter(msg => msg.modifier === MessageCommand.OUT).length;
  const teamMessages = messagesWithTeamIds.filter(msg => msg.isTeam).length;
  
  console.log("\nSummary:");
  console.log(`Total messages: ${messagesWithTeamIds.length}`);
  console.log(`Registration messages: ${registrationMessages}`);
  console.log(`System messages: ${systemMessages}`);
  console.log(`IN messages: ${inMessages}`);
  console.log(`OUT messages: ${outMessages}`);
  console.log(`Team messages: ${teamMessages}`);
  
  // Find registration message
  const registrationMsg = messagesWithTeamIds.find(msg => msg.modifier === MessageCommand.REGISTRATION_OPEN);
  if (registrationMsg) {
    console.log("\nRegistration message found:");
    console.log(`"${registrationMsg.originalText}"`);
  } else {
    console.log("\nNo registration message found");
  }
}

// Run the test
runTest();
