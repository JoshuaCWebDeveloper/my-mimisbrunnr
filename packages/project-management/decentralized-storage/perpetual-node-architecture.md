# Perpetual Node Architecture

## Overview

The perpetual node provides persistent infrastructure for the decentralized taglist system using IPFS and OrbitDB. It consists of existing containerized services (Kubo IPFS) and custom Node.js services for OrbitDB management.

## File Structure

```
packages/perpetual-node/
├── README.md
├── package.json
├── tsconfig.json
├── Dockerfile                      # Custom OrbitDB service container
├── entrypoint.sh                   # Container startup script
├── config/
│   ├── nginx.conf                  # Nginx proxy with Lua filtering
│   └── kubo/                       # Kubo IPFS configuration
│       ├── 001-configure-cors.sh   # CORS setup script
│       ├── 002-configure-gateway.sh # Gateway configuration
│       └── ipfs-config.json        # Base IPFS configuration
├── src/
│   ├── index.ts                    # Main entry point
│   ├── config/
│   │   ├── orbitdb.ts              # OrbitDB configuration
│   │   └── environment.ts          # Environment variables
│   ├── services/
│   │   ├── ipfs-client.ts          # IPFS HTTP client wrapper
│   │   ├── orbitdb-manager.ts      # OrbitDB database management
│   │   ├── replication-handler.ts  # Simple replication handling
│   │   └── rate-limiter.ts         # Basic rate limiting
│   ├── types/
│   │   ├── ipfs.ts                 # IPFS-related types
│   │   └── orbitdb.ts              # OrbitDB-related types
│   └── utils/
│       ├── logging.ts              # Logging configuration
│       └── health-check.ts         # Health check endpoints
└── test/
    ├── integration/
    └── unit/

# Root level (monorepo)
docker-compose.yml                  # Multi-service orchestration
```

## Service Architecture

### Container Composition

**Note**: See `docker-compose-architecture.md` for complete Docker Compose configuration.

The perpetual-node package provides a custom OrbitDB management service and nginx filtering proxy. It works alongside the official Kubo IPFS container:

### IPFS API Filtering Proxy

**Purpose:** Provides defensive filtering for public IPFS API access

**Configuration:**

-   **Image**: `openresty/openresty:alpine` (nginx + Lua scripting)
-   **Exposed Port**: 5001 (replaces direct kubo exposure)
-   **Config File**: `config/nginx.conf` with Lua content inspection

**Binary Content Detection:**

```lua
-- Detect null bytes (primary binary indicator)
if string.find(body, string.char(0)) then
    return 415 "Binary files not allowed"
end

-- Analyze non-printable character ratio
if binary_chars / sample_size > 0.05 then
    return 415 "Binary files not allowed"
end
```

### Custom OrbitDB Manager Service

**Purpose:** Manages OrbitDB operations that can't be handled by Kubo alone

**Core Responsibilities:**

1. **OrbitDB Pubsub Participation**

    - Open/create the `xcom-taglist-discovery` OrbitDB log
    - Participate in pubsub replication network
    - Maintain connection to OrbitDB peers

2. **OrbitDB Content Pinning**

    - Auto-pin OrbitDB log entries as they replicate
    - Pin OrbitDB log heads for availability
    - Basic cleanup of very old entries (storage management only)

3. **IPFS Infrastructure**
    - Provide IPFS API endpoint for client pinning requests
    - Maintain IPFS node availability and peer connections
    - Basic defensive rate limiting on API endpoints

## Key Service Components

### 1. OrbitDB Manager (`src/services/orbitdb-manager.ts`)

```typescript
export class OrbitDBManager {
    private ipfs: IPFSHTTPClient;
    private orbitdb: OrbitDB;
    private discoveryLog: LogStore<any>;

    async initialize(): Promise<void>;
    async openDiscoveryLog(): Promise<void>;
    async handleReplication(address: string, hash: string): Promise<void>;
    getDiscoveryLog(): LogStore<any>;
}
```

**Key Operations:**

-   Connect to IPFS via HTTP API (`http://kubo:5001`)
-   Initialize OrbitDB with IPFS instance
-   Open the shared discovery log database
-   Set up replication event handlers (no filtering)
-   Participate in pubsub network as a peer

### 2. Simple Replication Handler (`src/services/replication-handler.ts`)

```typescript
export class ReplicationHandler {
    async handleNewEntry(entry: LogEntry<any>): Promise<void>;
    async pinEntryContent(entryCid: string): Promise<void>;
    async cleanupOldEntries(): Promise<void>;
}
```

**Simple Operations:**

-   Listen for new OrbitDB entries via replication events
-   Pin entry CIDs to local IPFS node (no content validation)
-   Basic cleanup of very old entries (storage management only)
-   No business logic or data filtering

### 3. Basic Rate Limiter (`src/services/rate-limiter.ts`)

```typescript
export class BasicRateLimiter {
    async checkIPFSAPILimit(clientIP: string): Promise<boolean>;
    async trackRequest(clientIP: string): Promise<void>;
    async cleanupOldRequests(): Promise<void>;
}
```

