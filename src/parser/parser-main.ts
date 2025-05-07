/**
 * Registration Parser
 * Parses WhatsApp messages to extract player registrations for tournaments
 */

import * as fs from "fs";

// Import types from the types directory
import { WhatsAppMessage } from "../types/messages";
import { Contact, Player, ParsedRegistration } from "../types/parser";
import { GroupInfo } from "../types/group-info";

// Import registration start detection
import { detectRegistrationStart } from "./registration-start-detect";

/**
 * Loads WhatsApp messages from a JSON file
 * @param filePath Path to the JSON file
 * @returns Array of WhatsApp messages
 */
export function loadMessages(filePath: string): WhatsAppMessage[] {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const messages = JSON.parse(fileContent);
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    console.error(`Error loading messages: ${error}`);
    return [];
  }
}

/**
 * Loads contact information from a JSON file
 * @param filePath Path to the JSON file
 * @returns Array of contacts
 */
export function loadContacts(filePath: string): Contact[] {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const contactsObj = JSON.parse(fileContent);

    // Convert the object format to an array of Contact objects
    return Object.entries(contactsObj).map(([phoneNumber, name]) => ({
      phoneNumber,
      name: name as string,
    }));
  } catch (error) {
    console.error(`Error loading contacts: ${error}`);
    return [];
  }
}

/**
 * Simple test function for registration parsing
 * @param messagesFilePath Path to messages JSON file
 * @param groupInfoFilePath Path to group info JSON file
 * @param groupId ID of the group to parse
 * @returns Result of the registration start detection
 */
export function parseTest(messagesFilePath: string, groupInfoFilePath: string, groupId: string) {
  // Step 1: Load messages
  const messages = loadMessages(messagesFilePath);
  
  // Step 2: Load group info
  const groupsData = JSON.parse(fs.readFileSync(groupInfoFilePath, 'utf8'));
  const groupInfo = groupsData.find((g: GroupInfo) => g.ID === groupId);
  
  if (!groupInfo) {
    console.error(`Group with ID ${groupId} not found in group info file`);
    return { success: false };
  }
  
  // Step 3: Use detectRegistrationStart function
  const registrationStart = detectRegistrationStart(messages, groupInfo, 0);
  
  // Step 4: Create a comprehensive result object
  const fullResult = {
    // Include group info
    groupInfo: groupInfo,
    
    // Include the registration open message (if found)
    registrationMessage: registrationStart.success ? registrationStart.message : null,
    
    // Include all messages
    allMessages: messages,
    
    // Include the original parsing result
    parsingResult: registrationStart
  };
  
  // Step 5: Return the full result
  return fullResult;
}
