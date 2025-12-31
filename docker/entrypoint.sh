#!/bin/bash
set -e

SECRET_FILE="/app/data/.nextauth_secret"

# Ensure data directory exists and has correct permissions
mkdir -p /app/data
chown -R nextjs:nodejs /app/data
chmod 755 /app/data

# Generate NEXTAUTH_SECRET if not provided
if [ -z "$NEXTAUTH_SECRET" ]; then
    if [ -f "$SECRET_FILE" ]; then
        export NEXTAUTH_SECRET=$(cat "$SECRET_FILE")
        echo "Loaded NEXTAUTH_SECRET from persistent storage"
    else
        export NEXTAUTH_SECRET=$(openssl rand -base64 32)
        echo "$NEXTAUTH_SECRET" > "$SECRET_FILE"
        chown nextjs:nodejs "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
        echo "Generated and persisted NEXTAUTH_SECRET"
    fi
fi

# Generate NEXTAUTH_URL if not provided
if [ -z "$NEXTAUTH_URL" ]; then
    if [ -n "$LETSENCRYPT_DOMAIN" ] && [ "$LETSENCRYPT_DOMAIN" != "none" ]; then
        export NEXTAUTH_URL="https://$LETSENCRYPT_DOMAIN"
        echo "Auto-generated NEXTAUTH_URL from domain: $NEXTAUTH_URL"
    else
        export NEXTAUTH_URL="http://localhost"
        echo "Using default NEXTAUTH_URL: $NEXTAUTH_URL"
    fi
fi

exec "$@"