**Defensive Rate Limiting:**

-   Simple request counting per IP for IPFS API endpoints
-   Prevent DoS attacks on the node infrastructure
-   No filtering of OrbitDB data - only protective measures for node resources
-   Basic cleanup of tracking data

## Data Flow

### 1. Startup Sequence

```
1. Kubo IPFS node starts (managed by Docker Compose)
2. OrbitDB Manager service starts and connects to Kubo via HTTP API
3. OrbitDB instance initializes with IPFS connection
4. Discovery log opens/creates with address: 'xcom-taglist-discovery'
5. Replication handlers register for new entries (no filtering)
6. Rate limiter initializes for API protection
7. Health check endpoint activates
```

### 2. OrbitDB Entry Replication

```
1. OrbitDB receives new entry via pubsub replication
2. Entry CID automatically gets pinned (no validation)
3. Entry becomes available via discovery log
4. Old entries cleaned up periodically (storage management only)
```

### 3. Client Content Pinning (Standard IPFS API)

```
1. Client publishes tag list to IPFS, gets CID
2. Client calls IPFS pin API: POST /api/v0/pin/add?arg=<tag-list-cid>
3. Client publishes DID document with tag list reference
4. Client calls IPFS pin API: POST /api/v0/pin/add?arg=<did-doc-cid>
5. Client publishes IPNS record pointing to DID document
6. Client adds discovery record to OrbitDB log
```

**Note:** Client responsibilities are documented in the mimisbrunnr-ext package section of the planning document.

## Configuration

### Environment Variables

```bash
# IPFS Configuration
IPFS_API_URL=http://kubo:5001
IPFS_GATEWAY_URL=http://kubo:8080

# OrbitDB Configuration
ORBITDB_LOG_NAME=xcom-taglist-discovery
ORBITDB_DATA_DIR=/app/data/orbitdb

# Service Configuration
PORT=3000
LOG_LEVEL=info
HEALTH_CHECK_INTERVAL=30000

# Basic Configuration
STORAGE_CLEANUP_INTERVAL=3600000
MAX_LOG_ENTRIES_PINNED=1000
API_RATE_LIMIT_PER_IP=100
```

### OrbitDB Manager Configuration

```typescript
// src/config/environment.ts
export const config = {
    ipfs: {
        apiUrl: process.env.IPFS_API_URL || 'http://localhost:5001',
        gatewayUrl: process.env.IPFS_GATEWAY_URL || 'http://localhost:8080',
    },
    orbitdb: {
        logName: process.env.ORBITDB_LOG_NAME || 'xcom-taglist-discovery',
        dataDir: process.env.ORBITDB_DATA_DIR || '/app/data/orbitdb',
    },
    service: {
        port: parseInt(process.env.PORT || '3000'),
        logLevel: process.env.LOG_LEVEL || 'info',
    },
};
```

**Note**: Kubo IPFS configuration details are in `docker-compose-architecture.md`

## Dependencies

### Runtime Dependencies

-   `ipfs-http-client` - IPFS API client
-   `orbit-db` - Decentralized database
-   `@noble/hashes` - Cryptographic hashing
-   `@noble/ed25519` - Ed25519 signature verification
-   `express` - HTTP server for health checks
-   `winston` - Logging

### Docker Images Used

-   `ipfs/kubo:latest` - Official Kubo IPFS implementation
-   `node:18-alpine` - Base image for custom OrbitDB service

## Health Monitoring

### Health Check Endpoints

```
GET /health - Overall service health
GET /health/ipfs - IPFS connection status
GET /health/orbitdb - OrbitDB status and peer count
GET /health/discovery - Discovery log statistics
GET /health/pins - Pinning service status
```

### Metrics (Simple Logging)

-   Discovery records processed per hour
-   Pinning success/failure rates
-   OrbitDB peer count
-   IPFS connection status
-   Disk usage for pinned content

## Security Considerations

### Defensive Infrastructure Protection

-   **IPFS API Filtering**: Nginx proxy with Lua scripting blocks binary content uploads
-   **Content Inspection**: Detects null bytes and high ratios of non-printable characters
-   **Size Limiting**: 1MB maximum request size to prevent resource exhaustion
-   **Endpoint Filtering**: Only `/add`, `/pin/add`, `/cat`, `/get` endpoints allowed
-   **Rate Limiting**: 10 req/sec per IP with burst allowances
-   Health check endpoint exposed but read-only
-   Basic request tracking per IP address
-   Resource usage monitoring

### Minimal Attack Surface

-   No business logic validation (handled by clients)
-   No semantic content validation (JSON structure, DID proofs, etc.)
-   No custom authentication or authorization
-   Standard IPFS/OrbitDB protocols only

### Resource Management

-   Basic storage cleanup of very old OrbitDB entries
-   Simple pin count limits for storage management
-   Memory usage limits for OrbitDB operations
-   Disk usage monitoring

**Note:** All cryptographic validation, identity verification, and business logic security is handled by clients. The node provides neutral infrastructure only.

This simplified architecture provides essential infrastructure services while maintaining the decentralized nature of the network by avoiding centralized business logic validation.
