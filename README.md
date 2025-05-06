# WhatsApp Padel Tournament Butler

A WhatsApp bot built with Baileys that helps organize padel tournaments in WhatsApp groups.

## Current Functionality

- WhatsApp Web integration using Baileys
- Connect to WhatsApp via QR code
- Message syncing to SQLite database with time-based filtering
- Chronological message viewing (oldest first by default)
- Standardized timestamp format (YYYY-MM-DD HH:MM:SS)
- Read and monitor messages from specific WhatsApp groups

## Running the Application

1. Log in to WhatsApp Web (only needed once or if session expires):
   ```
   npm run whatsapp-login
   ```

## Usage Examples

### Fetching Message History
```bash
# Request history sync from WhatsApp (last 24 hours)
pnpm run fetch-history

# The script will exit immediately after sending the request
# Your always-on WebSocket handler will process the history when it arrives
```

### Monitoring Messages from Groups
```bash
# Monitor messages from all configured groups
pnpm run start

# Monitor messages with a specific date filter
pnpm run start --since=2023-10-01

# Monitor messages from a specific group
pnpm run start --group-id=120363028202164779@g.us
```

### Processing Signup Messages
```bash
# Process all signup messages from configured groups
pnpm run parse-all

# Process signups and output to a specific file
pnpm run parse-all --output=tournament-players.md

# Process signups from a specific date
pnpm run parse-all --since=2023-10-01
```


## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Start the application:
```bash
pnpm run dev
```

3. Scan the QR code that appears in the terminal using your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap on "Link a Device"
   - Scan the QR code displayed in your terminal

4. Once connected, the bot will read and log all messages from your WhatsApp groups.

## Development

- The project is written in TypeScript
- Source code is in the `src` directory
- Compiled code will be in the `dist` directory

## Scripts

- `pnpm run dev` - Start the application in development mode
- `pnpm run build` - Build the project
- `pnpm run start` - Start the built application
- `pnpm run watch` - Build and watch for changes
- `pnpm run whatsapp-login` - Connect to WhatsApp Web and create session files
- `pnpm run fetch-history` - Send a request to WhatsApp to sync message history for the past day
- `pnpm run parse-all` - Process signup messages from all configured groups (defined in groups.csv)
- `pnpm run view-messages` - Display messages from the target group in chronological order
  - Optional parameters: `--newest-first`, `--limit=10`
- `pnpm run fetch-groups` - List all available WhatsApp groups
- `pnpm run fetch-group-ids` - Output all WhatsApp groups in CSV format (ID,Name) for easy update of groups.csv

## Planned Features

- Tournament creation and management through WhatsApp commands
- Player registration and team formation
- Match scheduling and court assignments
- Score tracking and tournament standings
- Automated notifications and reminders
