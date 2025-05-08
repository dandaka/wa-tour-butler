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
    expect(resultContent.allMessages).toBeDefined();
    expect(resultContent.parsingResult).toBeDefined();
  });

  // Helper type for the parseTest result to avoid TypeScript errors
  type ParseTestResult = {
    groupInfo: any;
    registrationMessage: WhatsAppMessage | null;
    registrationStartTime: number | undefined;
    registrationEndTime: number | null;
    allMessages: WhatsAppMessage[];
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
    fullResult.allMessages.forEach(message => {
      expect(message.content.trim().length).toBeGreaterThan(0);
    });
    
    console.log(`Empty content test successful: Verified ${fullResult.allMessages.length} messages have content`);
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
    fullResult.allMessages.forEach(message => {
      expect(message).not.toHaveProperty('fromMe');
    });
    
    console.log(`FromMe property test successful: Verified ${fullResult.allMessages.length} messages`);
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
    fullResult.allMessages.forEach(message => {
      // Check property exists
      expect(message).toHaveProperty('timestamp_fmt');
      
      // Verify the format matches YYYY-MM-DD HH:MM:SS pattern
      const timestampFmt = message.timestamp_fmt as string;
      expect(timestampFmt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      
      // Validate that the formatted time corresponds to the original timestamp
      const originalDate = new Date(message.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19);
      expect(timestampFmt).toBe(originalDate);
    });
    
    if (fullResult.allMessages.length > 0) {
      const sample = fullResult.allMessages[0];
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
