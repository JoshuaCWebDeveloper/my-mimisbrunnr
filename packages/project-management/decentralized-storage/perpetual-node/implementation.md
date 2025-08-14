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

### Security Hardened IPFS API Proxy

**Purpose:** Provides Kubo-compatible façades with comprehensive security validation

**Configuration:**

-   **Image**: `openresty/openresty:alpine` (nginx + Lua scripting)
-   **Exposed Port**: 5001 (replaces direct kubo exposure)
-   **Config File**: `config/nginx.conf` with comprehensive Lua façades

**Security Façades:**

```lua
-- /api/v0/pin/add façade with validation pipeline
location = /api/v0/pin/add {
    -- 1. Rate limiting and quota enforcement
    -- 2. CID format validation
    -- 3. Root block prefetch (≤1MB)
    -- 4. DAG-JSON/CBOR validation
    -- 5. Schema validation via sidecar
    -- 6. Single-block pin (recursive=false)
}

-- /api/v0/dag/get façade with size limits
location = /api/v0/dag/get {
    -- 1. CID validation
    -- 2. Stream with 1MB cap
    -- 3. JSON decode validation
    -- 4. Schema validation
}

-- Pubsub façades for OrbitDB compatibility
location = /api/v0/pubsub/pub {
    -- Topic allowlist, JSON validation, 64KB limit
}
location = /api/v0/pubsub/sub {
    -- Topic allowlist, subscription limits
}
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
    - Periodic scan and traversal of log heads for comprehensive pinning
    - Maintain JSON index of pinned content for monitoring

3. **IPFS Infrastructure**
    - Coordinate with security façades for validated content pinning
    - Maintain IPFS node availability and peer connections
    - Export pinning metrics to Prometheus (optional)

### Validation Sidecar Service

**Purpose:** Provides AJV-based JSON schema validation for content security

**Core Responsibilities:**

1. **Schema Validation**

    - Validate `taglist/v1` schema for tag collections
    - Validate `pubsub/head/v1` schema for pubsub messages
    - Fast validation with clear error responses

2. **Integration**
    - HTTP service on port 3000
    - POST `/validate` endpoint with schema selection
    - Used by nginx Lua façades for real-time validation

## Key Service Components

### 1. OrbitDB Manager (`src/services/orbitdb-manager.ts`)

```typescript
import { DiscoveryRecord } from '@my-mimisbrunnr/shared-api';
import { validateDiscoveryRecord } from '@my-mimisbrunnr/shared-validation';
import { PROTOCOL } from '@my-mimisbrunnr/shared-crypto';

export class OrbitDBManager {
    private ipfs: IPFSHTTPClient;
    private orbitdb: OrbitDB;
    private discoveryLog: LogStore<DiscoveryRecord>;

    async initialize(): Promise<void>;
    async openDiscoveryLog(): Promise<void>;
    async handleReplication(address: string, hash: string): Promise<void>;
    getDiscoveryLog(): LogStore<DiscoveryRecord>;
}
```

**Key Operations:**

-   Connect to IPFS via HTTP API (`http://kubo:5001`)
-   Initialize OrbitDB with IPFS instance using shared constants
-   Open the shared discovery log database (`PROTOCOL.ORBITDB_LOG_NAME`)
-   Set up replication event handlers (basic validation using shared libraries)
-   Participate in pubsub network as a peer

### 2. Simple Replication Handler (`src/services/replication-handler.ts`)

```typescript
import {
    validateDiscoveryRecord,
    VALIDATION_LIMITS,
} from '@my-mimisbrunnr/shared-validation';

export class ReplicationHandler {
    async handleNewEntry(entry: LogEntry<DiscoveryRecord>): Promise<void>;
    async pinEntryContent(entryCid: string): Promise<void>;
    async cleanupOldEntries(): Promise<void>;
    private validateEntry(entry: DiscoveryRecord): boolean;
}
```

**Simple Operations:**

-   Listen for new OrbitDB entries via replication events
-   Basic format validation using shared validation utilities
-   Pin entry CIDs to local IPFS node (with size limits from shared constants)
-   Basic cleanup of very old entries (storage management only)
-   No complex business logic or cryptographic verification

