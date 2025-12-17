# MM-30 Implementation: OrbitDB Discovery Integration

## Overview

This document describes the implementation of MM-30: OrbitDB Discovery Integration for the mimisbrunnr-ext browser extension.

**Status:** ✅ Complete

**Goal:** Enable handle-based discovery using OrbitDB log store with Last-Write-Wins (LWW) conflict resolution.

## What Was Implemented

### 1. Core Services

#### ExtensionOrbitDbManager (`src/entrypoints/background/discovery/orbitdb-service.ts`)

-   Initializes OrbitDB instance using existing Helia connection from MM-27
-   Opens 'xcom-taglist-discovery' log database with public write access
-   Enables pubsub replication via Kubo's libp2p connection
-   Provides database access and lifecycle management

**Key Features:**

-   Uses Helia's existing WebTransport connection to Kubo
-   Public write access (`write: ['*']`) for discovery log
-   Event listeners for replication monitoring
-   Clean shutdown with database closing

#### DiscoveryService (`src/entrypoints/background/discovery/discovery-service.ts`)

-   Manages discovery records with LWW conflict resolution
-   Generates lookup keys using SHA-256 of lowercase handles
-   Publishes discovery records to OrbitDB log
-   Queries records by handle with LWW selection logic
-   Validates handle format and normalizes handles

**Key Features:**

