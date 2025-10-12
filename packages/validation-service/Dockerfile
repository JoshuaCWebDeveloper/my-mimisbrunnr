FROM node:18-alpine

# Install curl
RUN apk add --no-cache curl

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

# Copy Service
COPY packages/validation-service/dist packages/validation-service/dist

# Set working directory
WORKDIR /app/packages/validation-service/dist

EXPOSE 3000


CMD ["node", "src/index.js"]