import { WhatsAppMessage } from "../types/messages";
import { REGISTRATION_KEYWORDS } from "../constants";

export function detectRegistrationStart(
  messages: WhatsAppMessage[],
  adminIds: string[]
): { message?: WhatsAppMessage; timestamp: number; found: boolean } {
  if (!messages || messages.length === 0) {
    return { found: false, timestamp: 0 };
  }

  // Filter messages to include only those from admin
  const adminMessages = messages.filter((message) => {
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

    
  }

  return { found: false, timestamp: 0 };
}
