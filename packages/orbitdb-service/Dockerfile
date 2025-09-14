# Multi-stage Dockerfile for OrbitDB Manager Service
FROM node:18-alpine AS builder

# Install security updates and build tools
RUN apk update && apk upgrade && \
    apk add --no-cache curl python3 make g++ && \
    rm -rf /var/cache/apk/*

WORKDIR /build

# Set up complete workspace for NX builds
COPY package.json package-lock.json nx.json tsconfig.base.json tsconfig.json eslint.config.mjs vitest.workspace.ts ./
COPY packages/shared ./packages/shared/
COPY packages/orbitdb-service ./packages/orbitdb-service/

# Install all dependencies (needed for NX builds)
RUN npm install --ignore-scripts

# Build using NX (same as local development)
RUN npx nx build orbitdb-service

# Production stage
FROM node:18-alpine AS production

# Install security updates and required tools
RUN apk update && apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1002 -S orbitdb && \
    adduser -u 1002 -S orbitdb -G orbitdb

WORKDIR /app

# Set up workspace structure for production dependencies
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared/
COPY packages/orbitdb-service/package.json ./packages/orbitdb-service/

# Install production dependencies
RUN npm install --only=production --ignore-scripts

# Copy built application from builder stage
COPY --from=builder /build/packages/orbitdb-service/dist ./dist

# Create data directories
RUN mkdir -p /app/data/orbitdb && \
    chown -R orbitdb:orbitdb /app && \
    chmod -R 755 /app

USER orbitdb

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start OrbitDB manager service
CMD ["node", "dist/index.js"]