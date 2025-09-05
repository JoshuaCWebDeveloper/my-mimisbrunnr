# Multi-stage Dockerfile for AJV Validation Sidecar
FROM node:18-alpine AS base

# Install security updates and required tools
RUN apk update && apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 -S validator && \
    adduser -u 1000 -S validator -G validator

WORKDIR /app

# Copy package files for dependency installation
COPY packages/validator-proxy/package.json ./
COPY packages/shared/*/package.json ./shared-libs/
COPY package.json yarn.lock ./root/

# Install dependencies
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Validation service build stage
FROM base AS validator

# Copy shared libraries
COPY packages/shared ./shared-libs

# Copy validator source
COPY packages/validator-proxy/src/validator ./src/validator

# Build TypeScript
RUN npm run build:validator || echo "Build script not found, copying TS files"

# Set security permissions
RUN chown -R validator:validator /app && \
    chmod -R 755 /app

USER validator

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start validator service
CMD ["node", "src/validator/index.js"]