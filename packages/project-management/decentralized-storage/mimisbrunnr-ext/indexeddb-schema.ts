// IndexedDB Database Schema (Extension-Only)

import {
    User,
    Tag,
    Subscription,
    CachedManifest,
    CachedTagCollection,
    CachedSubscriptionCollection,
    CachedIdentity,
    CachedDiscoveryRecord,
    IPFSBlock,
    SyncState,
    UserIdentity,
} from './data-structures';

interface MimisbrunnrDB {
    // Core Data Stores
    users: User[];
    tags: Tag[];
    subscriptions: Subscription[];

    // Cache Stores
    cachedManifests: CachedManifest[];
    cachedTagCollections: CachedTagCollection[];
    cachedSubscriptionCollections: CachedSubscriptionCollection[];
    cachedIdentities: CachedIdentity[];
    cachedDiscoveryRecords: CachedDiscoveryRecord[];
    ipfsBlocks: IPFSBlock[];

    // State Management Stores
    syncStates: SyncState[];

    // Private Stores
    myIdentity: UserIdentity;
    privateConfig: any;
}

// IndexedDB Store Configurations (Extension-Only)
const STORE_CONFIGS = {
    users: {
        keyPath: 'id',
        indexes: [
            { name: 'did', keyPath: 'did', unique: true },
            { name: 'handle', keyPath: 'handle', unique: true },
            { name: 'isMe', keyPath: 'isMe' },
            { name: 'verified', keyPath: 'verified' },
            { name: 'updatedAt', keyPath: 'updatedAt' },
        ],
    },
    tags: {
        keyPath: 'id',
        indexes: [
            { name: 'username', keyPath: 'username' },
            { name: 'owner', keyPath: 'owner' },
            { name: 'label', keyPath: 'label' },
            { name: 'updatedAt', keyPath: 'updatedAt' },
            { name: 'syncStatus', keyPath: 'syncStatus' },
        ],
    },
    subscriptions: {
        keyPath: 'id',
        indexes: [
            { name: 'userId', keyPath: 'userId', unique: true },
            { name: 'isActive', keyPath: 'isActive' },
            { name: 'syncEnabled', keyPath: 'syncEnabled' },
            { name: 'updatedAt', keyPath: 'updatedAt' },
        ],
    },
    cachedManifests: {
        keyPath: 'id',
        indexes: [
            { name: 'userId', keyPath: 'userId' },
            { name: 'handle', keyPath: 'handle' },
            { name: 'ipfsHash', keyPath: 'ipfsHash', unique: true },
            { name: 'expiresAt', keyPath: 'expiresAt' },
        ],
    },
    cachedTagCollections: {
        keyPath: 'id',
        indexes: [
            { name: 'userId', keyPath: 'userId' },
            { name: 'handle', keyPath: 'handle' },
            { name: 'ipfsHash', keyPath: 'ipfsHash', unique: true },
            { name: 'expiresAt', keyPath: 'expiresAt' },
        ],
    },
    cachedSubscriptionCollections: {
        keyPath: 'id',
        indexes: [
            { name: 'userId', keyPath: 'userId' },
            { name: 'handle', keyPath: 'handle' },
            { name: 'ipfsHash', keyPath: 'ipfsHash', unique: true },
            { name: 'expiresAt', keyPath: 'expiresAt' },
        ],
    },
    cachedIdentities: {
        keyPath: 'id',
        indexes: [
            { name: 'did', keyPath: 'did', unique: true },
            { name: 'handle', keyPath: 'handle' },
            { name: 'expiresAt', keyPath: 'expiresAt' },
        ],
    },
    cachedDiscoveryRecords: {
        keyPath: 'id',
        indexes: [
            { name: 'lookupKey', keyPath: 'lookupKey' },
            { name: 'handle', keyPath: 'handle' },
            { name: 'expiresAt', keyPath: 'expiresAt' },
        ],
    },
    ipfsBlocks: {
        keyPath: 'cid',
        indexes: [
            { name: 'lastAccessedAt', keyPath: 'lastAccessedAt' },
            { name: 'expiresAt', keyPath: 'expiresAt' },
            { name: 'pinned', keyPath: 'pinned' },
        ],
    },
    syncStates: {
        keyPath: 'id',
        indexes: [
            { name: 'entityType', keyPath: 'entityType' },
            { name: 'entityId', keyPath: 'entityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'nextRetryAt', keyPath: 'nextRetryAt' },
        ],
    },
} as const;

export { MimisbrunnrDB, STORE_CONFIGS };
