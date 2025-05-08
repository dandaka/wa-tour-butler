/**
 * Registration Parser
 * Parses WhatsApp messages to extract player registrations for tournaments
 */

import fs from "fs";
import path from "path";
import { WhatsAppMessage, EnhancedWhatsAppMessage } from "../types/messages";
import { MessageCommand } from "../types/message-parsing";
import { GroupInfo } from "../types/group-info";
import { MESSAGE_PATTERNS } from "../constants";
import { Contact, Player, ParsedRegistration } from "../types/parser";

// Import other modules
import { detectRegistrationStart } from "./registration-start-detect";
import { calculateRegistrationEndTime } from "./registration-end-detect";

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

  // Initialize our unified message structure
  // Starting with messages that pass our basic filters
  const processedMessages = messages
    // Step: Remove messages with empty content
    .filter((message) => message.content.trim().length > 0)
    // Step: Remove system messages with bracketed content
    .filter((message) => !/^\s*\[[^\]]+\]\s*$/.test(message.content))
    // Step: Filter out very short messages or just numbers
    .filter((message) => !(message.content.match(/^(\d+)$/) !== null || message.content.length < 3))
    // Initial conversion to our unified message format
    .map(({ id, timestamp, sender, content }) => {
      // Format timestamp
      const date = new Date(timestamp * 1000);
      const formatted = date
        .toISOString()
        .replace("T", " ")
        .substring(0, 19); // YYYY-MM-DD HH:MM:SS format

      // Create our initial enhanced message
      return {
        id,
        timestamp,
        sender,
        content,
        timestamp_fmt: formatted, // Initialize formatted timestamp
        sender_name: sender.split("@")[0], // Default to phone number initially
        batch: null, // Initialize with no batch
        modifier: MessageCommand.CONVERSATION // Default classification
      } as EnhancedWhatsAppMessage;
    });

  // Step: Add sender names from contacts.json
  const directory = path.dirname(messagesFilePath);
  const contactsFilePath = path.join(directory, "contacts.json");
  console.log(`Loading contacts from: ${contactsFilePath}`);

  // Load contacts
  const contactsObj: Record<string, string> = {};
  try {
    const contactsRaw = fs.readFileSync(contactsFilePath, "utf8");
    const parsedContacts = JSON.parse(contactsRaw) as Record<string, string>;
    Object.keys(parsedContacts).forEach((key) => {
      contactsObj[key] = parsedContacts[key];
    });
    console.log(`Loaded ${Object.keys(contactsObj).length} contacts from ${contactsFilePath}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Could not load contacts file: ${errorMessage}. Using empty contacts map.`);
  }

  // Apply contact names to messages in place
  processedMessages.forEach((message) => {
    const phoneNumber = message.sender.split("@")[0];
    message.sender_name = contactsObj[phoneNumber] || phoneNumber;
  });

  // Step: Parse and apply batch information
  const batches = groupInfo.Batches || [];
  console.log(`Found ${batches.length} batches in group info`);

  // Apply batch detection to messages in place
  if (batches.length > 0) {
    processedMessages.forEach((message) => {
      // Check message content against each batch's keywords
      let matchedBatch = null;

      // First try exact keyword matches
      for (const batch of batches) {
        const keywords = batch.keywords || [];
        for (const keyword of keywords) {
          const pattern = new RegExp(
            `\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
            "i"
          );

          if (pattern.test(message.content)) {
            matchedBatch = batch.name;
            break;
          }
        }
        if (matchedBatch) break;
      }
      // Apply the batch to the message
      message.batch = matchedBatch;
    });
  }

  // Step: Classify messages by type (IN, OUT, TEAM, CONVERSATION)
  processedMessages.forEach((message) => {
    // Get key data for classification
    const content = message.content.toLowerCase();
    const hasBatch = message.batch !== null && message.batch !== undefined;

    // Apply classification rules in priority order
    // 1. Check for conversation patterns first (but not if it has a batch assigned)
    const isConversation = MESSAGE_PATTERNS.CONVERSATION_PATTERNS.some((pattern) => pattern.test(content));
    if (isConversation && !hasBatch) {
      message.modifier = MessageCommand.CONVERSATION;
    }

    // 2. Check for IN command
    else if (MESSAGE_PATTERNS.IN_COMMAND.test(content)) {
      message.modifier = MessageCommand.IN;
    }

    // 3. Check for OUT command
    else if (MESSAGE_PATTERNS.OUT_COMMAND.test(content)) {
      message.modifier = MessageCommand.OUT;
    }

    // 4. Check for TEAM_UP command
    else if (MESSAGE_PATTERNS.TEAM_UP.test(content)) {
      message.modifier = MessageCommand.TEAM;
    }

    // 5. If message has a batch, mark it as IN (unless already classified)
    else if (hasBatch) {
      message.modifier = MessageCommand.IN;
    }
    // (Default is already CONVERSATION from initialization)
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
    messages: processedMessages,

    // Include the parsing results
    parsingResult: {
      registrationStart: registrationStart,
      registrationEnd: registrationEnd,
    },
  };

  // Write the results to result.json
  const resultPath = path.join(
    process.cwd(),
    "data",
    "test-data",
    "result.json"
  );
  fs.writeFileSync(resultPath, JSON.stringify(fullResult, null, 2));
  console.log(`Results written to ${resultPath}`);

  // Step 6: Return the full result
  return fullResult;
}

// If this file is run directly, execute the parser with default parameters
if (require.main === module) {
  console.log("Running parser-main directly...");
  // Use the same paths and files as the test to ensure consistent results
  const testDataDir = path.join(process.cwd(), "data", "test-data");
  const messagesFilePath = path.join(
    testDataDir,
    "120363028202164779-messages.json"
  );
  const groupsFilePath = path.join(testDataDir, "groups-test.json");
  const targetGroupId = "120363028202164779@g.us";
  
  parseTest(
    messagesFilePath,
    groupsFilePath,
    targetGroupId
  );
}
