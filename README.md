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
pnpm run parse

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


## Planned Features

- Tournament creation and management through WhatsApp commands
- Player registration and team formation
- Match scheduling and court assignments
- Score tracking and tournament standings
- Automated notifications and reminders