-   Last-Write-Wins (LWW) based on `updatedAt` timestamp
-   Automatic handle normalization (@ prefix, lowercase)
-   Intelligent conflict resolution for multiple records per handle
-   Non-fatal error handling (discovery failures don't break publish flow)

### 2. Data Structures

#### types.ts (`src/entrypoints/background/discovery/types.ts`)

-   `DiscoveryRecord` interface (imported from shared-protocol)
-   `generateLookupKey()` - SHA-256 hash generation
-   `isValidHandle()` - Handle format validation
-   `normalizeHandle()` - Consistent handle formatting

### 3. Integration Points

#### IpfsService Enhancement

-   Added `getHelia()` method to expose Helia instance for OrbitDB
-   Enables OrbitDB to use existing libp2p connection

#### TagService Integration

-   Added DiscoveryService dependency to constructor
-   Integrated discovery publishing into `publishUserManifest()` workflow
-   Step 4 of publish flow: automatically creates discovery record
-   Non-fatal error handling (discovery failures don't block manifest publish)

#### Background Script

-   Initializes OrbitDB after IPFS (uses Helia instance)
-   Initializes DiscoveryService with ExtensionOrbitDbManager
-   Passes DiscoveryService to TagService
-   Added message handlers for discovery operations

### 4. Message Types

Added three new message types to `messenger.ts`:

-   `PUBLISH_DISCOVERY` - Publish discovery record (placeholder for future direct calls)
-   `DISCOVER_BY_HANDLE` - Look up user by X.com handle
-   `GET_DISCOVERY_STATUS` - Check OrbitDB initialization status

### 5. UI Components

#### HandleLookup (`src/entrypoints/popup/app/components/discovery/handle-lookup.tsx`)

-   Search interface for discovering users by handle
-   Displays discovery results: handle, DID, IPNS key, last updated
-   Uses existing Button component and design system
-   Matches IpfsPublisher styling patterns
-   Error handling and loading states
-   **Integrated into main app** ([app.tsx:185](packages/mimisbrunnr-ext/src/entrypoints/popup/app/app.tsx#L185))

#### DiscoveryStatus (`src/entrypoints/popup/app/components/discovery/discovery-status.tsx`)

-   Real-time status display for OrbitDB connection
-   Shows online/offline status with color-coded indicator
-   Displays truncated OrbitDB ID
-   Auto-refreshes every 10 seconds
-   Compact inline status display
-   **Integrated into main app** ([app.tsx:186](packages/mimisbrunnr-ext/src/entrypoints/popup/app/app.tsx#L186))

### 6. Unit Tests

#### discovery-service.spec.ts

-   Tests for `publishDiscovery()` with handle normalization
-   Tests for `discoverByHandle()` with LWW logic
-   Tests for `updateDiscovery()` workflow
-   Tests for `getAllRecords()` retrieval
-   Edge cases: invalid handles, uninitialized service, empty results
-   LWW conflict resolution with multiple records

**Test Coverage:**

-   ✅ Handle normalization (@prefix, lowercase)
-   ✅ Lookup key generation (SHA-256)
-   ✅ Last-Write-Wins selection logic
-   ✅ Multiple records for same handle
-   ✅ Error handling for edge cases

## Architecture

### Connection Flow

```
Extension (Helia + OrbitDB)
    ├─ Connection #1: libp2p WebTransport → Kubo (for pubsub)
    │   └─ OrbitDB uses this for replication
    └─ Connection #2: HTTP API → validation-proxy:5001 → Kubo (for pinning)

Kubo acts as pubsub hub:
Extension OrbitDB ← pubsub → Kubo ← pubsub → orbitdb-service
```

### Publishing Flow

1. **User publishes manifest** (existing MM-27/MM-28/MM-29 flow)

    - Publish TagCollection to IPFS
    - Publish UserManifest to IPFS
    - Publish DID Document to IPFS
    - Publish to IPNS

2. **Automatic discovery record creation** (NEW in MM-30)
    - Generate lookup key (SHA-256 of `@handle`)
    - Create discovery record with handle, IPNS key, DID
    - Add to OrbitDB log
    - Replicate to orbitdb-service via Kubo pubsub

### Discovery Flow

1. **User searches for handle**
2. **Generate lookup key** (SHA-256 of normalized handle)
3. **Query OrbitDB log** for matching records
4. **Apply LWW** - select record with highest `updatedAt` timestamp
5. **Return result** with handle, IPNS key, DID, timestamp

## Testing Instructions

### Prerequisites

1. **Perpetual Node Running:**

    ```bash
    # Ensure Kubo, validation-proxy, and orbitdb-service are running
    docker ps | grep -E "kubo|validation|orbitdb"
    ```

2. **Extension Built:**
    ```bash
    cd packages/mimisbrunnr-ext
    npm run build
    ```

### Unit Tests

```bash
# Run discovery service tests
npm test -- discovery-service.spec.ts
```

### Manual End-to-End Test

#### Test Scenario 1: Publish and Discover

**Setup:**

1. Load extension in Chrome
2. Create identity with passphrase and handle (e.g., "@testuser")
3. Create some tags

**Test Steps:**

1. **Publish manifest:**

    - Click "Publish to IPFS" in extension popup
    - Wait for success message
    - Check console logs for "Discovery record published successfully"

2. **Verify OrbitDB status:**

    - Open discovery status component (if integrated into UI)
    - Should show "Discovery Service: Online"
    - Should show OrbitDB ID

3. **Discover own handle:**
    - Open handle lookup component
    - Enter your handle (e.g., "@testuser")
    - Click "Search"
    - Should find your record with IPNS key and DID
    - Timestamp should match recent publish

#### Test Scenario 2: Cross-Device Discovery

**Setup:**

-   Two browser profiles (Profile A and Profile B)
-   Each with extension installed

**Test Steps:**

1. **Profile A publishes:**

    - Create identity with handle "@alice"
    - Publish manifest
    - Note the handle and DID

2. **Profile B discovers:**

    - Wait 10-15 seconds for OrbitDB replication
    - Search for "@alice"
    - Should find the discovery record
    - IPNS key and DID should match Profile A

3. **Profile A updates:**

    - Modify tags and re-publish
    - Wait for replication

4. **Profile B re-discovers:**
    - Search for "@alice" again
    - Should see updated timestamp
    - IPNS key should remain same

#### Test Scenario 3: Last-Write-Wins

**Setup:**

-   Single profile, publish multiple times

**Test Steps:**

1. Publish manifest at T0
2. Wait 5 seconds
3. Modify tags and publish again at T1
4. Search for own handle
5. Should return T1 record (most recent)

### Expected Behavior

✅ **Success Indicators:**

-   Discovery records created automatically after manifest publish
-   OrbitDB shows as "Online" in status component
-   Handle lookups return correct IPNS/DID mappings
-   LWW selects most recent record when multiple exist
-   Replication works between extension and orbitdb-service

❌ **Known Limitations (To Be Addressed in Later Tickets):**

-   No pubsub message validation (MM-36)
-   No message de-duplication (MM-36)
-   No timestamp monotonicity checks (MM-35)
-   No signature verification (MM-35)
-   No rate limiting (MM-36)
-   No caching (MM-34)
-   No tweet verification (MM-31)

## File Structure

```
src/entrypoints/background/
├── discovery/
│   ├── types.ts                      # Discovery data structures
│   ├── orbitdb-service.ts            # OrbitDB instance management
│   ├── discovery-service.ts          # Discovery record operations
│   └── discovery-service.spec.ts     # Unit tests
├── ipfs/
│   └── ipfs-service.ts                # Added getHelia() method
├── tag/
│   └── tag-service.ts                 # Integrated discovery publishing
└── index.ts                           # Initialize OrbitDB and Discovery services

src/entrypoints/popup/app/components/
└── discovery/
    ├── handle-lookup.tsx              # User search interface
    ├── discovery-status.tsx           # Connection status display
    └── index.ts                       # Component exports

src/
└── messenger.ts                        # Added discovery message types
```

## Integration with Existing Features

### Manifest Publishing (MM-27, MM-28, MM-29)

-   Discovery record creation is **automatic** during manifest publish
-   Non-fatal errors ensure discovery failures don't break publishing
-   Uses same identity (handle, IPNS key, DID) from identity service

### Identity System (MM-28)

-   Reuses handle from identity service
-   Uses published IPNS key from DID document publishing
-   Uses DID from identity

### IPFS/IPNS (MM-27, MM-29)

-   OrbitDB uses existing Helia connection (no new connections needed)
-   Leverages libp2p WebTransport connection to Kubo
-   Discovery records stored in OrbitDB, not IPFS directly

## Dependencies

### Required Infrastructure

-   ✅ Kubo running with WebTransport enabled (MM-27)
-   ✅ validation-proxy routing traffic (MM-27)
-   ⚠️ **orbitdb-service must be running and connected to Kubo**

### Code Dependencies

-   ✅ `@orbitdb/core` (already in root package.json)
-   ✅ `@my-mimisbrunnr/shared-protocol` (for DiscoveryRecord interface)
-   ✅ Helia IPFS instance (from IpfsService, MM-27)
-   ✅ Identity service (for handle, DID, IPNS key, MM-28/MM-29)

## Success Criteria

All success criteria met:

### Functional

-   [x] OrbitDB successfully initializes using Helia connection
-   [x] Discovery records can be added to log
-   [x] Handles can be looked up and resolved to IPNS/DID
-   [x] LWW logic correctly handles multiple records per handle
-   [x] Discovery integrates into existing publish workflow

### Technical

-   [x] OrbitDB pubsub replication via Kubo working
-   [x] Discovery queries complete (no performance requirement yet for MM-30)
-   [x] UI provides clear feedback on discovery operations
-   [x] Unit tests pass (discovery service logic)

### Documentation

-   [x] TODO comments added for MM-31, MM-34, MM-35, MM-36 items
-   [x] Code comments explain OrbitDB architecture
-   [x] Implementation documented with testing instructions

## Known Issues and Limitations

### Requires orbitdb-service Running

The perpetual node's orbitdb-service must be running and connected to Kubo for replication to work. Without it:

-   Discovery records will still be created locally
-   But won't replicate to other users
-   Other users won't be able to discover your records

### No Error Recovery (MM-36)

-   No retry logic for failed OrbitDB operations
-   No exponential backoff for queries
-   No connection health monitoring

### No Validation (MM-35, MM-36)

-   Pubsub messages not validated against schemas
-   No signature verification on discovery records
-   No timestamp monotonicity enforcement
-   No content size limits

### No Caching (MM-34)

-   All queries scan full OrbitDB log
-   No IndexedDB caching of results
-   Performance degrades with large logs

## Next Steps (Future Tickets)

### MM-31: Tweet Verification System

-   Add tweet proof validation to discovery records
-   Verify users control their X.com handles

### MM-34: Caching and Performance

-   Implement IndexedDB caching for discovery results
-   Add cache pruning strategies
-   Optimize OrbitDB queries

### MM-35: Content Validation

-   Add timestamp monotonicity checks
-   Implement signature verification
-   Validate record structure and limits

### MM-36: Security Hardening

-   Add pubsub message validation
-   Implement retry logic with exponential backoff
-   Add rate limiting
-   Build telemetry and metrics

## Conclusion

MM-30 successfully implements OrbitDB-based discovery with LWW conflict resolution. The implementation:

-   ✅ Uses existing infrastructure (Helia, libp2p, Kubo)
-   ✅ Integrates seamlessly into publish workflow
-   ✅ Provides user-friendly UI components
-   ✅ Includes comprehensive unit tests
-   ✅ Documents all limitations and TODOs

The foundation is solid for building on in future tickets (MM-31, MM-34, MM-35, MM-36) to add validation, caching, security, and tweet verification.
