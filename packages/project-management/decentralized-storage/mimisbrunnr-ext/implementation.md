# Mimisbrunnr-Ext Implementation Proposal

## Overview

This document outlines the implementation plan for enhancing the existing `mimisbrunnr-ext` browser extension to support decentralized identity and tag collection management using IPFS, IPNS, and OrbitDB. The extension will maintain its current X.com tag management functionality while adding decentralized identity verification and tag collection publishing capabilities.

## Current Extension Architecture Analysis

The existing `mimisbrunnr-ext` package is a well-structured WXT-based browser extension with:

### Existing Components

-   **Background Script**: Handles tag repository operations and inter-script messaging
-   **Content Script**: Processes X.com DOM elements and applies tag styling
-   **Popup UI**: React-based tag management interface with styled-components
-   **Tag Repository**: Local storage-based tag persistence
-   **Messenger System**: Runtime message handling between extension contexts

### Current Data Flow

1. User manages tags via popup UI
2. Background script persists tags to local storage
3. Content script receives tag updates and applies visual indicators to X.com profiles
4. Mutation observer monitors DOM changes for dynamic content

## Decentralized Enhancement Architecture

The extension uses a feature-based service architecture where each service owns and manages its repository. This provides better encapsulation, clearer ownership boundaries, and more maintainable code organization.

### Core Architecture Principles

1. **Single Repository Ownership**: Each repository is owned and managed by exactly one service
2. **Service-to-Service Communication**: Services interact with each other through public APIs, never directly accessing other services' repositories
3. **Feature Organization**: Files are organized by feature/function rather than by technical layer
4. **Clear Boundaries**: Each service encapsulates its business logic and data access patterns

### Implementation Structure

