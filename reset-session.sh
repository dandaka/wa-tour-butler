#!/bin/bash
# Script to reset WhatsApp session for wa-tour-butler

SESSION_DIR="$(pwd)/session"
BACKUP_DIR="$(pwd)/session-backup-$(date +%Y%m%d%H%M%S)"

echo "Creating backup of current session at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r "$SESSION_DIR"/* "$BACKUP_DIR"/ 2>/dev/null || echo "No existing session files to backup"

echo "Cleaning session directory"
rm -rf "$SESSION_DIR"
mkdir -p "$SESSION_DIR"

echo "Session reset complete. Now try running:"
echo "pnpm whatsapp-login"
