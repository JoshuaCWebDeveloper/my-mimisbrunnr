# Shared Libraries Planning (Revised)

## Overview

After analysis of actual cross-package usage, this document outlines the **minimal** shared libraries used by both the `mimisbrunnr-ext` browser extension and the `perpetual-node` infrastructure service. Most data structures and business logic are extension-specific and remain in the extension package. Only essential protocol-level interfaces needed for OrbitDB interoperability are shared.

## Key Finding: Most Components are Extension-Only

The perpetual node provides neutral infrastructure and only needs:

-   Basic OrbitDB record validation
-   Protocol constants (log names, timeouts)
-   Simple rate limiting and content filtering

The extension handles all business logic, cryptography, and complex data structures locally.

## Revised Shared Library Packages

### Package: `shared/protocol` (Minimal Protocol Interface)

**Location**: `packages/shared/protocol/`

**Purpose**: Provides only the essential OrbitDB record interface for cross-package communication.

#### Core Protocol Interface

```typescript
// OrbitDB Discovery Record (Only shared type - used by both packages)
interface DiscoveryRecord {
    lookupKey: string; // SHA-256 of lowercase handle
    handle: string; // Original X.com handle
    ipnsKey: string; // IPNS key for mutable content
    did: string; // DID identifier
    createdAt: number; // Unix timestamp when first created
    updatedAt: number; // Unix timestamp when last modified
    sig?: string; // Optional entry-level signature
}
```

**Usage:**

-   **Extension**: Creates and publishes these records to OrbitDB
-   **Perpetual Node**: Validates format and pins the records for availability

---

### Package: `shared/config` (Protocol Constants)

**Location**: `packages/shared/config/`

**Purpose**: Provides protocol constants and configuration used by both packages for interoperability.

#### Protocol Constants

```typescript
// Protocol configuration (used by both packages)
export const PROTOCOL = {
    VERSION: 1,
    ORBITDB_LOG_NAME: 'xcom-taglist-discovery',
    IPFS_TIMEOUT: 30000, // 30 seconds
    ORBITDB_TIMEOUT: 45000, // 45 seconds
} as const;

// Validation limits (used by both packages)
export const VALIDATION_LIMITS = {
    MAX_DISCOVERY_RECORD_SIZE: 1024, // 1KB max per OrbitDB record
    MAX_CONTENT_SIZE: 1048576, // 1MB max for IPFS content
    MAX_RATE_LIMIT_REQUESTS: 100, // Rate limiting default
} as const;

// Rate limiting configuration interface
export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests?: boolean;
}
```

**Usage:**

-   **Extension**: Uses for OrbitDB connection, content validation, IPFS operations
-   **Perpetual Node**: Uses for OrbitDB setup, rate limiting, content size validation

---

### Package: `shared/validation` (Minimal Validation)

**Location**: `packages/shared/validation/`

**Purpose**: Provides only the minimal validation functions needed by both packages.

#### Core Validation Functions

```typescript
// OrbitDB record validation (used by both packages)
export function validateDiscoveryRecord(
    record: unknown
): record is DiscoveryRecord {
    if (!record || typeof record !== 'object') return false;
    const r = record as DiscoveryRecord;

    return (
        typeof r.lookupKey === 'string' &&
        r.lookupKey.match(/^[a-f0-9]{64}$/) &&
        typeof r.handle === 'string' &&
        r.handle.match(/^@[a-zA-Z0-9_]{1,15}$/) &&
        typeof r.ipnsKey === 'string' &&
        typeof r.did === 'string' &&
        typeof r.createdAt === 'number' &&
        typeof r.updatedAt === 'number'
    );
}

// Rate limiting (used by perpetual node)
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): boolean {
    // Implementation for request rate tracking
    return true; // Simplified for example
}

// Basic content filtering (used by perpetual node)
export function detectBinaryContent(content: Uint8Array): boolean {
    // Detect null bytes and high non-printable character ratio
    const nullBytes = content.indexOf(0) !== -1;
    if (nullBytes) return true;

    let nonPrintable = 0;
    const sampleSize = Math.min(content.length, 1024);
    for (let i = 0; i < sampleSize; i++) {
        const byte = content[i];
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintable++;
        }
    }
    return nonPrintable / sampleSize > 0.05;
}

// Handle validation (used by both packages)
export function validateHandle(handle: string): boolean {
    return /^@[a-zA-Z0-9_]{1,15}$/.test(handle);
}
```

**Usage:**

-   **Extension**: Uses for OrbitDB record creation and basic validation
-   **Perpetual Node**: Uses for incoming record validation and content filtering

---

## Extension-Only Components (Moved to Extension Package)

The following components should **NOT** be in shared libraries as they're only used by the extension:

### Complex Data Structures (Extension-Only)

-   `UserManifest`, `TagCollection`, `SubscriptionCollection`
-   `User`, `Tag`, `Subscription` models
-   `DIDDocument` and related W3C structures
-   `UserIdentity` with cryptographic fields

### IndexedDB and Storage (Extension-Only)

-   All IndexedDB store configurations and schemas
-   Cache interfaces (`CachedManifest`, `CachedTagCollection`, etc.)
-   `SyncState`, `IPFSBlock` storage models
-   Query patterns and store relationships

### Cryptographic Operations (Extension-Only)

-   Key derivation (scrypt), Ed25519 keypair generation
-   DID generation and management
-   IPNS key operations
-   All signature operations
-   Encoding/decoding utilities

### Complex Validation (Extension-Only)

-   Business logic validation for complex structures
-   Cryptographic validation beyond basic format
-   Timestamp monotonicity and advanced validation
-   Content sanitization beyond binary detection

---

## Benefits of Minimal Shared Libraries

### Reduced Complexity

-   Clear separation of concerns between infrastructure and business logic
-   Perpetual node remains simple and neutral
-   Extension handles all complex operations locally

### Better Maintainability

-   Fewer cross-package dependencies to maintain
-   Changes to extension business logic don't affect node
-   Simpler testing and deployment

### Security

-   Reduced attack surface on perpetual node
-   All cryptographic operations isolated to client
-   Protocol-level validation only where needed

## Implementation Strategy

### Phase 1: Create Minimal Shared Libraries

1. **`shared/protocol`** - Only `DiscoveryRecord` interface
2. **`shared/config`** - Extract protocol constants from crypto library
3. **`shared/validation`** - Only basic OrbitDB and content validation

### Phase 2: Move Extension-Specific Components

1. Move all IndexedDB schemas to extension package
2. Move all cryptographic operations to extension package
3. Move all complex data structures to extension package
4. Update import statements in both packages

### Phase 3: Clean Up Dependencies

1. Remove unused shared library dependencies from perpetual node
2. Simplify perpetual node package.json
3. Update extension to import from correct locations

This minimal approach ensures both packages only depend on what they actually use, reducing complexity and improving maintainability.