The actual implementation uses a feature-based services architecture detailed in the [Feature-Based Service Architecture](#feature-based-service-architecture) section below.

**Key Components:**

-   **Message Types**: See [`message-types.ts`](./message-types.ts) - Extended message types for decentralized operations
-   **Data Structures**: See [`data-structures.ts`](./data-structures.ts) - Complete TypeScript interfaces
-   **Cryptographic Functions**: See [`crypto-functions.ts`](./crypto-functions.ts) - Cryptographic utilities and security parameters
-   **IndexedDB Schema**: See [`indexeddb-schema.ts`](./indexeddb-schema.ts) - Database schema and store configurations
-   **Feature Services**: Located in `services/` directory with feature-based organization

### Enhanced UI Components

#### 1. Identity Management Interface

```
src/entrypoints/popup/app/components/identity/
├── identity-setup.tsx      # Initial identity creation flow
├── identity-status.tsx     # Current identity status display
├── verification-flow.tsx   # Tweet verification process
└── passphrase-manager.tsx  # Secure passphrase input/management
```

#### 2. Publishing Controls

```
src/entrypoints/popup/app/components/publishing/
├── publish-settings.tsx    # Control tag collection visibility and publishing
├── publish-status.tsx      # Show publishing status and IPNS updates
└── perpetual-node-config.tsx # Configure perpetual node connection
```

#### 3. Discovery Interface

```
src/entrypoints/popup/app/components/discovery/
├── handle-lookup.tsx       # Search for other users' tag collections
└── verification-badges.tsx  # Display verification status indicators
```

#### 4. Subscription Management Interface

```
src/entrypoints/popup/app/components/subscriptions/
├── subscription-manager.tsx # Main subscription management interface
├── subscription-list.tsx    # List of current subscriptions
├── subscription-item.tsx    # Individual subscription with controls
├── subscribe-form.tsx       # Subscribe to new user form
├── subscription-feed.tsx    # Aggregated feed from all subscriptions
└── sync-status.tsx         # Show sync status for subscriptions
```

## Tweet Verification Workflows

The extension implements comprehensive verification workflows that are always required for identity validation. The extension can automatically open browser tabs to perform verification:

### 1. Self-Verification Workflow (Publishing Manifest)

When a user attempts to publish their own manifest:

1. **Check Verification Status**: Extension checks if current user is already verified
2. **Require Verification**: If not verified, verification is required before publishing
3. **Create Verification Tweet**: User creates a tweet containing their verification token
4. **Automatic Validation**:
    - Extension automatically opens new browser tab to the tweet URL
    - Extension extracts verification token from the loaded tweet content
    - Extension validates the token cryptographically
5. **Update Status**: Mark user as verified in local storage to prevent re-verification
6. **Proceed with Publishing**: Continue with manifest publishing process

### 2. Subscription Verification Workflow

When a user attempts to subscribe to another user:

1. **Check Existing Status**: Extension checks if target user is already verified locally
2. **Require Verification**: If not verified, verification is required before subscribing
3. **Automatic Validation**:
    - Extension automatically opens new browser tab to the target user's verification tweet URL
    - Extension extracts verification token from the loaded tweet content
    - Extension validates the token against the target user's DID
4. **Update User Record**: Mark target user as verified in local storage
5. **Complete Subscription**: Proceed with subscription process after successful verification
6. **Visual Indicators**: Show verification badges in subscription lists and feeds

### 3. Programmatic Validation Limitations

For automated processes (OrbitDB discovery, background sync):

-   **No Tweet Verification**: Extension cannot perform tweet proof validation in background processes
-   **Fallback Validation**: Use cryptographic signature validation and DID document validation only
-   **Active Context Required**: Tweet verification requires active user flow (publishing/subscribing)
-   **Trust Indicators**: Clearly distinguish between cryptographically valid and tweet-verified identities

### 4. Verification Status Management

-   **Local Storage**: Verification status stored in User records with timestamp
-   **Status Persistence**: Once verified, users don't need re-verification unless status is reset
-   **Expiration**: Optional verification status expiration for enhanced security
-   **Visual Distinction**: Clear UI indicators for different verification levels

## Implementation Epics

This implementation is organized into two major epics that build upon each other, allowing for incremental delivery of functionality.

### Epic 1: Personal Backup and Restore (MVP)

**Use Case**: A user can publish their tag database for backup purposes and restore it on a new machine by "subscribing" to their own published data.

**Core Functionality**: This epic implements the complete decentralized storage foundation but limits the user-facing functionality to personal backup/restore scenarios. All underlying systems (cryptography, IPFS, discovery, verification, data merging) are fully implemented.

#### Phase 1.1: Core Infrastructure

**Identity and Cryptography:**

-   Implement scrypt-based key derivation with parameters: N=2^15, r=8, p=1
-   Build Ed25519 keypair generation and DID creation
-   Create secure passphrase validation (minimum 16 characters)
-   Implement passphrase-based content encryption/decryption using separate salt
-   Implement IndexedDB storage for encrypted identity data

**IPFS Integration:**

-   Set up in-browser IPFS instance using `ipfs-core`
-   Implement basic content publishing and retrieval
-   Create connection to perpetual node for improved connectivity
-   Build basic block caching with IndexedDB

#### Phase 1.2: Publishing System

**Encrypted Manifest Publishing:**

-   Extend existing tag repository to support decentralized publishing
-   Implement UserManifest and TagCollection JSON structures with encryption
-   Create DID document generation with encrypted manifest references
-   Build IPNS publishing workflow for mutable updates
-   Implement single-passphrase workflow for key derivation and content encryption/decryption

**Discovery Infrastructure:**

-   Set up OrbitDB log store connection
-   Implement discovery record creation and validation
-   Build handle-to-DID lookup functionality
-   Create lookup key generation (SHA-256 of lowercase handle)

#### Phase 1.3: Verification and Security

**Tweet Verification System:**

-   Build tweet proof posting interface for users to create verification tweets
-   Implement automatic verification flow (opens separate browser tab)
-   Create verification token extraction from loaded tweet content
-   Build cryptographic signature verification for extracted tokens
-   Add verification status tracking to prevent re-verification

**Content Validation:**

-   Implement timestamp monotonicity checks
-   Build DID document validation
-   Create automatic proof verification pipeline for active user flows
-   Add malicious content detection
-   Implement fallback validation for background processes (OrbitDB) without tweet proofs

#### Phase 1.4: Data Restoration System

**Encrypted Data Restoration:**

-   Implement encrypted manifest detection and decryption using user's passphrase
-   Build tag collection retrieval and decryption system
-   Create intelligent data merging without overriding local changes
-   Implement conflict resolution for local vs. decentralized data
-   Add restoration status tracking and user feedback
-   Ensure single passphrase entry decrypts both identity keys and content

**Core Services Implementation:**

-   Complete feature-based service architecture
-   Implement all repositories (User, Tag, Subscription, Cache, Sync)
-   Build DecentralizedSyncService for coordination

#### Phase 1.5: Minimal UI for Backup/Restore

**Identity Management UI:**

-   Create identity setup flow in popup interface
-   Build verification status displays
-   Implement passphrase management interface

**Backup/Restore Controls:**

-   Add simple publish/backup button for tag collections
-   Create restore functionality (lookup own handle and sync)
-   Build basic status indicators for publish/restore operations
-   Add progress feedback during operations

### Epic 2: Full Publishing and Subscription Platform

**Use Case**: Users can discover, subscribe to, and share tag collections with other users, creating a decentralized social tagging network.

**Core Functionality**: This epic enables all social features by primarily adding UI functionality to the robust foundation built in Epic 1. Most core systems are already implemented.

#### Phase 2.1: Discovery and Social Features

**Discovery Interface:**

-   Extend existing tag management UI with discovery features
-   Add handle lookup and user search capabilities
-   Create verification badges for trusted identities
-   Build offline/online status indicators

**Public/Private Publishing Options:**

-   Add UI controls for choosing public vs private manifest publishing
-   Implement public manifest publishing (unencrypted, subscribable by others)
-   Maintain private manifest publishing from Epic 1 (encrypted, personal backup only)
-   Add logic to detect manifest encryption status during discovery

**Subscription Management:**

-   Enable subscription functionality for other users with public manifests
-   Build subscription list interface showing followed users
-   Create subscribe/unsubscribe controls with encryption status awareness
-   Implement subscription settings (sync on/off)
-   Add subscription feed aggregation view
-   Display sync status for each subscription
-   Show clear indicators when users have private (non-subscribable) manifests

#### Phase 2.2: Enhanced Social UI

**Enhanced Tag Manager:**

-   Extend existing TagManager to show both local and subscribed tags
-   Add owner attribution for subscribed tags
-   Implement filtering by tag owner (my tags vs. subscribed)
-   Create visual indicators for decentralized vs. local-only tags

**Social Integration:**

-   Integrate subscription actions into discovery flow
-   Add social sharing controls for tag collections
-   Create user profile displays with verification status

#### Phase 2.3: Advanced Features

**Performance and Caching:**

-   Implement comprehensive IndexedDB caching strategy
-   Build offline-first data access patterns
-   Create cache pruning and management
-   Add performance monitoring and optimization

**Content Script Enhancement:**

-   Extend X.com content processing to show decentralized verification status
-   Add visual indicators for verified decentralized identities
-   Create subscription-based tag display for followed users
-   Show tags from subscribed users on their X.com profiles
-   Implement quick subscribe/unsubscribe actions from profile pages
-   Add verification badges for decentralized identities
-   Implement rate limiting and performance safeguards

### Epic Dependencies

**Dependencies to Add (Epic 1):**

```json
{
    "dependencies": {
        "ipfs-core": "^0.18.1",
        "orbit-db": "^0.29.1",
        "scrypt-js": "^3.0.1",
        "@noble/hashes": "^1.3.1",
        "@noble/ed25519": "^1.7.1",
        "tweetnacl": "^1.0.3",
        "@my-mimisbrunnr/shared-protocol": "workspace:*",
        "@my-mimisbrunnr/shared-config": "workspace:*",
        "@my-mimisbrunnr/shared-validation": "workspace:*"
    }
}
```

**Key Epic Benefits:**

-   **Epic 1** delivers complete technical foundation with immediate personal value (backup/restore)
-   **Epic 2** leverages existing infrastructure to add social features with minimal technical risk
-   **Incremental Delivery** allows for user feedback and iteration between epics
-   **Risk Mitigation** validates core systems with simpler use case before adding complexity

**Note**: The extension architecture supports both epics without modification - Epic 1 implements all core systems that Epic 2 simply exposes through enhanced UI functionality.

## Decentralized Publishing Architecture

### IPFS/IPNS Data Flow with Encryption

The extension publishes data using a layered architecture that follows W3C DID Core standards, with optional encryption for private manifests:

#### Epic 1: Encrypted Personal Backup Flow

```typescript
// 1. IPNS Record (Mutable, identity-based addressing)
IPNS: "k51qzi5uqu5d..." → "/ipfs/QmDidDocument123..."

// 2. DID Document (Published to IPFS, always unencrypted, referenced by IPNS)
DIDDocument {
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:key:z6Mk...",
    "verificationMethod": [...],
    "service": [
        {
            "id": "#manifest",
            "type": "UserManifest",
            "serviceEndpoint": "ipfs://QmEncryptedManifest456..."  // Points to encrypted manifest
        },
        {
            "id": "#x-proof",
            "type": "XHandleProof",
            "serviceEndpoint": "https://x.com/alice/status/123..."
        }
    ]
}

// 3. Encrypted Manifest Wrapper (Published to IPFS, referenced by DID Document)
EncryptedManifest {
    version: 1,
    encrypted: true,
    nonce: "base64-encoded-nonce",
    data: "base64-encoded-encrypted-UserManifest-JSON",
    createdAt: 1737152100000,
    publicKey: "ed25519-public-key"  // For verification
}

// 4. Decrypted UserManifest (Only accessible with correct passphrase)
UserManifest {
    version: 1,
    handle: "@alice",
    createdAt: 1737152100000,
    updatedAt: 1737152200000,
    collections: {
        tags: "ipfs://QmTagCollection789..."
    }
}

// 5. TagCollection (Also encrypted, referenced by decrypted UserManifest)
// Contains the actual tag data, also encrypted with same passphrase
```

#### Epic 2: Public vs Private Publishing Options

```typescript
// Option A: Public Manifest (Unencrypted, subscribable)
DIDDocument {
    "service": [
        {
            "id": "#manifest",
            "type": "UserManifest",
            "serviceEndpoint": "ipfs://QmPublicManifest123..."  // Direct to UserManifest
        }
    ]
}

// Option B: Private Manifest (Encrypted, not subscribable by others)
DIDDocument {
    "service": [
        {
            "id": "#manifest",
            "type": "UserManifest",
            "serviceEndpoint": "ipfs://QmEncryptedManifest456..."  // Points to EncryptedManifest
        }
    ]
}
```

### Publishing Flow

See: [`publishing-flow.ts`](./publishing-flow.ts) - Tag collection publishing workflow implementation

### Resolution Flow

See: [`resolution-flow.ts`](./resolution-flow.ts) - User tag resolution and discovery workflow

**Key Architecture Benefits:**

-   **IPNS provides stable, mutable addressing** for user identities
-   **DID Document serves as canonical identity document** with multiple service endpoints (always unencrypted)
-   **Content updates don't require IPNS republishing** - only DID Document updates
-   **Single passphrase workflow** - one passphrase derives both identity keys and content encryption keys
-   **Flexible privacy model** - Epic 1 uses encrypted manifests, Epic 2 adds public option
-   **Subscription compatibility** - encrypted manifests appear as "no manifest" to other users
-   **Extensible for future services** beyond tag collections
-   **W3C DID Core compliant** for interoperability

## Data Structure Integration

### Extended Tag Repository Schema

See: [`data-structures.ts`](./data-structures.ts) - Complete TypeScript interfaces for all extension data structures

### Extension-Specific IndexedDB Schema

See: [`indexeddb-schema.ts`](./indexeddb-schema.ts) - IndexedDB database schema and store configurations

### Extension-Specific Cryptographic Functions

See: [`crypto-functions.ts`](./crypto-functions.ts) - Cryptographic utilities and security parameters

**Note**: The extension now contains all complex data structures, cryptographic operations, and business logic that were previously planned for shared libraries. Only the minimal `DiscoveryRecord` interface and basic protocol constants are shared with the perpetual node.

## Feature-Based Service Architecture

The extension now uses a feature-based architecture where each service owns and manages its repository. This provides better encapsulation, clearer ownership boundaries, and more maintainable code organization.

### Architecture Principles

1. **Single Repository Ownership**: Each repository is owned and managed by exactly one service
2. **Service-to-Service Communication**: Services interact with each other through public APIs, never directly accessing other services' repositories
3. **Feature Organization**: Files are organized by feature/function rather than by technical layer
4. **Clear Boundaries**: Each service encapsulates its business logic and data access patterns

### Service Structure

```
services/
├── base-repository.ts           # Shared base repository implementation
├── user/                        # User management feature
│   ├── user-repository.ts       # UserRepository (owned by UserService)
│   ├── user-service.ts          # UserService (public API)
│   └── index.ts                 # Feature exports
├── tag/                         # Tag management feature
│   ├── tag-repository.ts        # TagRepository (owned by TagService)
│   ├── tag-service.ts           # TagService (public API)
│   └── index.ts                 # Feature exports
├── subscription/                # Subscription management feature
│   ├── subscription-repository.ts # SubscriptionRepository (owned by SubscriptionService)
│   ├── subscription-service.ts  # SubscriptionService (public API)
│   └── index.ts                 # Feature exports
├── cache/                       # Cache management feature
│   ├── cache-repositories.ts    # All cache repositories (owned by CacheService)
│   ├── cache-service.ts         # CacheService (public API)
│   └── index.ts                 # Feature exports
├── sync/                        # Sync state management feature
│   ├── sync-repository.ts       # SyncStateRepository (owned by SyncService)
│   ├── sync-service.ts          # SyncService (public API)
│   └── index.ts                 # Feature exports
├── decentralized-sync/          # Cross-service coordination
│   ├── decentralized-sync-service.ts # Coordinates between services
│   └── index.ts                 # Feature exports
└── index.ts                     # Main service exports
```

### Core Services

#### UserService

-   **Owns**: `UserRepository`
-   **Responsibilities**: User creation, identity management, tweet verification status tracking
-   **Public API**: User CRUD operations, current user management, verification status management
-   **Verification**: Tracks tweet verification results, prevents re-verification

#### TagService

-   **Owns**: `TagRepository`
-   **Responsibilities**: Tag management, sync status tracking, search
-   **Public API**: Tag CRUD operations, sync state management, filtering

#### SubscriptionService

-   **Owns**: `SubscriptionRepository`
-   **Responsibilities**: Subscription management, sync preferences
-   **Public API**: Subscribe/unsubscribe, sync settings, active subscriptions

#### CacheService

-   **Owns**: All cache repositories (`CachedManifest`, `CachedTagCollection`, etc.)
-   **Responsibilities**: Caching IPFS content, cache lifecycle management
-   **Public API**: Store/retrieve cached content, cache cleanup

#### SyncService

-   **Owns**: `SyncStateRepository`
-   **Responsibilities**: Sync operation tracking, retry logic, conflict resolution
-   **Public API**: Queue sync operations, track sync status, retry management

#### DecentralizedSyncService

-   **Owns**: No repositories (coordinates between services)
-   **Responsibilities**: Cross-service workflows, IPFS publishing, content resolution
-   **Dependencies**: All other services for orchestration

### Service Communication Examples

```typescript
// ❌ BAD: Direct repository access from another service
class TagService {
    async getTagsForUser(userId: string) {
        // Don't access UserRepository directly
        const user = await this.userRepo.getById(userId);
    }
}

// ✅ GOOD: Service-to-service communication
class TagService {
    constructor(private userService: UserService) {}

    async getTagsForUser(userId: string) {
        // Use UserService public API
        const user = await this.userService.getUserById(userId);
    }
}
```

### Background Script Integration

The background script initializes all services and coordinates message handling:

See: [`background-script.ts`](./background-script.ts) - Enhanced background script with feature-based services

**Key Changes:**

-   Services are initialized independently, each managing their own repository
-   Message handlers use service public APIs instead of direct repository access
-   DecentralizedSyncService coordinates complex cross-service workflows

### Migration from Previous Architecture

The previous architecture had separate repository and service layers, leading to unclear ownership and potential data consistency issues. The new architecture provides:

**Benefits:**

-   **Clear Ownership**: Each repository has exactly one owner service
-   **Better Encapsulation**: Repository implementation details are hidden from other services
-   **Simplified Testing**: Each service can be tested independently with its repository
-   **Reduced Coupling**: Services depend on interfaces, not implementations
-   **Feature Organization**: Related code is co-located by function rather than technical layer

**File Migration:**

-   `repository-layer.ts` → Now deprecated, exports from `services/` directory
-   `service-layer.ts` → Now deprecated, exports from `services/` directory
-   Actual implementations moved to feature directories:
    -   `services/user/` - User management
    -   `services/tag/` - Tag management
    -   `services/subscription/` - Subscription management
    -   `services/cache/` - Cache management
    -   `services/sync/` - Sync state management
    -   `services/decentralized-sync/` - Cross-service coordination

## Integration with Existing System

### 1. Background Script Enhancement (`src/entrypoints/background/index.ts`)

The existing background script will be extended to orchestrate decentralized services:

See: [`background-script.ts`](./background-script.ts) - Enhanced background script with feature-based services

**Key Integration Points:**

-   Use feature-based services with clear ownership boundaries
-   Services communicate through public APIs, not direct repository access
-   DecentralizedSyncService coordinates complex cross-service workflows
-   Add new message types while maintaining existing ones
-   Initialize decentralized services on background script startup
-   Manage IPFS/OrbitDB connections lifecycle

### 2. Content Script Extensions (`src/entrypoints/content/`)

Content scripts remain lightweight, requesting decentralized data via messaging:

See: [`content-script.ts`](./content-script.ts) - Enhanced content script with decentralized verification

**Key Integration Points:**

-   Extend existing DOM processing with decentralized verification display
-   Request decentralized data via existing messenger system
-   Add visual indicators while maintaining existing tag styling
-   No direct IPFS/OrbitDB operations in content script

### 3. Popup UI Evolution (`src/entrypoints/popup/app/`)

Popup UI extends existing components with new decentralized features:

See: [`popup-ui.tsx`](./popup-ui.tsx) - Enhanced popup app structure with decentralized features

**Key Integration Points:**

-   Add new tabs while preserving existing tag management interface
-   Enhance existing `TagManager` with publishing controls
-   Communicate with background services via existing messenger context
-   Maintain existing styling and UX patterns

## Security Considerations

### 1. Key Management and Encryption

-   Store encrypted private keys in IndexedDB
-   Implement secure passphrase-based key derivation with separate salts for identity and content encryption
-   Single passphrase workflow: derive both identity keys and content encryption keys
-   Never expose private keys or passphrases to content scripts
-   Use secure message passing between extension contexts
-   Encrypt all published manifests and collections in Epic 1 (personal backup)
-   Support both encrypted (private) and unencrypted (public) manifests in Epic 2

### 2. Content Validation

-   Validate all incoming decentralized content
-   Implement timestamp monotonicity checks
-   Verify cryptographic signatures on all operations
-   Sanitize and validate JSON structures
-   **Tweet Verification Limitations**: Programmatic validation cannot include tweet proof verification
-   **Automatic Verification**: Tweet validation performed automatically when extension opens verification tabs
-   **Fallback Security**: Use cryptographic validation for programmatic contexts (OrbitDB, background sync)

### 3. Network Security

-   Use HTTPS for all external API calls
-   Implement rate limiting on all network operations
-   Validate perpetual node certificates
-   Use content addressing for tamper detection

## Deployment and Migration Strategy

### 1. Backward Compatibility

-   Maintain full compatibility with existing local tag storage
-   Allow gradual migration to decentralized features
-   Preserve existing user preferences and configurations
-   Maintain existing extension API surface

### 2. Feature Rollout

-   Deploy decentralized features as opt-in initially
-   Provide clear migration paths for existing users
-   Create comprehensive documentation and tutorials
-   Implement feature flags for controlled rollout

### 3. Performance Monitoring

-   Monitor IPFS operation performance impact
-   Track IndexedDB storage usage growth
-   Measure network bandwidth consumption
-   Monitor extension startup time impacts

## Success Metrics

### 1. Technical Metrics

-   IPFS content publishing success rate > 95%
-   Discovery record lookup latency < 2 seconds
-   Extension startup time increase < 500ms
-   Local cache hit rate > 80% for repeated lookups

### 2. User Experience Metrics

-   User-initiated tweet verification completion rate > 70%
-   Tag list publishing adoption rate > 40%
-   Handle discovery usage growth > 20% monthly
-   User retention maintenance with existing functionality
-   Subscription verification adoption rate > 30% (when subscribing to new users)

### 3. Security Metrics

-   Zero private key exposures or leaks
-   Malicious content detection rate > 99%
-   Identity verification fraud detection accuracy > 95%
-   Network request failure graceful handling 100%

## Technical Dependencies and Considerations

### 1. Browser Compatibility

-   Chrome/Chromium-based browsers (primary)
-   Firefox support with WebExtension manifest v2/v3 compatibility
-   Handle IPFS networking limitations in different browsers
-   Manage service worker limitations in manifest v3

### 2. Performance Considerations

-   IPFS node initialization and connection time
-   OrbitDB replication and sync performance
-   IndexedDB storage and retrieval performance
-   Content script DOM processing impact

### 3. Network Resilience

-   Graceful degradation when IPFS/OrbitDB unavailable
-   Offline-first design with local fallbacks
-   Retry mechanisms with exponential backoff
-   Clear user feedback on network status

## Updated Architecture Summary

### Shared Library Migration

This implementation has been updated to reflect the revised minimal shared library architecture:

**What's Shared (Minimal):**

-   `@my-mimisbrunnr/shared-protocol`: Only `DiscoveryRecord` interface
-   `@my-mimisbrunnr/shared-config`: Protocol constants and validation limits
-   `@my-mimisbrunnr/shared-validation`: Basic OrbitDB validation and handle validation

**What's Now Extension-Only:**

-   **All data structures**: `UserManifest`, `TagCollection`, `SubscriptionCollection`, `User`, `Tag`, `Subscription`
-   **All IndexedDB schemas**: Store configurations, cache interfaces, sync states
-   **All cryptographic operations**: Key derivation, DID generation, signatures, validation
-   **All business logic**: Complex validation, timestamp checking, content sanitization

### Repository Layer Benefits

-   **Single Responsibility**: Each repository manages exactly one IndexedDB store
-   **Clear API**: Consistent interface across all repositories with common CRUD operations
-   **Type Safety**: Full TypeScript support with proper generic constraints
-   **Index Optimization**: Leverages IndexedDB indexes for efficient queries
-   **Easy Testing**: Each repository can be tested independently
-   **Future-Proof**: Easy to add new stores or modify existing ones

### Service Layer Benefits

-   **Coordination Logic**: Services orchestrate between multiple repositories
-   **Business Logic**: Complex operations that span multiple stores
-   **Clear Naming**: `DecentralizedSyncService` clearly indicates its purpose
-   **Dependency Injection**: Services receive repositories, making them testable
-   **Separation of Concerns**: Data access vs. business logic clearly separated

### Overall Architecture Benefits

-   **Reduced Complexity**: Clear separation between neutral infrastructure and business logic
-   **Better Maintainability**: Extension changes don't affect perpetual node
-   **Enhanced Security**: All sensitive operations isolated to client
-   **Simplified Dependencies**: Each package only includes what it actually uses
-   **Clean Architecture**: Repository pattern enables clean, testable code structure

### Implementation Impact

-   **Extension package** includes all cryptographic dependencies directly
-   **Perpetual node** uses only minimal shared interfaces for interoperability
-   **Development workflow** simplified with fewer cross-package dependencies
-   **Testing strategy** more focused with clear component boundaries
-   **Repository pattern** provides clean separation between data access and business logic
-   **Service layer** handles coordination and complex business operations

This implementation proposal provides a comprehensive roadmap for enhancing the mimisbrunnr-ext package with decentralized capabilities while maintaining its existing functionality and user experience, using a feature-based service architecture with clear ownership boundaries and minimal shared dependencies.