### 3. Basic Rate Limiter (`src/services/rate-limiter.ts`)

```typescript
import {
    RateLimitConfig,
    checkRateLimit,
} from '@my-mimisbrunnr/shared-validation';

export class BasicRateLimiter {
    private config: RateLimitConfig;

    async checkIPFSAPILimit(clientIP: string): Promise<boolean>;
    async trackRequest(clientIP: string): Promise<void>;
    async cleanupOldRequests(): Promise<void>;
}
```

**Defensive Rate Limiting:**

-   Uses shared rate limiting utilities and configuration
-   Simple request counting per IP for IPFS API endpoints
-   Prevent DoS attacks on the node infrastructure using shared security policies
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
# Note: IPFS Gateway disabled for security

# OrbitDB Configuration
ORBITDB_LOG_NAME=xcom-taglist-discovery
ORBITDB_DATA_DIR=/app/data/orbitdb

# Service Configuration
PORT=3000
LOG_LEVEL=info
HEALTH_CHECK_INTERVAL=30000

# Security Configuration - Tunable Parameters
API_RPM=60                              # Requests per minute per IP
PIN_ADD_MAX_PER_IP_PER_DAY=2000        # Daily pin quota per IP
PIN_ADD_BURST=30                        # Pin request burst capacity
DAG_GET_BURST=60                        # DAG read burst capacity
PUBSUB_PUB_BURST=60                     # Pubsub publish burst
PUBSUB_SUB_BURST=60                     # Pubsub subscribe burst

# Operational Configuration
STORAGE_CLEANUP_INTERVAL=3600000
MAX_LOG_ENTRIES_PINNED=1000
IPNS_REPUBLISH_PERIOD=14400             # 4 hours (reduced from 12h default)

# Extension Configuration
EXT_ID=chrome-extension-id-here         # For CORS configuration
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
-   `express` - HTTP server for health checks
-   `winston` - Logging

### Shared Library Dependencies

**Note**: See `shared-libraries-planning.md` for comprehensive shared library architecture and specifications.

-   `@my-mimisbrunnr/shared-api` - Data structures, schemas, and TypeScript types
-   `@my-mimisbrunnr/shared-crypto` - Cryptographic utilities with protocol constants
-   `@my-mimisbrunnr/shared-validation` - Content validation, security utilities, and validation limits

### Docker Images Used

-   `ipfs/kubo@sha256:PINNED_DIGEST` - Official Kubo IPFS (never use :latest)
-   `openresty/openresty:alpine` - Nginx + Lua for security façades
-   `node:18-alpine` - Base image for custom OrbitDB service
-   `node:18-alpine` - Base image for validation sidecar service

**Security Note:** All images use pinned SHA256 digests, not floating tags

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

## Security Hardening

### Comprehensive API Protection

**Multi-Layer Validation Pipeline:**

-   **Rate Limiting**: Per-IP quotas with tunable burst capacity
-   **Content Size Enforcement**: Hard 1MB limit for all remote pinning
-   **Codec Restrictions**: DAG-JSON/DAG-CBOR only (no UnixFS/raw/dag-pb)
-   **Schema Validation**: AJV-based JSON schema enforcement
-   **Single-Block Pinning**: Forced `recursive=false` to prevent DAG traversal

**Kubo Configuration Hardening:**

-   **Gateway Disabled**: `Addresses.Gateway=""` removes HTTP gateway entirely
-   **No Auto-Discovery Pinning**: Node never auto-pins from pubsub/discovery
-   **P2P Proxy Disabled**: `Experimental.P2pHttpProxy=false`
-   **Repository Limits**: `Datastore.StorageMax` and `GCPeriod` configured
-   **IPNS Republish Tuning**: Reduced to 4h for fresher resolution

**API Surface Restriction:**

-   **Allowed**: `/api/v0/pin/add`, `/api/v0/dag/get`, `/api/v0/pubsub/*` (via façades)
-   **Blocked**: `/api/v0/add`, `/api/v0/block/*`, `/api/v0/object/*`, `/api/v0/files/*`
-   **CORS**: Extension origin only (`chrome-extension://<EXT_ID>`)

