import { WhatsAppMessage } from "../types/messages";
import { GroupInfo } from "../types/group-info";
import { REGISTRATION_KEYWORDS } from "../constants";

export function detectRegistrationStart(
  messages: WhatsAppMessage[],
  groupInfo: GroupInfo,
  startTimestamp: number = 0 // Default to 0 if not provided
): { message?: WhatsAppMessage; timestamp?: number; success: boolean } {
  if (!messages || messages.length === 0) {
    return { success: false };
  }

  // Extract admin IDs from the group info
  const adminIds = groupInfo.Admins.map((admin) =>
    admin.replace("@s.whatsapp.net", "")
  );

  // Filter messages to include only those from admin and after the start timestamp
  const adminMessages = messages.filter((message) => {
    // Skip messages before the start timestamp
    if (message.timestamp < startTimestamp) {
      return false;
    }
    const isFromAdmin = adminIds.some(
      (adminId) =>
        message.sender === adminId ||
        message.sender === `${adminId}@s.whatsapp.net`
    );

    return isFromAdmin;
  });

  // Look for registration keywords or time patterns
  for (const message of adminMessages) {
    const lowerContent = message.content.toLowerCase();

    // Check for registration keywords
    const containsRegistrationKeyword = REGISTRATION_KEYWORDS.some((keyword) =>
      lowerContent.includes(keyword.toLowerCase())
    );

    // If we found a message with registration keywords, return it
    if (containsRegistrationKeyword) {
      return {
        message,
        timestamp: message.timestamp,
        success: true,
      };
    }
  }

  // No registration message found
  return { success: false };
}
