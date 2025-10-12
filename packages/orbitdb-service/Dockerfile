FROM node:18-alpine

WORKDIR /app

# Copy Root
COPY package.json package-lock.json ./

# Copy Dependencies
COPY packages/shared/config/dist packages/shared/config/dist
COPY packages/shared/config/package.json packages/shared/config/package.json

COPY packages/shared/protocol/dist packages/shared/protocol/dist
COPY packages/shared/protocol/package.json packages/shared/protocol/package.json

COPY packages/shared/validation/dist packages/shared/validation/dist
COPY packages/shared/validation/package.json packages/shared/validation/package.json

# Install
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force
# Explicit install scripts
RUN npm explore @ipshipyard/node-datachannel -- npm run install

# Copy Service
COPY packages/orbitdb-service/dist packages/orbitdb-service/dist

# Set working directory
WORKDIR /app/packages/orbitdb-service/dist

# Create data directories
RUN mkdir -p ./orbitdb

EXPOSE 3001

CMD ["node", "src/index.js"]