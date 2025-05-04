# WhatsApp Padel Tournament Butler

A WhatsApp bot built with Baileys that helps organize padel tournaments in WhatsApp groups.

## Current Functionality

- Connect to WhatsApp via QR code
- Read messages from WhatsApp groups
- Log messages received from groups and direct messages

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

## Future Functionality

- Tournament creation and management
- Player registration
- Match scheduling
- Score tracking
- Automated notifications
