// Decentralized Sync Service - coordinates between services (no direct repository access)
import {
    TagCollection,
    SubscriptionCollection,
    UserManifest,
} from '../../data-structures';
import { UserService } from '../user';
import { TagService } from '../tag';
import { SubscriptionService } from '../subscription';
import { SyncService } from '../sync';
import { CacheService } from '../cache';

// Interface for IPFS operations (would be implemented elsewhere)
interface IPFSClient {
    add(data: string): Promise<string>;
    cat(cid: string): Promise<any>;
    name: {
        publish(path: string, options: any): Promise<void>;
        resolve(ipnsKey: string): Promise<string>;
    };
}

export class DecentralizedSyncService {
    private userService: UserService;
    private tagService: TagService;
    private subscriptionService: SubscriptionService;
    private syncService: SyncService;
    private cacheService: CacheService;
    private ipfsClient: IPFSClient;

    constructor(
        userService: UserService,
        tagService: TagService,
        subscriptionService: SubscriptionService,
        syncService: SyncService,
        cacheService: CacheService,
        ipfsClient: IPFSClient
    ) {
        this.userService = userService;
        this.tagService = tagService;
        this.subscriptionService = subscriptionService;
        this.syncService = syncService;
        this.cacheService = cacheService;
        this.ipfsClient = ipfsClient;
    }

    // Publish user's tags to decentralized storage
    async publishTagCollection(): Promise<string> {
        const currentUser = await this.userService.getCurrentUser();
        if (!currentUser) {
            throw new Error('No current user found');
        }

        // Get pending sync tags for the current user
        const pendingTags = await this.tagService.getPendingSyncTags();
        const myTags = pendingTags.filter(tag => tag.owner === currentUser.id);

        const tagCollection: TagCollection = {
            version: 1,
            handle: currentUser.handle,
            tags: myTags,
            createdAt: currentUser.createdAt,
            updatedAt: Date.now(),
        };

        // Publish to IPFS
        const cid = await this.ipfsClient.add(JSON.stringify(tagCollection));

        // Mark tags as synced
        await this.tagService.markTagsSynced(myTags.map(tag => tag.id));

        // Cache the published collection
        await this.cacheService.storeTagCollection(
            currentUser.id,
            currentUser.handle,
            cid,
            tagCollection
        );

        return cid;
    }

    // Publish user's subscriptions to decentralized storage
    async publishSubscriptionCollection(): Promise<string> {
        const currentUser = await this.userService.getCurrentUser();
        if (!currentUser) {
            throw new Error('No current user found');
        }

        const activeSubscriptions =
            await this.subscriptionService.getActiveSubscriptions();

        // Convert internal subscriptions to public format
        const publicSubscriptions = await Promise.all(
            activeSubscriptions.map(async sub => {
                const user = await this.userService.getUserById(sub.userId);
                if (!user) return null;

                return {
                    handle: user.handle,
                    did: user.did,
                    displayName: user.displayName,
                    createdAt: sub.createdAt,
                };
            })
        );

        const validSubscriptions = publicSubscriptions.filter(
            sub => sub !== null
        );

        const subscriptionCollection: SubscriptionCollection = {
            version: 1,
            handle: currentUser.handle,
            subscriptions: validSubscriptions,
            createdAt: currentUser.createdAt,
            updatedAt: Date.now(),
        };

        // Publish to IPFS
        const cid = await this.ipfsClient.add(
            JSON.stringify(subscriptionCollection)
        );

        // Cache the published collection
        await this.cacheService.storeSubscriptionCollection(
            currentUser.id,
            currentUser.handle,
            cid,
            subscriptionCollection
        );

        return cid;
    }

    // Publish user manifest that points to both collections
    async publishUserManifest(): Promise<string> {
        const currentUser = await this.userService.getCurrentUser();
        if (!currentUser) {
            throw new Error('No current user found');
        }

        // Publish both collections
        const [tagsCid, subscriptionsCid] = await Promise.all([
            this.publishTagCollection(),
            this.publishSubscriptionCollection(),
        ]);

        const manifest: UserManifest = {
            version: 1,
            handle: currentUser.handle,
            collections: {
                tags: tagsCid,
                subscriptions: subscriptionsCid,
            },
            createdAt: currentUser.createdAt,
            updatedAt: Date.now(),
        };

        // Publish manifest to IPFS
        const manifestCid = await this.ipfsClient.add(JSON.stringify(manifest));

        // Cache the manifest
        await this.cacheService.storeManifest(
            currentUser.id,
            currentUser.handle,
            manifestCid,
            manifest
        );

        return manifestCid;
    }