### Pubsub Security for OrbitDB

**Topic Allowlisting:**

-   Pattern: `^mimis/(taglist|discovery)/[a-z0-9\-]{1,64}$`
-   Message size limit: 64KB
-   JSON-only content validation
-   Schema validation via sidecar

**Subscription Management:**

-   Max 2 concurrent subscriptions per IP
-   Idle timeout: 2 minutes with 30s heartbeat
-   Rate limiting on pub/sub actions

### Operational Security

**Monitoring and Metrics:**

-   `pin_add_facade_attempts_total` - Total pin attempts
-   `pin_add_facade_rejected_bytes_total` - Rejected content size
-   `pin_add_facade_success_total` - Successful pins
-   Per-IP 413/415/429 error rate tracking
-   Kubo repo size and GC run monitoring

**Resource Protection:**

-   Kubernetes resource limits on containers
-   Inbound peer monitoring
-   OrbitDB spam filtering (size + rate limits)
-   IPNS keystore encryption on PVC

**Backup and Recovery:**

-   Periodic `ipfs repo backup` (daily)
-   Off-cluster encrypted storage (S3 compatible)
-   Pinning index maintenance for disaster recovery

### Client-Side Security Requirements

**Content Validation (Client Must Implement):**

-   Pubsub message schema validation against `pubsub/head/v1`
-   Monotonic timestamp checking per topic
-   Author DID binding and signature verification
-   No auto-pinning from discovery - explicit façade calls only

**IPNS Freshness Validation:**

-   Monotonic sequence number tracking
-   IPNS record expiry/EOL checking
-   Signature validation for all IPNS records

**Note:** The node provides secure infrastructure with comprehensive validation. Clients must implement additional semantic validation for full security.

## Implementation Files

### Security Façade Implementation

**Complete Nginx + Lua Implementation:** See example files:

-   [`config/nginx.conf`](./nginx.conf) - Complete OpenResty configuration
-   [`config/lua/pin_add_facade.lua`](./pin_add_facade.lua) - Pin/add façade with validation
-   [`config/lua/dag_get_facade.lua`](./dag_get_facade.lua) - DAG/get façade with size limits
-   [`config/lua/pubsub_facades.lua`](./pubsub_facades.lua) - Pubsub façades for OrbitDB

### Validation Sidecar Implementation

**AJV Validation Service:** See example files:

-   [`src/validator/index.ts`](./validator-index.ts) - Complete validation service
-   [`config/validator-schemas.json`](./validator-schemas.json) - JSON schema definitions

### Enhanced OrbitDB Manager

**Security-Enhanced Service:** See example files:

-   [`src/services/enhanced-orbitdb-manager.ts`](./enhanced-orbitdb-manager.ts) - Enhanced manager
-   [`src/services/pinning-index.ts`](./pinning-index.ts) - JSON pinning index maintenance

### Testing and Monitoring

**Security Test Suite:** See example files:

-   [`test/security/facade-tests.spec.ts`](./facade-tests.spec.ts) - Comprehensive security tests
-   [`config/monitoring/security-metrics.yaml`](./security-metrics.yaml) - Prometheus monitoring

This architecture provides comprehensive security hardening while maintaining the decentralized nature of the network through validated, but not centralized, infrastructure services.

---

## Implementation Tickets

### MM-18: Foundation - Shared Libraries Implementation & Testing

**Priority:** Critical (Required for all other tickets)

**Scope:** Implement and test the three shared libraries with comprehensive unit tests

**Components:**

-   `@my-mimisbrunnr/shared-protocol` - DiscoveryRecord interface
-   `@my-mimisbrunnr/shared-config` - Protocol constants, validation limits
-   `@my-mimisbrunnr/shared-validation` - Core validation functions

**Testing Requirements:**

-   Unit tests for all validation functions (95%+ coverage)
-   Type safety tests for interfaces
-   Configuration constant validation tests
-   Performance tests for validation functions
-   Mock data generation utilities for testing other components

**Deliverables:**

-   Functional shared libraries matching specification
-   Comprehensive test suites
-   Updated perpetual-node package.json dependencies
-   Documentation for library usage

**Estimated Effort:** 1 session

---

