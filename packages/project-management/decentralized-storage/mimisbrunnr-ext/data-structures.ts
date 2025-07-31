// Extension-specific data structures (moved from shared libraries)

// Import minimal shared protocol interface
import { DiscoveryRecord } from '@my-mimisbrunnr/shared-protocol';
import { PROTOCOL, VALIDATION_LIMITS } from '@my-mimisbrunnr/shared-config';
import {
    validateDiscoveryRecord,
    validateHandle,
} from '@my-mimisbrunnr/shared-validation';

// Enhanced local tag structure with decentralized features
interface Tag {
    id: string;
    username: string;
    label: string; // Renamed from 'category' to 'label'
    color: string;
    description?: string;
    owner: string; // References User.id (replaces ownerId)
    syncStatus: 'pending' | 'synced' | 'conflict'; // Sync state tracking
    createdAt: number; // Standardized timestamp field
    updatedAt: number; // Standardized timestamp field
    lastSyncedAt?: number; // Last successful sync timestamp
}

interface UserManifest {
    version: 1;
    handle: string; // X.com handle (e.g., "@alice")
    collections: {
        tags: string; // IPFS CID pointing to TagCollection
        subscriptions: string; // IPFS CID pointing to SubscriptionCollection
    };
    createdAt: number;
    updatedAt: number;
    signature?: string;
}

interface TagCollection {
    version: 1;
    handle: string;
    tags: Tag[]; // Full Tag objects with all metadata
    createdAt: number;
    updatedAt: number;
    signature?: string;
}

interface SubscriptionCollection {
    version: 1;
    handle: string;
    subscriptions: PublicSubscription[];
    createdAt: number;
    updatedAt: number;
    signature?: string;
}

interface PublicSubscription {
    handle: string;
    did: string;
    displayName?: string;
    createdAt: number;
}

interface User {
    id: string; // UUID for local identification
    did: string; // DID identifier (unique)
    handle: string; // X.com handle (e.g., "@alice")
    displayName?: string; // Optional display name
    avatarUrl?: string; // Optional avatar URL
    ipnsKey: string; // IPNS key for content resolution
    verified: boolean; // Whether their identity is verified
    proofUrl?: string; // Twitter proof URL
    isMe: boolean; // true if this is the current user
    createdAt: number; // When first discovered/created
    updatedAt: number; // Last update to user info
}

interface Subscription {
    id: string; // UUID for local identification
    userId: string; // References User.id (who I'm following)
    isActive: boolean; // Whether subscription is active
    syncEnabled: boolean; // Whether to sync their tags
    lastFetchedAt?: number; // Last time we fetched their content
    createdAt: number; // When I subscribed
    updatedAt: number; // Last update to subscription
}

interface UserIdentity {
    did: string;
    handle: string;
    publicKey: string; // Ed25519 public key (multibase encoded)
    secretKey?: string; // Ed25519 private key (encrypted)
    ipnsKey: string;
    verified: boolean;
    proofUrl?: string; // Twitter proof URL
    createdAt: number;
    updatedAt: number;
}

interface DecentralizedConfig {
    perpetualNode: {
        apiUrl: string;
        gatewayUrl: string;
        enabled: boolean;
    };
    orbitdb: {
        logName: string;
        enabled: boolean;
    };
    identity: {
        handle?: string;
        did?: string;
        verified: boolean;
    };
    publishing: {
        enabled: boolean;
        autoPublish: boolean;
    };
    discovery: {
        enableLookup: boolean;
        cacheExpiry: number;
    };
}

// Extension-specific configuration extensions
interface ExtensionConfig extends DecentralizedConfig {
    extension: {
        autoSync: boolean;
        showVerificationBadges: boolean;
        enableContentScriptIntegration: boolean;
    };
    ui: {
        defaultTab: 'tags' | 'identity' | 'discovery';
        compactMode: boolean;
        theme: 'light' | 'dark' | 'auto';
    };
}

// Cache interfaces for local storage
interface CachedManifest {
    id: string;
    userId: string;
    handle: string;
    ipfsHash: string;
    manifestData: UserManifest;
    isValid: boolean;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
}

interface CachedTagCollection {
    id: string;
    userId: string;
    handle: string;
    ipfsHash: string;
    tagCollectionData: TagCollection;
    isValid: boolean;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
}

interface CachedSubscriptionCollection {
    id: string;
    userId: string;
    handle: string;
    ipfsHash: string;
    subscriptionCollectionData: SubscriptionCollection;
    isValid: boolean;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
}

interface CachedIdentity {
    id: string;
    did: string;
    handle: string;
    didDocument: DIDDocument;
    publicKey: string;
    verified: boolean;
    proofUrl?: string;
    ipnsKey: string;
    lastVerifiedAt?: number;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
}

interface SyncState {
    id: string;
    entityType: 'tags' | 'subscription' | 'identity';
    entityId: string;
    operation: 'create' | 'update' | 'delete';
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'conflict';
    localVersion: number;
    remoteVersion?: number;
    conflictData?: any;
    errorMessage?: string;
    retryCount: number;
    nextRetryAt?: number;
    createdAt: number;
    updatedAt: number;
}

interface IPFSBlock {
    cid: string;
    data: Uint8Array;
    size: number;
    pinned: boolean;
    lastAccessedAt: number;
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
}

interface DIDDocument {
    '@context': string[];
    id: string;
    verificationMethod: VerificationMethod[];
    assertionMethod: string[];
    service: ServiceEndpoint[];
}

interface VerificationMethod {
    id: string;
    type: 'Ed25519VerificationKey2018';
    controller: string;
    publicKeyMultibase: string;
}

interface ServiceEndpoint {
    id: string;
    type: 'UserManifest' | 'XHandleProof';
    serviceEndpoint: string;
}

interface CachedDiscoveryRecord {
    id: string;
    lookupKey: string;
    handle: string;
    discoveryData: DiscoveryRecord;
    isValid: boolean;
    source: 'orbitdb' | 'direct';
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
}

export {
    Tag,
    UserManifest,
    TagCollection,
    SubscriptionCollection,
    PublicSubscription,
    User,
    Subscription,
    UserIdentity,
    DecentralizedConfig,
    ExtensionConfig,
    CachedManifest,
    CachedTagCollection,
    CachedSubscriptionCollection,
    CachedIdentity,
    SyncState,
    IPFSBlock,
    DIDDocument,
    VerificationMethod,
    ServiceEndpoint,
    CachedDiscoveryRecord,
    DiscoveryRecord,
    PROTOCOL,
    VALIDATION_LIMITS,
    validateDiscoveryRecord,
    validateHandle,
};
