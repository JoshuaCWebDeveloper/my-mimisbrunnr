// Cache Service - manages all cache-related operations and owns cache repositories
import {
    CachedManifest,
    CachedTagCollection,
    CachedSubscriptionCollection,
    CachedIdentity,
    CachedDiscoveryRecord,
    IPFSBlock,
    UserManifest,
    TagCollection,
    SubscriptionCollection,
    DIDDocument,
    DiscoveryRecord,
} from '../../data-structures';
import {
    CachedManifestRepository,
    CachedTagCollectionRepository,
    CachedSubscriptionCollectionRepository,
    CachedIdentityRepository,
    CachedDiscoveryRecordRepository,
    IPFSBlockRepository,
} from './cache-repositories';

export class CacheService {
    private manifestRepo: CachedManifestRepository;
    private tagCollectionRepo: CachedTagCollectionRepository;
    private subscriptionCollectionRepo: CachedSubscriptionCollectionRepository;
    private identityRepo: CachedIdentityRepository;
    private discoveryRepo: CachedDiscoveryRecordRepository;
    private ipfsBlockRepo: IPFSBlockRepository;

    constructor(db: IDBDatabase) {
        this.manifestRepo = new CachedManifestRepository(db);
        this.tagCollectionRepo = new CachedTagCollectionRepository(db);
        this.subscriptionCollectionRepo =
            new CachedSubscriptionCollectionRepository(db);
        this.identityRepo = new CachedIdentityRepository(db);
        this.discoveryRepo = new CachedDiscoveryRecordRepository(db);
        this.ipfsBlockRepo = new IPFSBlockRepository(db);
    }

