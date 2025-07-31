// Cache Repositories - manages various cache stores
import {
    CachedManifest,
    CachedTagCollection,
    CachedSubscriptionCollection,
    CachedIdentity,
    CachedDiscoveryRecord,
    IPFSBlock,
} from '../../data-structures';
import { BaseRepository } from '../base-repository';

export class CachedManifestRepository extends BaseRepository<CachedManifest> {
    constructor(db: IDBDatabase) {
        super(db, 'cachedManifests');
    }

    async getByUserId(userId: string): Promise<CachedManifest[]> {
        return await this.getByIndex('userId', userId);
    }

    async getByHandle(handle: string): Promise<CachedManifest[]> {
        return await this.getByIndex('handle', handle);
    }

    async getByIPFSHash(ipfsHash: string): Promise<CachedManifest | null> {
        const manifests = await this.getByIndex('ipfsHash', ipfsHash);
        return manifests[0] || null;
    }

    async getExpired(): Promise<CachedManifest[]> {
        const now = Date.now();
        const all = await this.getAll();
        return all.filter(manifest => manifest.expiresAt < now);
    }
}

export class CachedTagCollectionRepository extends BaseRepository<CachedTagCollection> {
    constructor(db: IDBDatabase) {
        super(db, 'cachedTagCollections');
    }

    async getByUserId(userId: string): Promise<CachedTagCollection[]> {
        return await this.getByIndex('userId', userId);
    }

    async getByHandle(handle: string): Promise<CachedTagCollection[]> {
        return await this.getByIndex('handle', handle);
    }

    async getByIPFSHash(ipfsHash: string): Promise<CachedTagCollection | null> {
        const collections = await this.getByIndex('ipfsHash', ipfsHash);
        return collections[0] || null;
    }

    async getExpired(): Promise<CachedTagCollection[]> {
        const now = Date.now();
        const all = await this.getAll();
        return all.filter(item => item.expiresAt < now);
    }
}

export class CachedSubscriptionCollectionRepository extends BaseRepository<CachedSubscriptionCollection> {
    constructor(db: IDBDatabase) {
        super(db, 'cachedSubscriptionCollections');
    }

    async getByUserId(userId: string): Promise<CachedSubscriptionCollection[]> {
        return await this.getByIndex('userId', userId);
    }

    async getByHandle(handle: string): Promise<CachedSubscriptionCollection[]> {
        return await this.getByIndex('handle', handle);
    }

    async getByIPFSHash(
        ipfsHash: string
    ): Promise<CachedSubscriptionCollection | null> {
        const collections = await this.getByIndex('ipfsHash', ipfsHash);
        return collections[0] || null;
    }

    async getExpired(): Promise<CachedSubscriptionCollection[]> {
        const now = Date.now();
        const all = await this.getAll();
        return all.filter(item => item.expiresAt < now);
    }
}

export class CachedIdentityRepository extends BaseRepository<CachedIdentity> {
    constructor(db: IDBDatabase) {
        super(db, 'cachedIdentities');
    }

    async getByDID(did: string): Promise<CachedIdentity | null> {
        const identities = await this.getByIndex('did', did);
        return identities[0] || null;
    }

    async getByHandle(handle: string): Promise<CachedIdentity[]> {
        return await this.getByIndex('handle', handle);
    }

    async getExpired(): Promise<CachedIdentity[]> {
        const now = Date.now();
        const all = await this.getAll();
        return all.filter(identity => identity.expiresAt < now);
    }
}

export class CachedDiscoveryRecordRepository extends BaseRepository<CachedDiscoveryRecord> {
    constructor(db: IDBDatabase) {
        super(db, 'cachedDiscoveryRecords');
    }

    async getByLookupKey(lookupKey: string): Promise<CachedDiscoveryRecord[]> {
        return await this.getByIndex('lookupKey', lookupKey);
    }

    async getByHandle(handle: string): Promise<CachedDiscoveryRecord[]> {
        return await this.getByIndex('handle', handle);
    }

    async getExpired(): Promise<CachedDiscoveryRecord[]> {
        const now = Date.now();
        const all = await this.getAll();
        return all.filter(record => record.expiresAt < now);
    }
}

export class IPFSBlockRepository extends BaseRepository<IPFSBlock> {
    constructor(db: IDBDatabase) {
        super(db, 'ipfsBlocks');
    }

    async getByCID(cid: string): Promise<IPFSBlock | null> {
        return await this.getById(cid); // CID is the primary key
    }

    async getPinnedBlocks(): Promise<IPFSBlock[]> {
        return await this.getByIndex('pinned', true);
    }

    async getExpired(): Promise<IPFSBlock[]> {
        const now = Date.now();
        const all = await this.getAll();
        return all.filter(block => block.expiresAt && block.expiresAt < now);
    }

    async getOldestAccessed(limit: number): Promise<IPFSBlock[]> {
        const all = await this.getAll();
        return all
            .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
            .slice(0, limit);
    }
}
