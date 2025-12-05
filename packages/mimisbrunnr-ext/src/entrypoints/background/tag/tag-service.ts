import {
    isEncryptedTagCollection,
    isTagCollection,
    isUserManifest,
    UserManifest,
    type EncryptedTagCollection,
    type Tag,
    type TagCollection,
    type CreateTag,
    createDbRow,
} from '@my-mimisbrunnr/protocol';
import log from 'loglevel';
import type { IdentityService } from '../identity/identity-service.js';
import type { AddObjectOptions, IpfsService } from '../ipfs/ipfs-service.js';
import { TagRepository } from './tag-repository.js';

export interface PublishOptions extends AddObjectOptions {
    encrypt?: boolean;
}

export interface ImportOptions {
    mode?: 'merge' | 'overwrite';
}

export class TagService {
    private tagRepository = new TagRepository();

    constructor(
        private ipfsService: IpfsService,
        private identityService: IdentityService
    ) {}

    async get(id: string): Promise<Tag | null> {
        return this.tagRepository.get(id);
    }

    async list(): Promise<Tag[]> {
        return this.tagRepository.list();
    }

    async listByUsername(username: string): Promise<Tag[]> {
        return this.tagRepository.listByUsername(username);
    }

    async upsert(tag: CreateTag | Tag): Promise<Tag> {
        return this.tagRepository.upsert(tag);
    }

    async delete(id: string): Promise<void> {
        return this.tagRepository.delete(id);
    }

    /**
     * Publish a tag collection to IPFS
     *
     * @param tags - The tags to publish
     * @param options - Options for the publish operation
     * @returns CID of the published content
     *
     * @remarks
     * TODO(MM-28): Add encryption before publishing
     * TODO(MM-35): Add content validation (size limits, schema validation)
     * TODO(MM-36): Add timeout and retry logic
     * TODO(MM-36): Add rate limiting
     */
    private async publishTagCollection({
        encrypt = true,
        ...addObjectOptions
    }: PublishOptions = {}): Promise<{
        cid: string;
        object: TagCollection;
    }> {
        // Get identity
        const identity = this.identityService.getCurrent();

        // Get all tags from repository
        const tags = await this.tagRepository.list();

        // Create TagCollection structure with full tag data
        // TODO(MM-35): Add content validation
        const tagCollection: TagCollection = {
            ...createDbRow(),
            version: 1,
            encrypted: false,
            handle: identity.handle,
            tags,
        };

        let object: TagCollection | EncryptedTagCollection = tagCollection;

        if (encrypt) {
            // Encrypt the tag collection
            const { encryptedData, nonce, salt } =
                await this.identityService.encryptContent(tagCollection);

            // Create encrypted wrapper
            object = {
                ...createDbRow(),
                version: 1,
                encrypted: true,
                data: encryptedData,
                nonce,
                contentSalt: salt,
            } satisfies EncryptedTagCollection;
        }

        const cid = await this.ipfsService.addObject(object, addObjectOptions);

        // Always return the unencrypted TagCollection for metadata purposes
        // even if we published an encrypted version
        return {
            cid,
            object: tagCollection,
        };
    }

    /**
     * Retrieve a tag collection from IPFS by CID
     *
     * @param cidString - CID string of the content to retrieve
     * @returns The retrieved tag collection
     *
     * @remarks
     * TODO(MM-28): Add decryption after retrieval
     * TODO(MM-35): Add content validation after retrieval
     * TODO(MM-36): Add timeout and retry logic
     * TODO(MM-34): Check cache before fetching from network
     */
    async retrieveTagCollection(cidString: string): Promise<TagCollection> {
        const obj = await this.ipfsService.retrieveObject(cidString);

        let tagCollection: TagCollection;
        if (isEncryptedTagCollection(obj)) {
            log.info('[IpfsService] Decrypting tag collection...');

            // Decrypt using salt from encrypted structure
            tagCollection =
                await this.identityService.decryptContent<TagCollection>(
                    obj.data,
                    obj.nonce,
                    obj.contentSalt
                );

            log.info(
                '[IpfsService] Tag collection decrypted successfully:',
                tagCollection.handle
            );
        } else if (isTagCollection(obj)) {
            tagCollection = obj;
        } else {
            throw new Error('Invalid tag collection format');
        }

        return tagCollection;
    }