    // Resolve and sync a user's content
    async syncUserContent(userId: string): Promise<void> {
        const user = await this.userService.getUserById(userId);
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        try {
            // Check cache first
            let manifest = await this.cacheService.getManifest(userId);

            if (!manifest) {
                // Resolve from IPNS if not cached
                const didDocPath = await this.ipfsClient.name.resolve(
                    user.ipnsKey
                );
                const didDocCID = didDocPath.replace('/ipfs/', '');
                const didDoc = await this.ipfsClient.cat(didDocCID);

                // Extract manifest CID from DID document
                const manifestService = didDoc.service?.find(
                    (s: any) => s.type === 'UserManifest'
                );
                if (!manifestService) {
                    throw new Error(
                        'No UserManifest service found in DID document'
                    );
                }

                const manifestCid = manifestService.serviceEndpoint.replace(
                    'ipfs://',
                    ''
                );
                const manifestData = await this.ipfsClient.cat(manifestCid);

                // Cache the manifest
                manifest = await this.cacheService.storeManifest(
                    userId,
                    user.handle,
                    manifestCid,
                    manifestData
                );
            }

            // Sync tag collection if user is subscribed with sync enabled
            const subscription =
                await this.subscriptionService.getSubscriptionByUserId(userId);
            if (subscription && subscription.syncEnabled) {
                await this.syncTagCollection(userId, manifest.manifestData);
                await this.subscriptionService.updateLastFetched(userId);
            }
        } catch (error) {
            console.error(`Failed to sync user ${userId}:`, error);
            // Queue for retry
            await this.syncService.queueSyncOperation(
                userId,
                'subscription',
                'update'
            );
        }
    }

    private async syncTagCollection(
        userId: string,
        manifest: UserManifest
    ): Promise<void> {
        try {
            // Check cache first
            let tagCollection = await this.cacheService.getTagCollection(
                userId
            );

            if (!tagCollection) {
                // Fetch from IPFS
                const tagCollectionData = await this.ipfsClient.cat(
                    manifest.collections.tags
                );

                // Cache the collection
                tagCollection = await this.cacheService.storeTagCollection(
                    userId,
                    manifest.handle,
                    manifest.collections.tags,
                    tagCollectionData
                );
            }

            // Sync tags to local storage
            for (const remoteTag of tagCollection.tagCollectionData.tags) {
                const existingTag = await this.tagService.getTagById(
                    remoteTag.id
                );

                if (!existingTag) {
                    // Create new tag
                    await this.tagService.createTag({
                        ...remoteTag,
                        syncStatus: 'synced',
                    });
                } else if (existingTag.updatedAt < remoteTag.updatedAt) {
                    // Update existing tag if remote is newer
                    await this.tagService.updateTag(remoteTag.id, {
                        ...remoteTag,
                        syncStatus: 'synced',
                    });
                }
            }
        } catch (error) {
            console.error(
                `Failed to sync tag collection for user ${userId}:`,
                error
            );
            throw error;
        }
    }

    // Queue sync operations for background processing
    async queueSyncOperation(
        entityId: string,
        entityType: 'tags' | 'subscription' | 'identity',
        operation: 'create' | 'update' | 'delete'
    ): Promise<void> {
        await this.syncService.queueSyncOperation(
            entityId,
            entityType,
            operation
        );
    }

    // Process pending sync operations
    async processPendingSyncOperations(): Promise<void> {
        const pendingOperations =
            await this.syncService.getPendingSyncOperations();

        for (const operation of pendingOperations) {
            try {
                await this.syncService.markSyncInProgress(operation.id);

                switch (operation.entityType) {
                    case 'tags':
                        await this.publishTagCollection();
                        break;
                    case 'subscription':
                        if (operation.operation === 'update') {
                            await this.syncUserContent(operation.entityId);
                        }
                        break;
                    case 'identity':
                        await this.publishUserManifest();
                        break;
                }

                await this.syncService.markSyncCompleted(operation.id);
            } catch (error) {
                await this.syncService.markSyncFailed(
                    operation.id,
                    error instanceof Error
                        ? error.message
                        : 'Unknown sync error'
                );
            }
        }
    }

    // Process retryable sync operations
    async processRetryableSyncOperations(): Promise<void> {
        const retryableOperations =
            await this.syncService.getRetryableSyncOperations();

        for (const operation of retryableOperations) {
            await this.syncService.resetFailedSyncOperation(operation.id);
        }

        // Process the reset operations
        await this.processPendingSyncOperations();
    }

    // Sync all active subscriptions
    async syncAllSubscriptions(): Promise<void> {
        const activeSubscriptions =
            await this.subscriptionService.getActiveSubscriptions();

        for (const subscription of activeSubscriptions) {
            if (subscription.syncEnabled) {
                await this.queueSyncOperation(
                    subscription.userId,
                    'subscription',
                    'update'
                );
            }
        }

        await this.processPendingSyncOperations();
    }

    // Get sync statistics
    async getSyncStatistics() {
        return await this.syncService.getSyncStatistics();
    }
}