### MM-19: Core OrbitDB Service Implementation & Testing

**Priority:** High (Core functionality)

**Dependencies:** MM-18

**Scope:** Implement OrbitDB Manager service with IPFS integration and comprehensive testing

**Components:**

-   OrbitDB Manager service (`src/services/orbitdb-manager.ts`)
-   Replication Handler service (`src/services/replication-handler.ts`)
-   IPFS Client wrapper (`src/services/ipfs-client.ts`)
-   Health check endpoints (`src/utils/health-check.ts`)
-   Basic rate limiter (`src/services/rate-limiter.ts`)

**Testing Requirements:**

-   Unit tests for each service component
-   Integration tests with mock IPFS/OrbitDB
-   Health check endpoint functional tests
-   Rate limiter behavior tests
-   Error handling and recovery tests
-   Performance tests for replication handling

**Deliverables:**

-   Working OrbitDB service with IPFS integration
-   Comprehensive test suite
-   Health monitoring endpoints
-   Service startup/shutdown procedures

**Estimated Effort:** 1 session

---

### MM-20: Security Layer - Nginx Façades & Validation Sidecar

**Priority:** High (Security critical)

**Dependencies:** MM-19

**Scope:** Implement security proxy layer with Nginx + Lua façades and validation service

**Components:**

-   Nginx configuration with OpenResty (`config/nginx.conf`)
-   Lua security façades for IPFS API endpoints
-   AJV validation sidecar service (`src/validator/`)
-   Rate limiting and quota enforcement
-   Content validation pipeline

**Testing Requirements:**

-   Security façade unit tests (Lua testing framework)
-   Validation sidecar functional tests
-   Rate limiting behavior tests
-   Content size and format validation tests
-   Attack simulation tests (oversized content, malformed requests)
-   Performance tests under load

**Deliverables:**

-   Hardened IPFS API proxy
-   Validation service with schema enforcement
-   Security test suite
-   Attack mitigation verification

**Estimated Effort:** 1 session

---

### MM-21: Infrastructure & Docker Orchestration

**Priority:** Medium (Integration)

**Dependencies:** MM-20

**Scope:** Docker composition and service orchestration with functional testing

**Components:**

-   Docker Compose configuration
-   Kubo IPFS container setup and configuration
-   Service networking and communication
-   Environment variable management
-   Container health checks

**Testing Requirements:**

-   Container startup/shutdown tests
-   Service communication tests
-   Health check integration tests
-   Configuration validation tests
-   Resource limit enforcement tests
-   Service recovery tests (container restart scenarios)

**Deliverables:**

-   Complete Docker Compose setup
-   Service orchestration
-   Configuration management
-   Infrastructure test suite
-   Deployment documentation

**Estimated Effort:** 1 session

---

### MM-22: End-to-End Integration Testing (Optional)

**Priority:** Low (Comprehensive validation)

**Dependencies:** MM-21

**Scope:** Comprehensive end-to-end testing across all services

**Components:**

-   Full system integration tests
-   Client-to-node communication tests
-   OrbitDB replication testing across multiple nodes
-   Performance benchmarking
-   Security penetration testing
-   Disaster recovery testing

**Testing Requirements:**

-   Multi-node OrbitDB replication tests
-   Extension-to-node integration tests
-   Load testing and performance benchmarking
-   Security testing with real attack scenarios
-   Backup/restore procedure testing
-   Network partition recovery testing

**Deliverables:**

-   Comprehensive E2E test suite
-   Performance benchmarks
-   Security audit results
-   Operational runbooks

**Estimated Effort:** 1 session

---

## Ticket Dependencies

```
MM-18 (Foundation)
  ↓
MM-19 (Core OrbitDB)
  ↓
MM-20 (Security Layer)
  ↓
MM-21 (Infrastructure)
  ↓
MM-22 (E2E Testing - Optional)
```

**Recommended Implementation Order:**

1. **MM-18** - Essential foundation for all other components
2. **MM-19** - Core functionality must work before adding security
3. **MM-20** - Security layer after core functionality is proven
4. **MM-21** - Infrastructure orchestration after components work individually
5. **MM-22** - Comprehensive testing after full system exists
