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

# Install nginx, supervisor, certbot and other utilities
RUN apk add --no-cache \
    bash \
    curl \
    nginx \
    supervisor \
    certbot \
    certbot-nginx \
    tzdata \
    openssl \
    && rm -rf /var/cache/apk/* \
    && mkdir -p /run/nginx /var/lib/nginx/tmp

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for Node.js
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/http.d/default.conf

# Copy supervisor configuration
COPY docker/supervisord.conf /etc/supervisord.conf

# Copy init scripts
COPY docker/init_cert.sh /usr/local/init_cert.sh
COPY docker/entrypoint.sh /usr/local/entrypoint.sh
RUN chmod +x /usr/local/init_cert.sh /usr/local/entrypoint.sh && rm -f /etc/crontabs/root

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

STOPSIGNAL SIGINT

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["/usr/local/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]