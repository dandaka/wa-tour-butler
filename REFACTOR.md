# WhatsApp Tournament Butler Refactoring Plan

## Current Structure Analysis

### Original Structure (commit 881cb300c98a29b7d0fc28bca4137c277ac24e6f)

The original project had a simpler, more monolithic structure:

```
src/
├── debug-out-handling.ts
├── handlers/
│   └── messageHandler.ts
├── index.ts
├── scripts/
│   ├── fetch-history.ts
│   ├── fetchGroupChats.ts
│   ├── fetchGroupIds.ts
│   ├── monitor-messages.ts
│   ├── process-all-groups.ts
│   ├── process-signups-formatters.test.ts
│   ├── process-signups.test.ts
│   ├── process-signups.ts           # Main processing logic was here
│   ├── view-db-messages.ts
│   └── whatsappLogin.ts
├── tournament/
│   └── tournamentManager.ts
├── types/
│   ├── better-sqlite3.d.ts
│   ├── qrcode-terminal.d.ts
│   └── tournament.ts
├── utils/
│   ├── logger.ts
│   ├── signup-parser.test.ts
│   ├── signup-parser.ts             # Parser logic was here
│   ├── team-numbering.test.ts
│   └── team-numbering.ts            # Team numbering logic was here
└── whatsapp/
    └── connection.ts
```

Most logic was concentrated in a few key files:
- `process-signups.ts`: Main script handling tournament signup processing
- `signup-parser.ts`: Parser for WhatsApp messages
- `team-numbering.ts`: Logic for assigning team numbers

### Current Structure Assessment

Progress has been made with modularizing the codebase:
- The signup-parser has been extracted into its own module
- Tests have been created for the modularized components
- Some utility functions have been separated

However, several issues remain:
- Large files with multiple responsibilities (signup-parser.ts is ~31K chars)
- Utility functions scattered throughout the codebase
- Limited separation between data access, business logic, and presentation layers
- Main script files (like process-signups.ts) still have too many responsibilities

## Refactoring Goals

1. **Maintain Test Integrity**: Ensure all existing tests pass throughout the refactoring process.
2. **Improve Modularity**: Break down the monolithic structure into logical components.
3. **Establish Clear Boundaries**: Define clear interfaces between components.
4. **Ensure Maintainability**: Make the codebase easier to maintain and extend.
5. **Preserve Functionality**: All existing features should continue to work correctly.

## Refactoring Approach: Test-Driven Development (TDD)

We will use a strict Test-Driven Development approach for the refactoring:

1. **Write Tests First**: Before making any changes, write tests that verify the expected behavior.
2. **Red-Green-Refactor**:
   - Red: Write a failing test for the functionality you want to change
   - Green: Implement the minimal code to make the test pass
   - Refactor: Clean up the code while keeping tests passing

3. **Small, Incremental Changes**: Make changes in small, testable increments:
   - Complete one module extraction at a time
   - Run tests after each change to ensure nothing breaks
   - Commit working code frequently

4. **Continuous Verification**: Regularly run the application to confirm functionality is preserved.

## Proposed Architecture

```
src/
├── core/                     # Core business logic
│   ├── processor.ts          # Main processing pipeline
│   ├── registration.ts       # Registration detection logic
│   └── teams.ts              # Team numbering and management
├── data/                     # Data access layer
│   ├── database.ts           # Database operations
│   └── group-info.ts         # Group information access
├── formatters/               # Output formatters
│   ├── console-formatter.ts  # Console output
│   └── markdown-formatter.ts # Markdown output
├── parsers/                  # Message parsing
│   ├── index.ts              # Main parser entry point
│   ├── classifier.ts         # Message type classification
│   ├── out-messages.ts       # OUT message parsing
│   ├── time-slots.ts         # Time extraction
│   └── team-messages.ts      # Team message parsing
├── scripts/                  # CLI scripts
│   └── [existing scripts]
├── types/                    # TypeScript type definitions
│   └── index.ts              # Centralized type definitions
├── utils/                    # Utility functions
│   ├── date.ts               # Date handling
│   ├── logger.ts             # Logging utilities
│   └── string.ts             # String manipulation
└── whatsapp/                 # WhatsApp integration
    └── connection.ts         # WhatsApp connection handling
```
  signups: ParsedSignup[];
  processedSignups?: ProcessedSignup[]; 
  finalPlayerList: string[];
  outPlayersByTimeSlot: Record<string, string[]>;
}

export interface ProcessedSignup extends ParsedSignup {
  teamNumber?: number;
  formattedNames?: string[];
}
```

### Parser Module Structure

```typescript
// src/parsers/index.ts
import { WhatsAppMessage, ParsedSignup } from '../types';
import { parseOutMessage } from './out-messages';
import { parseTeamMessage } from './team-messages';
import { parseSinglePlayerMessage } from './single-player';
import { cleanMessageContent } from './common';