    /**
     * Import tag collection from IPFS by CID (private helper)
     *
     * @param cidString - CID of the tag collection
     * @param options - Import options
     * @returns Import statistics
     *
     * @remarks
     * This is a private method. Use importUserManifest() to import from manifest CID.
     */
    private async importTagCollection(
        cidString: string,
        { mode = 'merge' }: ImportOptions = {}
    ): Promise<{ imported: number; total: number }> {
        // Retrieve from IPFS
        const tagCollection = await this.retrieveTagCollection(cidString);

        // Convert TagCollection to Tag array
        // TODO(MM-35): Add content validation
        const tags = tagCollection.tags.map(tagEntry => ({
            username: tagEntry.username,
            name: tagEntry.name,
            color: tagEntry.color,
        }));

        // Import tags into repository with specified mode
        return this.tagRepository.importTags(tags, mode);
    }

    /**
     * Publish user manifest with tag collections to IPFS/IPNS
     *
     * @param options - Publishing options
     * @returns Object containing collection data and manifest CID
     *
     * @remarks
     * Architecture:
     * - Manifests are NEVER encrypted (always publicly readable)
     * - TagCollections CAN be encrypted (optional, per-collection)
     * - Manifest contains array of CID strings referencing TagCollections
     * - Subscribers can read manifest but only decrypt collections they have keys for
     *
     * Publishing flow:
     * 1. Publish TagCollection(s) to IPFS (optionally encrypted)
     * 2. Build UserManifest with CID references (always unencrypted)
     * 3. Publish UserManifest to IPFS
     * 4. Publish DID Document to IPFS and IPNS
     *
     * TODO(MM-29): Support multiple tag collections
     * TODO(MM-36): Add retry logic and error handling
     */
    async publishUserManifest({
        encrypt = true,
        ...addObjectOptions
    }: PublishOptions = {}): Promise<string> {
        // Get current identity
        const identity = this.identityService.getCurrent();

        log.info(
            '[TagService] Publishing for identity:',
            identity.did,
            identity.handle
        );

        // Step 1: Publish tag collection (optionally encrypted)
        log.info(
            `[TagService] Step 1/3: Publishing ${
                encrypt ? 'encrypted' : 'public'
            } tag collection`
        );
        const { cid: collectionCid } = await this.publishTagCollection({
            encrypt,
            ...addObjectOptions,
        });

        log.info('[TagService] Tag collection published:', collectionCid);

        // Step 2: Build and publish user manifest (NEVER encrypted)
        // Manifest contains CID references to TagCollections, not embedded objects
        log.info('[TagService] Step 2/3: Publishing user manifest');

        const manifest: UserManifest = {
            ...createDbRow(),
            version: 1,
            encrypted: false, // Manifests are always unencrypted
            handle: identity.handle,
            did: identity.did,
            collections: [collectionCid], // Array of CID strings
        };

        const manifestCid = await this.ipfsService.addObject(
            manifest,
            addObjectOptions
        );

        log.info('[TagService] User manifest published:', manifestCid);

        // Step 3: Publish DID document to IPFS and IPNS via IdentityService (MM-29)
        log.info(
            '[TagService] Step 3/4: Publishing DID document to IPFS and IPNS'
        );
        const { didDocumentCid, ipnsKey } =
            await this.identityService.publishDidDocument(
                manifestCid
                // TODO(MM-31): Add tweet proof URL
            );
        log.info(
            '[TagService] DID document published:',
            didDocumentCid,
            'IPNS:',
            ipnsKey
        );

        log.info('[TagService] Complete manifest publishing successful:', {
            collectionCid,
            manifestCid,
            didDocumentCid,
            ipnsKey,
        });

        // TODO(MM-30): Add OrbitDB discovery record

        return manifestCid;
    }

