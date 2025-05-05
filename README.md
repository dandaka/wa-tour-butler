# WhatsApp Padel Tournament Butler

A WhatsApp bot built with Baileys that helps organize padel tournaments in WhatsApp groups.

## Current Functionality

- WhatsApp Web integration using Baileys
- Connect to WhatsApp via QR code
- Message syncing to SQLite database with time-based filtering
- Chronological message viewing (oldest first by default)
- Standardized timestamp format (YYYY-MM-DD HH:MM:SS)
- Read and store messages from specific WhatsApp groups

## Running the Application

1. Log in to WhatsApp Web (only needed once or if session expires):
   ```
   npm run whatsapp-login
   ```

2. Sync messages from your target padel group with time-based filtering:
   ```
   # Default - last 24 hours
   npm run sync-messages
   
   # Last hour
   npm run sync-messages -- 1h
   
   # Last day
   npm run sync-messages -- 1d
   
   # Last week
   npm run sync-messages -- 1w
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
- `pnpm run sync-messages` - Sync messages from the target group to the database
  - Optional time period parameter: `1h` (1 hour), `1d` (1 day), `1w` (1 week)
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