/**
 * Parse a WhatsApp message to extract signup information
 * This is the main entry point for all parsing logic
 */
export function parseSignupMessage(message: WhatsAppMessage): ParsedSignup | ParsedSignup[] | null {
  // Clean the message content first
  const cleanedContent = cleanMessageContent(message.content);
  if (!cleanedContent) return null;
  
  // Create a message object with cleaned content
  const cleanedMessage = { ...message, content: cleanedContent };
  
  // Try parsing as an OUT message first
  const outResult = parseOutMessage(cleanedMessage);
  if (outResult) return outResult;
  
  // Try parsing as a team message
  const teamResult = parseTeamMessage(cleanedMessage);
  if (teamResult) return teamResult;
  
  // Try parsing as a single player message
  const singleResult = parseSinglePlayerMessage(cleanedMessage);
  if (singleResult) return singleResult;
  
  // No valid signup information found
  return null;
}
```

### Core Processing Module

```typescript
// src/core/processor.ts
import { WhatsAppMessage, GroupInfo, ProcessingResult } from '../types';
import { parseSignupMessage } from '../parsers';
import { findRegistrationMessage } from './registration';
import { processSignupsWithTeams } from './teams';

/**
 * Process messages to extract signup information
 */
export function processMessages(
  messages: WhatsAppMessage[], 
  groupInfo: GroupInfo, 
  forceRegistrationTimestamp?: number
): ProcessingResult {
  // Find registration message or use forced timestamp
  const registrationMessage = forceRegistrationTimestamp 
    ? { id: 'forced', sender: groupInfo.admin, timestamp: forceRegistrationTimestamp, content: '[FORCED]' }
    : findRegistrationMessage(messages, groupInfo.admin);
  
  // Filter messages after registration
  const relevantMessages = messages.filter(m => 
    m.timestamp >= (registrationMessage?.timestamp || 0) && 
    m.sender !== groupInfo.admin
  );
  
  // Process each message
  const signups = relevantMessages
    .map(message => parseSignupMessage(message))
    .filter(Boolean) // Remove null results
    .flat(); // Handle array results
  
  // Process team numbering
  const processedSignups = processSignupsWithTeams(signups);
  
  // Track players who opted out by time slot
  const outPlayersByTimeSlot: Record<string, string[]> = {};
  signups
    .filter(signup => signup.status === 'OUT')
    .forEach(signup => {
      const slot = signup.time || 'all';
      if (!outPlayersByTimeSlot[slot]) outPlayersByTimeSlot[slot] = [];
      signup.names.forEach(name => {
        if (!outPlayersByTimeSlot[slot].includes(name)) {
          outPlayersByTimeSlot[slot].push(name);
        }
      });
    });
  
  // Generate final player list
  const finalPlayerList = processedSignups
    .filter(signup => signup.status === 'IN')
    .flatMap(signup => signup.formattedNames || signup.names);
  
  return {
    registrationOpenMessage: registrationMessage,
    signups,
    processedSignups,
    finalPlayerList,
    outPlayersByTimeSlot
  };
}
```

## Refactoring Strategy

### Phase 1: Setup and Preparation

1. Create a new branch from commit `881cb300c98a29b7d0fc28bca4137c277ac24e6f`.
   ```bash
   git checkout 881cb300c98a29b7d0fc28bca4137c277ac24e6f
   git switch -c clean-refactoring
   ```

2. Add comprehensive documentation to existing files.
   - Add JSDoc comments to all functions in process-signups.ts, signup-parser.ts, and team-numbering.ts
   - Create a README.md explaining the project architecture

3. Add more unit tests to cover edge cases.
   - Create tests for all edge cases in OUT message parsing
   - Create tests for time slot extraction with various formats
   - Create tests for team name parsing with different separators

### Phase 2: Extract Common Types

1. Create a centralized types module in `src/types/index.ts`.
   - Move all interfaces from process-signups.ts and signup-parser.ts
   - Ensure backward compatibility with existing code

2. Update existing files to import from this module.
   - Replace local interface definitions with imports
   - Ensure type consistency across modules

3. Ensure tests continue to pass.
   - Run existing tests to verify type changes don't break functionality
   - Fix any type-related issues that arise

### Phase 3: Improve Parsers

1. Identify logical boundaries in the parsing logic.
   - Message cleaning and preparation
   - Time slot extraction
   - OUT message parsing
   - Team message parsing
   - Single player parsing

2. Create the parsers directory structure.
   ```bash
   mkdir -p src/parsers
   touch src/parsers/index.ts
   touch src/parsers/common.ts
   touch src/parsers/out-messages.ts
   touch src/parsers/team-messages.ts
   touch src/parsers/single-player.ts
   touch src/parsers/time-slots.ts
   ```

3. Extract each parsing component one by one:
   a. First, move the utility functions (cleaning, time extraction)
   b. Then move OUT message parsing logic
   c. Then move team parsing logic
   d. Finally move single player parsing logic

4. Create a facade module in `parsers/index.ts` that maintains the same API as the original signup-parser.ts

5. Update tests to verify each parser component individually

### Phase 4: Core Logic Extraction

1. Extract database operations into data layer.
   ```typescript
   // src/data/database.ts
   export function getMessagesFromGroup(db: DatabaseType, groupId: string): Message[] {
     const query = `
       SELECT id, chat_id, sender, timestamp, content, is_from_me
       FROM messages
       WHERE chat_id = ?
       ORDER BY timestamp ASC
     `;
     
     return db.prepare(query).all(groupId) as Message[];
   }
   ```

2. Extract registration detection logic.
   ```typescript
   // src/core/registration.ts
   export function findRegistrationMessage(messages: Message[], adminId: string): Message | null {
     // Implementation
   }
   ```

3. Extract team numbering logic.
   ```typescript
   // src/core/teams.ts
   export function processSignupsWithTeams(signups: ParsedSignup[]): ProcessedSignup[] {
     // Implementation
   }
   ```

4. Create a processor module that orchestrates the process.

5. Update tests for each component.

### Phase 5-7: Formatters, Utilities, Integration

Follow similar patterns for these components, extracting them one by one and maintaining test integrity throughout.

## Implementation Plan

### Phase 1: Establish Core Interfaces

1. **Define Domain Types**:
   - Write tests for type validation
   - Create comprehensive type definitions in `types/index.ts`
   - Use these types to guide further development

2. **Create Boundaries**:
   - Define clear interfaces between components
   - Test these interfaces with mock implementations

### Phase 2: Extract Utility Functions

1. **Create Utility Modules**:
   - Text handling utilities
   - Date/time formatting
   - Logging enhancements

2. **TDD Process for Each Utility**:
   - Write tests for each utility function
   - Extract the function from existing code
   - Refactor until tests pass

### Phase 3: Implement Message Parser Modules

1. **Message Classifier**:
   - Write tests for message type detection
   - Implement classifier module
   - Ensure all test cases pass

2. **Specialized Parsers**:
   - Team message parser
   - OUT message parser
   - Single player parser
   - Special case handlers

3. **Complete Parser Integration**:
   - Create unified parser interface
   - Update existing code to use new parsers

### Phase 4: Implement Processing Pipeline

1. **Define Pipeline Steps**:
   - Message classification
   - Parsing
   - Processing
   - Output formatting

2. **Create Pipeline Framework**:
   - Test-driven implementation of pipeline
   - Step-by-step execution with clear state transitions

### Phase 5: Refactor Data Access

1. **Repository Pattern Implementation**:
   - Message repository
   - Group repository
   - Player repository

2. **Database Access Abstraction**:
   - Create data access interfaces
   - Implement concrete implementations

## Testing Strategy

For each component:

1. **Unit Tests**:
   - Test each function in isolation
   - Use mock objects for dependencies

2. **Integration Tests**:
   - Test components working together
   - Verify correct data flow between modules

3. **End-to-End Tests**:
   - Test complete processing pipeline
   - Verify real-world examples

## Execution Strategy

1. **One Component at a Time**:
   - Complete refactoring of one component before moving to the next
   - Ensure all tests pass after each component is refactored

2. **Regular Testing**:
   - Run tests after each significant change
   - Fix failing tests immediately

3. **Documentation**:
   - Add JSDoc comments to all functions
   - Create architecture documentation
   - Document the design decisions and patterns used

4. **Code Review**:
   - Review each completed component
   - Ensure adherence to architecture principles
   
5. **Continuous Integration**:
   - Run the full application after major changes
   - Verify functionality with real data
     if (message.content.includes('OUT')) {
       return {
         originalMessage: message.content,
         names: ['Test User'],
         status: 'OUT',
         timestamp: message.timestamp,
         sender: message.sender,
         isTeam: false
       };
     }
     return null;
   }
   ```

2. Use snapshots for output format testing.
   ```typescript
   it('should format output consistently', () => {
     const result = formatOutput(testResult, testGroupInfo);
     expect(result).toMatchSnapshot();
   });
   ```

3. Create integration tests that simulate the entire pipeline.

## Conclusion

This refactoring plan aims to improve the maintainability and extensibility of the WhatsApp Tournament Butler while preserving existing functionality. By following this plan, the codebase will become more modular, easier to test, and simpler to extend with new features.

The key to successful refactoring is to make small, incremental changes that can be easily verified, rather than large, sweeping changes that might introduce bugs or break existing functionality.
