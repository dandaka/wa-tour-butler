// Debug script for OUT player handling
import { parseSignupMessage } from './utils/signup-parser';

// Sample message that's causing issues
const outMessage = {
  sender: '123456789@s.whatsapp.net',
  timestamp: 1746469829,
  content: 'Miguel e Duarte out das 17h'
};

// Parse the message
const result = parseSignupMessage(outMessage);
console.log('Parsed result:', JSON.stringify(result, null, 2));

// Create a mock outPlayersByTimeSlot
const outPlayersByTimeSlot: Record<string, string[]> = {};

// Process the parsing result
if (result) {
  const signups = Array.isArray(result) ? result : [result];
  
  // Process each signup
  for (const signup of signups) {
    console.log('Signup names:', signup.names);
    console.log('Signup time:', signup.time);
    console.log('Signup status:', signup.status);
    
    // Handle OUT signups
    if (signup.status === 'OUT' && signup.time) {
      const timeKey = signup.time;
      if (!outPlayersByTimeSlot[timeKey]) {
        outPlayersByTimeSlot[timeKey] = [];
      }
      
      // Add each name to the OUT players list
      signup.names.forEach(name => {
        if (!outPlayersByTimeSlot[timeKey].includes(name)) {
          outPlayersByTimeSlot[timeKey].push(name);
          console.log(`Added ${name} to OUT list for time slot ${timeKey}`);
        }
      });
    }
  }
}

console.log('Final outPlayersByTimeSlot:', outPlayersByTimeSlot);

// Create mock time slots with Miguel and Duarte
const timeSlots: Record<string, string[]> = {
  '17:00': ['Miguel', 'Duarte', 'Bob', 'Alice']
};
console.log('Original time slots:', timeSlots);

// Now filter out players who opted out
for (const time of Object.keys(timeSlots)) {
  if (outPlayersByTimeSlot[time]) {
    // Filter out players who have opted out
    timeSlots[time] = timeSlots[time].filter(player => {
      const isOut = outPlayersByTimeSlot[time].some(outPlayer => {
        // Try case-insensitive comparison
        return outPlayer.toLowerCase() === player.toLowerCase();
      });
      return !isOut;
    });
  }
}

console.log('Filtered time slots:', timeSlots);