    /**
     * Retrieve user manifest from IPFS
     *
     * @param cidString - CID of the manifest
     * @returns User manifest
     *
     * @remarks
     * Manifests are always unencrypted. Only TagCollections may be encrypted.
     * TODO(MM-29): Add validation of manifest structure
     */
    async retrieveUserManifest(cidString: string): Promise<UserManifest> {
        const obj = await this.ipfsService.retrieveObject(cidString);

        if (isUserManifest(obj)) {
            log.info(
                '[TagService] User manifest retrieved successfully:',
                obj.did,
                `(${obj.collections.length} collections)`
            );
            return obj;
        }

        throw new Error('Invalid user manifest format');
    }

    /**
     * Import user manifest and its tag collections from IPFS
     *
     * @param manifestCid - CID of the user manifest
     * @param options - Import options
     * @returns Import statistics for all collections
     *
     * @remarks
     * Flow:
     * 1. Retrieve and parse UserManifest (always unencrypted)
     * 2. For each collection CID in manifest:
     *    - Retrieve TagCollection (may be encrypted)
     *    - Decrypt if needed (using user's passphrase)
     *    - Import tags into local repository
     * 3. Return aggregated import statistics
     *
     * TODO(MM-35): Add validation of manifest structure
     * TODO(MM-36): Add error handling for partial failures
     * TODO(MM-36): Add progress reporting for multiple collections
     */
    async importUserManifest(
        manifestCid: string,
        { mode = 'merge' }: ImportOptions = {}
    ): Promise<{
        collectionsProcessed: number;
        totalImported: number;
        totalTags: number;
    }> {
        log.info('[TagService] Importing user manifest:', manifestCid);

        // Step 1: Retrieve manifest (always unencrypted)
        const manifest = await this.retrieveUserManifest(manifestCid);
        log.info(
            `[TagService] Manifest retrieved: ${manifest.handle} (${manifest.collections.length} collections)`
        );

        // Step 2: Import each collection
        let totalImported = 0;
        let totalTags = 0;

        for (const collectionCid of manifest.collections) {
            log.info(`[TagService] Importing collection: ${collectionCid}`);
            const result = await this.importTagCollection(collectionCid, {
                mode,
            });
            totalImported += result.imported;
            totalTags += result.total;
            log.info(
                `[TagService] Collection imported: ${result.imported}/${result.total} tags`
            );
        }

        log.info(
            `[TagService] Manifest import complete: ${totalImported}/${totalTags} tags from ${manifest.collections.length} collections`
        );

        return {
            collectionsProcessed: manifest.collections.length,
            totalImported,
            totalTags,
        };
    }

    /**
     * Update existing published manifest with new tag changes (MM-29)
     *
     * @param options - Publishing options
     * @returns Updated publishing result
     *
     * @remarks
     * Updates the complete publishing chain when tags change:
     * 1. Re-publish encrypted tag collection → new CID₁
     * 2. Re-publish encrypted manifest with new collection CID → new CID₂
     * 3. Re-publish DID document with new manifest CID → new CID₃
     * 4. Re-publish to same IPNS key with new DID document CID
     *
     * IPNS key stays the same, only CIDs update.
     * This is more efficient than full re-publish for tag updates.
     *
     * TODO(MM-35): Add validation that identity hasn't changed
     * TODO(MM-36): Add optimistic updates and rollback on failure
     */
    async updatePublishedManifest(
        options: PublishOptions = {}
    ): Promise<string> {
        log.info('[TagService] Starting manifest update workflow');

        // For now, this is identical to publishCompleteManifest
        // In future tickets, we can optimize by:
        // - Only re-publishing changed collections
        // - Caching previous CIDs for rollback
        // - Batch updates with debouncing

        return this.publishUserManifest(options);
    }
}
