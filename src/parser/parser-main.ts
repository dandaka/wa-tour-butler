/**
 * Registration Parser
 * Parses WhatsApp messages to extract player registrations for tournaments
 */

import * as fs from "fs";
import * as path from "path";

// Import types from the types directory
import { WhatsAppMessage } from "../types/messages";
import { GroupInfo } from "../types/group-info";
import { Contact, Player, ParsedRegistration } from "../types/parser";
import { MessageCommand } from "../types/message-parsing";

// Import other modules
import { detectRegistrationStart } from "./registration-start-detect";
import { calculateRegistrationEndTime } from "./registration-end-detect";

// Import constants
import { MESSAGE_PATTERNS } from "../constants";

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
export function parseTest(
  messagesFilePath: string,
  groupInfoFilePath: string,
  groupId: string
) {
  // Step: Load messages
  const messages = loadMessages(messagesFilePath);

  // Step: Load group info
  const groupsData = JSON.parse(fs.readFileSync(groupInfoFilePath, "utf8"));
  const groupInfo = groupsData.find((g: GroupInfo) => g.ID === groupId);

  if (!groupInfo) {
    console.error(`Group with ID ${groupId} not found in group info file`);
    return { success: false };
  }

  // Step: Use detectRegistrationStart function
  const registrationStart = detectRegistrationStart(messages, groupInfo, 0);

  // Step: Calculate registration end time if registration start was successful
  let registrationEnd = { timestamp: 0, success: false };
  if (registrationStart.success && registrationStart.timestamp) {
    registrationEnd = calculateRegistrationEndTime(
      registrationStart.timestamp,
      groupInfo
    );
  }

  // Step: Remove messages with empty content and clean up properties
  const cleanedMessages = messages
    .filter((message) => message.content.trim().length > 0)
    .map(({ id, timestamp, sender, content }) => ({
      id,
      timestamp,
      sender,
      content,
    }));

  // Step: Remove system messages that only have content within square brackets
  const systemMessagePattern = /^\s*\[[^\]]+\]\s*$/;
  const filteredMessages = cleanedMessages.filter(
    (message) => !systemMessagePattern.test(message.content)
  );

  // Step: Filter out messages that are too short or just numbers (additional system message filtering)
  const nonSystemMessages = filteredMessages.filter((message) => {
    return !(
      message.content.match(/^(\d+)$/) !== null || message.content.length < 3
    );
  });

  // Step: Convert timestamps to readable format
  // add timestamp_fmt to allMessages with YYYY-MM-DD HH:MM:SS format
  const messagesWithFormattedTime = filteredMessages.map((message) => {
    // Create a new Date object from the Unix timestamp (seconds to milliseconds)
    const date = new Date(message.timestamp * 1000);

    // Format the date as YYYY-MM-DD HH:MM:SS
    const formatted = date
      .toISOString()
      .replace("T", " ") // Replace T separator with space
      .substring(0, 19); // Take only YYYY-MM-DD HH:MM:SS part

    // Return the message with an added timestamp_fmt field
    return {
      ...message,
      timestamp_fmt: formatted,
    };
  });

  // Step: Add sender name to messages from contacts.json
  // Each message should have "sender_name"
  // Extract directory path and use it to find contacts.json in the same directory
  const directory = path.dirname(messagesFilePath);
  const contactsFilePath = path.join(directory, "contacts.json");
  console.log(`Loading contacts from: ${contactsFilePath}`);

  // Handle missing contacts file gracefully
  const contactsObj: Record<string, string> = {};
  try {
    const contactsRaw = fs.readFileSync(contactsFilePath, "utf8");
    const parsedContacts = JSON.parse(contactsRaw) as Record<string, string>;

    // Copy contacts to our object
    Object.keys(parsedContacts).forEach((key) => {
      contactsObj[key] = parsedContacts[key];
    });

    console.log(
      `Loaded ${
        Object.keys(contactsObj).length
      } contacts from ${contactsFilePath}`
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `Could not load contacts file: ${errorMessage}. Using empty contacts map.`
    );
  }

  // Enrich messages with sender names
  const messagesWithSenderNames = messagesWithFormattedTime.map((message) => {
    // Extract the phone number from the sender field (remove @s.whatsapp.net if present)
    const phoneNumber = message.sender.split("@")[0];

    // Look up the contact name directly from the contacts object
    // If it exists, use it; otherwise use the phone number as the name
    const contactName = contactsObj[phoneNumber] || phoneNumber;

    return {
      ...message,
      sender_name: contactName,
    };
  });

  // Step: Parse batches
  // 1. Extract batches info from group info
  const batches = groupInfo.Batches || [];
  console.log(`Found ${batches.length} batches in group info`);

  // Define type for messages with classification
  type ClassifiedMessage = WhatsAppMessage & { modifier: MessageCommand, batch?: string | null };
  
  // 2 & 3. For each message, check if it contains any batch keywords
  const messagesWithBatches = messagesWithSenderNames.map((message) => {
    // If we don't have batches defined, return message as is
    if (batches.length === 0) {
      return message;
    }

    // Check message content against each batch's keywords
    let matchedBatch = null;

    // First, try to find an exact match
    for (const batch of batches) {
      const keywords = batch.keywords || [];

      // Check if message content contains any of the keywords
      for (const keyword of keywords) {
        // Create regex pattern for the keyword with word boundaries
        const pattern = new RegExp(
          `\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
          "i"
        );

        if (pattern.test(message.content)) {
          matchedBatch = batch.name;
          break;
        }
      }

      // If we found a match, no need to check other batches
      if (matchedBatch) {
        break;
      }
    }

    // Add batch information to the message
    // If no match was found, use the default batch from group info if available
    const defaultBatch = groupInfo.DefaultBatch || null;
    return {
      ...message,
      batch: matchedBatch || defaultBatch,
      modifier: MessageCommand.CONVERSATION, // Initialize modifier property for consistency
    };
  });


  
  // Classify each message into a type (IN, OUT, TEAM, CONVERSATION)
  const messagesWithClassification = messagesWithSenderNames.map(message => {
    // Default classification is CONVERSATION
    let classification: MessageCommand = MessageCommand.CONVERSATION;
    
    // Check if the message content matches any known pattern
    const content = message.content.toLowerCase();
    
    // 1. Check for conversation patterns first
    const isConversation = MESSAGE_PATTERNS.CONVERSATION_PATTERNS.some((pattern: RegExp) => pattern.test(content));
    if (isConversation) {
      classification = MessageCommand.CONVERSATION;
    }
    // 2. Check for IN command
    else if (MESSAGE_PATTERNS.IN_COMMAND.test(content)) {
      classification = MessageCommand.IN;
    }
    // 3. Check for OUT command
    else if (MESSAGE_PATTERNS.OUT_COMMAND.test(content)) {
      classification = MessageCommand.OUT;
    }
    // 4. Check for TEAM_UP command
    else if (MESSAGE_PATTERNS.TEAM_UP.test(content)) {
      classification = MessageCommand.TEAM;
    }
    // 5. Check if there is batch information in the message already, add MessageCommand.IN

    
    
    // 6. Default to CONVERSATION if no other pattern matches
    
    return {
      ...message,
      modifier: classification,
      batch: null // Initialize batch property
    };
  });

  // Step: Create a comprehensive result object
  const fullResult = {
    // Include group info
    groupInfo: groupInfo,

    // Include the registration open message and time (if found)
    registrationMessage: registrationStart.success
      ? registrationStart.message
      : null,
    registrationStartTime: registrationStart.timestamp,

    // Include registration end time (if calculated)
    registrationEndTime: registrationEnd.success
      ? registrationEnd.timestamp
      : null,

    // Messages with parsed information
    messages: messagesWithBatches,
    // Classify messages by batch for easy access
    messagesByBatch: Object.fromEntries(
      [...new Set(messagesWithBatches.map(msg => (msg as any).batch || 'unassigned'))].map(batchName => [
        batchName,
        messagesWithBatches.filter(msg => ((msg as any).batch || 'unassigned') === batchName)
      ])
    ),

    // Include the parsing results
    parsingResult: {
      registrationStart: registrationStart,
      registrationEnd: registrationEnd,
    },
  };

  // Write the results to result.json
  const resultPath = path.join(process.cwd(), 'data', 'test-data', 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(fullResult, null, 2));
  console.log(`Results written to ${resultPath}`);

  // Step 6: Return the full result
  return fullResult;
}

// If this file is run directly, execute the parser with default parameters
if (require.main === module) {
  console.log('Running parser-main directly...');
  parseTest(
    path.join(process.cwd(), 'data', 'test-data', '120363028202164779-messages.json'),
    path.join(process.cwd(), 'groups.json'),
    '120363028202164779@g.us'
  );
}