    // Manifest cache methods
    async storeManifest(
        userId: string,
        handle: string,
        ipfsHash: string,
        manifest: UserManifest,
        ttl: number = 3600000
    ): Promise<CachedManifest> {
        const cached: CachedManifest = {
            id: this.generateUUID(),
            userId,
            handle,
            ipfsHash,
            manifestData: manifest,
            isValid: true,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.manifestRepo.create(cached);
    }

    async getManifest(userId: string): Promise<CachedManifest | null> {
        const manifests = await this.manifestRepo.getByUserId(userId);
        const valid = manifests.find(
            m => m.isValid && m.expiresAt > Date.now()
        );
        return valid || null;
    }

    async getManifestByIPFS(ipfsHash: string): Promise<CachedManifest | null> {
        const manifest = await this.manifestRepo.getByIPFSHash(ipfsHash);
        if (manifest && manifest.isValid && manifest.expiresAt > Date.now()) {
            return manifest;
        }
        return null;
    }

    // Tag collection cache methods
    async storeTagCollection(
        userId: string,
        handle: string,
        ipfsHash: string,
        collection: TagCollection,
        ttl: number = 3600000
    ): Promise<CachedTagCollection> {
        const cached: CachedTagCollection = {
            id: this.generateUUID(),
            userId,
            handle,
            ipfsHash,
            tagCollectionData: collection,
            isValid: true,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.tagCollectionRepo.create(cached);
    }

    async getTagCollection(
        userId: string
    ): Promise<CachedTagCollection | null> {
        const collections = await this.tagCollectionRepo.getByUserId(userId);
        const valid = collections.find(
            c => c.isValid && c.expiresAt > Date.now()
        );
        return valid || null;
    }

    // Subscription collection cache methods
    async storeSubscriptionCollection(
        userId: string,
        handle: string,
        ipfsHash: string,
        collection: SubscriptionCollection,
        ttl: number = 3600000
    ): Promise<CachedSubscriptionCollection> {
        const cached: CachedSubscriptionCollection = {
            id: this.generateUUID(),
            userId,
            handle,
            ipfsHash,
            subscriptionCollectionData: collection,
            isValid: true,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.subscriptionCollectionRepo.create(cached);
    }

    async getSubscriptionCollection(
        userId: string
    ): Promise<CachedSubscriptionCollection | null> {
        const collections = await this.subscriptionCollectionRepo.getByUserId(
            userId
        );
        const valid = collections.find(
            c => c.isValid && c.expiresAt > Date.now()
        );
        return valid || null;
    }

    // Identity cache methods
    async storeIdentity(
        did: string,
        handle: string,
        didDocument: DIDDocument,
        publicKey: string,
        verified: boolean,
        ttl: number = 86400000
    ): Promise<CachedIdentity> {
        const cached: CachedIdentity = {
            id: this.generateUUID(),
            did,
            handle,
            didDocument,
            publicKey,
            verified,
            proofUrl: undefined,
            ipnsKey: '', // Would be extracted from DID document
            lastVerifiedAt: verified ? Date.now() : undefined,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.identityRepo.create(cached);
    }

    async getIdentity(did: string): Promise<CachedIdentity | null> {
        const identity = await this.identityRepo.getByDID(did);
        if (identity && identity.expiresAt > Date.now()) {
            return identity;
        }
        return null;
    }

    // Discovery record cache methods
    async storeDiscoveryRecord(
        lookupKey: string,
        handle: string,
        record: DiscoveryRecord,
        source: 'orbitdb' | 'direct',
        ttl: number = 3600000
    ): Promise<CachedDiscoveryRecord> {
        const cached: CachedDiscoveryRecord = {
            id: this.generateUUID(),
            lookupKey,
            handle,
            discoveryData: record,
            isValid: true,
            source,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.discoveryRepo.create(cached);
    }

    async getDiscoveryRecord(
        lookupKey: string
    ): Promise<CachedDiscoveryRecord | null> {
        const records = await this.discoveryRepo.getByLookupKey(lookupKey);
        const valid = records.find(r => r.isValid && r.expiresAt > Date.now());
        return valid || null;
    }

    // IPFS block cache methods
    async storeIPFSBlock(
        cid: string,
        data: Uint8Array,
        pinned: boolean = false,
        ttl?: number
    ): Promise<IPFSBlock> {
        const block: IPFSBlock = {
            cid,
            data,
            size: data.length,
            pinned,
            lastAccessedAt: Date.now(),
            expiresAt: ttl ? Date.now() + ttl : undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.ipfsBlockRepo.create(block);
    }

    async getIPFSBlock(cid: string): Promise<IPFSBlock | null> {
        const block = await this.ipfsBlockRepo.getByCID(cid);
        if (block) {
            // Update last accessed time
            await this.ipfsBlockRepo.update(cid, {
                lastAccessedAt: Date.now(),
            });
        }
        return block;
    }

    async pinIPFSBlock(cid: string): Promise<void> {
        await this.ipfsBlockRepo.update(cid, { pinned: true });
    }

    async unpinIPFSBlock(cid: string): Promise<void> {
        await this.ipfsBlockRepo.update(cid, { pinned: false });
    }

    // Cache cleanup methods
    async cleanupExpiredCache(): Promise<void> {
        const promises = [
            this.cleanupExpiredManifests(),
            this.cleanupExpiredTagCollections(),
            this.cleanupExpiredSubscriptionCollections(),
            this.cleanupExpiredIdentities(),
            this.cleanupExpiredDiscoveryRecords(),
            this.cleanupExpiredIPFSBlocks(),
        ];

        await Promise.all(promises);
    }

    private async cleanupExpiredManifests(): Promise<void> {
        const expired = await this.manifestRepo.getExpired();
        await Promise.all(expired.map(m => this.manifestRepo.delete(m.id)));
    }

    private async cleanupExpiredTagCollections(): Promise<void> {
        const expired = await this.tagCollectionRepo.getExpired();
        await Promise.all(
            expired.map(c => this.tagCollectionRepo.delete(c.id))
        );
    }

    private async cleanupExpiredSubscriptionCollections(): Promise<void> {
        const expired = await this.subscriptionCollectionRepo.getExpired();
        await Promise.all(
            expired.map(c => this.subscriptionCollectionRepo.delete(c.id))
        );
    }

    private async cleanupExpiredIdentities(): Promise<void> {
        const expired = await this.identityRepo.getExpired();
        await Promise.all(expired.map(i => this.identityRepo.delete(i.id)));
    }

    private async cleanupExpiredDiscoveryRecords(): Promise<void> {
        const expired = await this.discoveryRepo.getExpired();
        await Promise.all(expired.map(r => this.discoveryRepo.delete(r.id)));
    }

    private async cleanupExpiredIPFSBlocks(): Promise<void> {
        const expired = await this.ipfsBlockRepo.getExpired();
        const unpinned = expired.filter(block => !block.pinned);
        await Promise.all(unpinned.map(b => this.ipfsBlockRepo.delete(b.cid)));
    }

    async pruneIPFSCache(targetSize: number): Promise<void> {
        const all = await this.ipfsBlockRepo.getAll();
        const unpinned = all.filter(b => !b.pinned);
        const currentSize = unpinned.reduce((sum, b) => sum + b.size, 0);

        if (currentSize <= targetSize) return;

        // Remove oldest accessed blocks first
        const sorted = unpinned.sort(
            (a, b) => a.lastAccessedAt - b.lastAccessedAt
        );
        let removedSize = 0;

        for (const block of sorted) {
            await this.ipfsBlockRepo.delete(block.cid);
            removedSize += block.size;

            if (currentSize - removedSize <= targetSize) break;
        }
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
            /[xy]/g,
            function (c) {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            }
        );
    }
}
