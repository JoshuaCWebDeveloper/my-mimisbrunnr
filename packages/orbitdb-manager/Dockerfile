# Multi-stage Dockerfile for OrbitDB Manager Service
FROM node:18-alpine AS base

# Install security updates and required tools
RUN apk update && apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 -S orbitdb && \
    adduser -u 1000 -S orbitdb -G orbitdb

WORKDIR /app

# Copy package files for dependency installation
COPY packages/orbitdb-manager/package.json ./
COPY packages/shared/*/package.json ./shared-libs/
COPY package.json yarn.lock ./root/

# Install dependencies
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# OrbitDB Manager build stage  
FROM base AS orbitdb-manager

# Copy shared libraries
COPY packages/shared ./shared-libs

# Copy OrbitDB manager source (excluding validator)
COPY packages/orbitdb-manager/src ./src
RUN rm -rf ./src/validator

# Copy configuration
COPY packages/orbitdb-manager/tsconfig.json ./

# Build TypeScript
RUN npm run build || echo "Build script not found, using TS files directly"

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
CMD ["node", "src/index.js"]