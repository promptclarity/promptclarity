# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache openssl

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy default config files (will be copied to /app/data/config on first run)
COPY --from=builder /app/config ./config-defaults

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy and setup entrypoint
COPY --chmod=755 <<'EOF' /usr/local/bin/docker-entrypoint.sh
#!/bin/sh
set -e

SECRET_FILE="/app/data/.nextauth_secret"
CONFIG_DIR="/app/data/config"
DEFAULT_CONFIG_DIR="/app/config-defaults"

# Ensure data directory exists
mkdir -p /app/data
chown -R nextjs:nodejs /app/data 2>/dev/null || true

# Copy default config files on first run (if config dir doesn't exist)
if [ ! -d "$CONFIG_DIR" ]; then
    echo "✓ First run detected - copying default configuration files..."
    cp -r "$DEFAULT_CONFIG_DIR" "$CONFIG_DIR" || true
    echo "✓ Configuration files copied to $CONFIG_DIR"
    echo "  You can customize these files and restart the container to apply changes."
else
    echo "✓ Using existing configuration from $CONFIG_DIR"
fi

# Generate NEXTAUTH_SECRET if not provided
if [ -z "$NEXTAUTH_SECRET" ]; then
    if [ -f "$SECRET_FILE" ]; then
        export NEXTAUTH_SECRET=$(cat "$SECRET_FILE")
        echo "✓ Loaded NEXTAUTH_SECRET from persistent storage"
    else
        export NEXTAUTH_SECRET=$(openssl rand -base64 32)
        echo "$NEXTAUTH_SECRET" > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
        echo "✓ Generated and persisted NEXTAUTH_SECRET"
    fi
fi

# Set default NEXTAUTH_URL if not provided
if [ -z "$NEXTAUTH_URL" ]; then
    export NEXTAUTH_URL="http://localhost:3000"
    echo "✓ Using default NEXTAUTH_URL: $NEXTAUTH_URL"
fi

echo "✓ Starting Prompt Clarity..."
exec "$@"
EOF

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
