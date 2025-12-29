#!/bin/bash
# Daily backup script for lucidgeo database
# Keeps last 7 days of backups

BACKUP_DIR="/Users/working/lucidgeo/backups"
DB_PATH="/Users/working/lucidgeo/data/store.db"
DATE=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/store_$DATE.db"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Only backup if database exists
if [ -f "$DB_PATH" ]; then
    # Use sqlite3 backup command for safe copy
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
    echo "Backup created: $BACKUP_FILE"

    # Remove backups older than 7 days
    find "$BACKUP_DIR" -name "store_*.db" -mtime +7 -delete
    echo "Old backups cleaned up"
else
    echo "Database not found at $DB_PATH"
    exit 1
fi
