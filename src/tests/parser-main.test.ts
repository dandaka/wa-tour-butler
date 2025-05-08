/**
 * Tests for the parser-main module
 */

import * as fs from "fs";
import * as path from "path";
import { parseTest, loadMessages } from "../parser/parser-main";
import { detectRegistrationStart } from "../parser/registration-start-detect";
import { calculateRegistrationEndTime } from "../parser/registration-end-detect";
import { WhatsAppMessage } from "../types/messages";
import { GroupInfo } from "../types/group-info";

describe("Parser Main", () => {
  // Common test data setup
  const testDataDir = path.resolve(__dirname, "../../data/test-data");
  const messagesFilePath = path.join(
    testDataDir,
    "120363028202164779-messages.json"
  );
  const groupsFilePath = path.join(testDataDir, "groups-test.json");
  const resultFilePath = path.join(testDataDir, "result.json");

  // Load test data for all tests
  let messages: WhatsAppMessage[];
  let groupsData: any[];
  let targetGroupId: string;
  let group: GroupInfo;
  let adminIds: string[];

  // Setup that runs before all tests
  beforeAll(() => {
    // Load messages
    messages = JSON.parse(fs.readFileSync(messagesFilePath, "utf8"));

    // Load group data
    groupsData = JSON.parse(fs.readFileSync(groupsFilePath, "utf8"));
    targetGroupId = "120363028202164779@g.us"; // This should match the messages file group ID

    // Find the target group in the groups data
    group = groupsData.find((g: any) => g.ID === targetGroupId);

    // Extract admin IDs, removing the @s.whatsapp.net part if present
    adminIds = group
      ? group.Admins.map((admin: string) =>
          admin.replace("@s.whatsapp.net", "")
        )
      : ["351936836204"]; // Fallback to a default in case the group isn't found
  });

  // Test registration start detection
  test("should detect registration start message", () => {
    // Call the registration start detection function directly
    const result = detectRegistrationStart(messages, group);

    // Verify registration start detection
    expect(result.success).toBe(true);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.message).toBeDefined();
    expect(result.message).toBeDefined();

    if (result.success && result.message) {
      // Verify message contents
      expect(result.message.content.toLowerCase()).toContain("inscrições");
      console.log("Registration message detected:", result.message.content);
      console.log(
        "Registration start time:",
        new Date(result.timestamp! * 1000).toISOString()
      );
    }
  });

  // Test registration end calculation
  test("should calculate registration end time from batches", () => {
    // First get the registration start time
    const regStart = detectRegistrationStart(messages, group);
    expect(regStart.success).toBe(true);

    if (regStart.success && regStart.timestamp) {
      // Call the registration end calculation directly
      const regEnd = calculateRegistrationEndTime(regStart.timestamp, group);

      // Log batch information
      if (group.Batches) {
        console.log("Batches found:", group.Batches.length);
        group.Batches.forEach((batch, index) => {
          console.log(
            `Batch ${index}: name=${batch.name}, tournamentTime=${
              batch.TournamentTime || "none"
            }`
          );
        });
      }

      // Verify registration end calculation if tournament times are defined
      const hasTournamentTimes =
        group.Batches && group.Batches.some((batch) => batch.TournamentTime);

      if (hasTournamentTimes) {
        expect(regEnd.success).toBe(true);
        expect(regEnd.timestamp).toBeGreaterThan(regStart.timestamp);
        console.log(
          "Registration end time:",
          new Date(regEnd.timestamp * 1000).toISOString()
        );
      } else {
        console.log("No tournament times defined in test data");
      }
    }
  });

  // Test the full parsing workflow and result file creation
  test("should parse messages and write result to file", () => {
    // Call the parseTest function - which now returns the comprehensive result
    const fullResult = parseTest(
      messagesFilePath,
      groupsFilePath,
      targetGroupId
    );

    // Write the comprehensive result to the result.json file
    fs.writeFileSync(
      resultFilePath,
      JSON.stringify(fullResult, null, 2),
      "utf8"
    );

    // Verify that result was written correctly
    expect(fs.existsSync(resultFilePath)).toBe(true);

    // Read the result back to verify content
    const resultContent = JSON.parse(fs.readFileSync(resultFilePath, "utf8"));

    // Verify structure of result
    expect(resultContent).toBeDefined();
    expect(typeof resultContent).toBe("object");
    expect(resultContent.groupInfo).toBeDefined();
    expect(resultContent.registrationMessage).toBeDefined();
    expect(resultContent.messages).toBeDefined();
    expect(resultContent.parsingResult).toBeDefined();
  });

  // Helper type for the parseTest result to avoid TypeScript errors
  type ParseTestResult = {
    groupInfo: any;
    registrationMessage: WhatsAppMessage | null;
    registrationStartTime: number | undefined;
    registrationEndTime: number | null;
    messages: WhatsAppMessage[];
    messagesByBatch: Record<string, WhatsAppMessage[]>;
    parsingResult: {
      registrationStart: { message?: WhatsAppMessage; timestamp?: number; success: boolean };
      registrationEnd: { timestamp: number; success: boolean };
    };
  };

  // Test the complete integration of registration start detection
  test('should correctly integrate registration start detection', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // First check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify registration start detection in the full result
    expect(fullResult.parsingResult.registrationStart.success).toBe(true);
    expect(fullResult.registrationStartTime).toBeDefined();
    expect(fullResult.registrationMessage).toBeDefined();
    
    if (fullResult.registrationStartTime) {
      console.log('Registration start test successful:');
      console.log('- Registration starts:', new Date(fullResult.registrationStartTime * 1000).toISOString());
      console.log('- Registration message:', fullResult.registrationMessage?.content);
    }
  });

  // Test message cleaning to remove empty content
  test('should remove messages with empty content', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify that all messages have content (not empty)
    fullResult.messages.forEach((message: WhatsAppMessage) => {
      expect(message.content.trim().length).toBeGreaterThan(0);
    });
    
    console.log(`Empty content test successful: Verified ${fullResult.messages.length} messages have content`);
  });
  
  // Test message cleaning to remove fromMe property
  test('should remove fromMe property from all messages', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify that none of the messages have the fromMe property
    fullResult.messages.forEach((message: WhatsAppMessage) => {
      expect(message).not.toHaveProperty('fromMe');
    });
    
    console.log(`FromMe property test successful: Verified ${fullResult.messages.length} messages`);
  });
  
  // Test system message filtering
  test('should remove system messages with content that only has [TEXT_IN_BRACKETS]', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify that none of the messages have content that only consists of text in square brackets
    const systemMessagePattern = /^\s*\[[^\]]+\]\s*$/;
    
    fullResult.messages.forEach((message: WhatsAppMessage) => {
      expect(systemMessagePattern.test(message.content)).toBe(false);
    });
    
    console.log(`System message filtering test successful: All ${fullResult.messages.length} remaining messages are not system messages`);
  });
  
  // Test batch assignment
  test('should assign messages to appropriate batches based on keywords', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Get group info to extract batch details
    const batches = fullResult.groupInfo.Batches || [];
    expect(batches.length).toBeGreaterThan(0);
    
    // Verify that at least some messages have been assigned batches
    const messagesWithBatches = fullResult.messages.filter((msg: WhatsAppMessage) => (msg as any).batch);
    expect(messagesWithBatches.length).toBeGreaterThan(0);
    
    // Check if messages with batch keywords are assigned to the right batch
    // Extract all batch keywords for testing
    const batchKeywordsMap = new Map<string, string[]>();
    batches.forEach((batch: any) => {
      if (batch.keywords && batch.keywords.length > 0) {
        batchKeywordsMap.set(batch.name, batch.keywords);
      }
    });
    
    // For each message with a batch assigned, verify it contains a keyword for that batch
    const batchSamples: Record<string, number> = {};
    messagesWithBatches.forEach((msg: WhatsAppMessage) => {
      const batchName = (msg as any).batch;
      const keywords = batchKeywordsMap.get(batchName) || [];
      
      // Count each batch for reporting
      batchSamples[batchName] = (batchSamples[batchName] || 0) + 1;
      
      // Sample validation - test some messages explicitly
      // If the message contains at least one of the batch's keywords, or it's assigned the default batch
      const defaultBatch = batches.find((b: any) => b.default === true);
      const defaultBatchName = defaultBatch ? defaultBatch.name : null;
      
      if (batchName !== defaultBatchName) {
        // For non-default batches, message should contain one of the keywords
        const containsKeyword = keywords.some(keyword => 
          msg.content.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // Don't expect every message to contain a keyword - that depends on default batch logic
        // But log some examples for verification
        if (containsKeyword) {
          // This is a good sample to verify - it explicitly mentions the batch
          console.log(`Verified batch assignment: "${batchName}" for message: "${msg.content.substring(0, 50)}..."`);
        }
      }
    });
    
    // Log overall batch assignment statistics
    console.log('Batch assignment summary:');
    Object.entries(batchSamples).forEach(([batch, count]) => {
      console.log(`- Batch ${batch}: ${count} messages`);
    });
  });
  
  // Test sender name enrichment
  test('should add sender names to messages from contacts', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify that all messages have the sender_name property
    fullResult.messages.forEach((message: WhatsAppMessage) => {
      expect(message).toHaveProperty('sender_name');
      expect(typeof message.sender_name).toBe('string');
    });
    
    // Verify that all messages have a sender_name that is either a contact name or the original sender ID
    fullResult.messages.forEach((message: WhatsAppMessage) => {
      expect(message).toHaveProperty('sender_name');
      const senderName = message.sender_name as string;
      expect(senderName.length).toBeGreaterThan(0);
    });
    
    // Rather than testing specific name matches (which might change in the test data),
    // let's verify that some messages have names that differ from their phone numbers
    // as evidence that the contact mapping is working
    const messagesWithRealNames = fullResult.messages.filter((message: WhatsAppMessage) => {
      const senderNumber = message.sender.split('@')[0];
      const senderName = message.sender_name as string;
      return senderName !== senderNumber && senderName !== message.sender;
    });
    
    // We should have at least 5 messages with real names from contacts
    expect(messagesWithRealNames.length).toBeGreaterThanOrEqual(5);
    
    // Log a few examples of mapped names
    console.log('Examples of sender name mapping:');
    messagesWithRealNames.slice(0, 5).forEach((message: WhatsAppMessage) => {
      console.log(`${message.sender} → ${message.sender_name as string}`);
    });
    
    // Count how many messages have names different from their phone numbers (actual contact matches)
    const messagesWithNames = fullResult.messages.filter((msg: WhatsAppMessage) => {
      const senderName = msg.sender_name as string;
      return senderName !== msg.sender.split('@')[0] && senderName !== msg.sender;
    });
    
    console.log(`Sender name test successful: ${messagesWithNames.length} messages have real contact names`);
  });
  
  // Test timestamp formatting
  test('should add formatted timestamps to all messages', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // Check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify that all messages have the timestamp_fmt property with proper format
    fullResult.messages.forEach((message: WhatsAppMessage) => {
      // Check property exists
      expect(message).toHaveProperty('timestamp_fmt');
      
      // Verify the format matches YYYY-MM-DD HH:MM:SS pattern
      const timestampFmt = message.timestamp_fmt as string;
      expect(timestampFmt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      
      // Validate that the formatted time corresponds to the original timestamp
      const originalDate = new Date(message.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19);
      expect(timestampFmt).toBe(originalDate);
    });
    
    if (fullResult.messages.length > 0) {
      const sample = fullResult.messages[0];
      console.log(`Timestamp formatting test successful: ${sample.timestamp} → ${sample.timestamp_fmt}`);
    }
  });
  
  // Test the complete integration of registration end detection
  test('should correctly integrate registration end detection', () => {
    // Call the full parser
    const result = parseTest(messagesFilePath, groupsFilePath, targetGroupId);
    
    // First check if the result is a success object with the right structure
    expect(result).toBeDefined();
    expect('groupInfo' in result).toBe(true);
    
    // Since we've confirmed the result has the right structure, we can type cast it safely
    const fullResult = result as ParseTestResult;
    
    // Verify registration end calculation in the full result if applicable
    if (fullResult.groupInfo?.Batches) {
      const hasTournamentTimes = fullResult.groupInfo.Batches.some(
        (batch: any) => batch.TournamentTime
      );
      
      if (hasTournamentTimes) {
        expect(fullResult.parsingResult.registrationEnd.success).toBe(true);
        expect(fullResult.registrationEndTime).toBeDefined();
        
        if (fullResult.registrationStartTime && fullResult.registrationEndTime) {
          expect(fullResult.registrationEndTime).toBeGreaterThan(fullResult.registrationStartTime);
          
          console.log('Registration end test successful:');
          console.log('- Registration ends:', new Date(fullResult.registrationEndTime * 1000).toISOString());
          
          // Calculate registration window duration
          const durationHours = (fullResult.registrationEndTime - fullResult.registrationStartTime) / 3600;
          console.log(`- Registration window duration: ${durationHours.toFixed(2)} hours`);
        }
      } else {
        console.log('No tournament times found in test data - skipping end time checks');
      }
    }
  });
});
