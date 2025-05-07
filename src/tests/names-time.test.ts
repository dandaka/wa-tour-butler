import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Team Registration with Time Format', () => {
  const resultPath = path.join(process.cwd(), 'data', 'test-data', 'result.json');
  
  beforeAll(() => {
    // Run the full registration parser to generate the result.json
    execSync('pnpm ts-node src/tests/registration-parser-test.ts', { 
      cwd: process.cwd(),
      stdio: 'ignore'
    });
  });

  test('should correctly parse "Name1 e Name2" format with time', () => {
    // Read the generated result.json
    const resultJson = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    
    // Find our test case message
    const testMessage = resultJson.filteredMessages.find(
      (msg: any) => msg.originalText === "Vlad Ra e Abilio Duarte 15h"
    );
    
    expect(testMessage).toBeDefined();
    
    // Check that it has exactly 2 players (not 3)
    expect(testMessage.players.length).toBe(2);
    
    // Check that player names don't include time
    expect(testMessage.players[0].name).toBe("Vlad Ra");
    expect(testMessage.players[1].name).toBe("Abilio Duarte");
    
    // Check that displayNames also don't have time
    expect(testMessage.players[0].displayName).toBe("Vlad Ra");
    expect(testMessage.players[1].displayName).toBe("Abilio Duarte");
    
    // Check that the time was correctly extracted as batch
    expect(testMessage.batch).toBe("15:00");
    
    // Check that it's recognized as a team
    expect(testMessage.isTeam).toBe(true);
  });

  test('should remove time patterns from all player names', () => {
    // Read the result.json
    const resultJson = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    
    // Check all player names in the filtered messages
    for (const message of resultJson.filteredMessages) {
      if (!message.players || message.players.length === 0) continue;
      
      // For each player, verify the name doesn't have time patterns
      for (const player of message.players) {
        if (player.name) {
          // Time patterns to check for
          const timePatterns = [
            /\s+\d{1,2}h\d{0,2}\s*$/i,         // 15h, 17h30
            /\s+\d{1,2}[:.]\d{2}\s*$/i,         // 15:00, 15.00
            /\s+\d{1,2}\s*$/i                   // Just 15
          ];
          
          // Make sure none of the patterns appear in names
          for (const pattern of timePatterns) {
            expect(player.name.match(pattern)).toBeNull();
          }
        }
      }
    }
  });
});
