# Multi-stage Dockerfile for AJV Validation Service
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

WORKDIR /build

# Set up complete workspace for NX builds
COPY package.json package-lock.json nx.json tsconfig.base.json tsconfig.json eslint.config.mjs vitest.workspace.ts ./
COPY packages/shared ./packages/shared/
COPY packages/validation-service ./packages/validation-service/

# Install all dependencies (needed for NX builds)
RUN npm install --ignore-scripts

# Build using NX (same as local development)
RUN npx nx build validation-service

# Production stage
FROM node:18-alpine AS production

# Install security updates and runtime tools
RUN apk update && apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S validator && \
    adduser -u 1001 -S validator -G validator

WORKDIR /app

# Set up workspace structure for production dependencies
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared/
COPY packages/validation-service/package.json ./packages/validation-service/

# Install production dependencies
RUN npm install --only=production --ignore-scripts

# Copy built application from builder stage
COPY --from=builder /build/packages/validation-service/dist ./dist

# Set security permissions
RUN chown -R validator:validator /app && \
    chmod -R 755 /app

USER validator

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start validator service
CMD ["node", "dist/index.js"]