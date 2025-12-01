import {
    EncryptedUserManifest,
    isEncryptedTagCollection,
    isEncryptedUserManifest,
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
import { bytesToBase64 } from '../crypto.js';

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
    async publishTagCollection({
        encrypt = true,
        ...addObjectOptions
    }: PublishOptions = {}): Promise<string> {
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

        let object = tagCollection as unknown;

        if (encrypt) {
            // Encrypt the tag collection
            const { encryptedData, nonce, salt } =
                await this.identityService.encryptWithCurrentIdentity(
                    tagCollection
                );

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

        return this.ipfsService.addObject(object, addObjectOptions);
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
                await this.identityService.decryptWithCurrentIdentity<TagCollection>(
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

    async importTagCollection(
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
     * Publish encrypted user manifest to IPFS
     *
     * @param manifest - Plain user manifest
     * @param identityService - Identity service for encryption
     * @param options - Publishing options
     * @returns CID of the published encrypted manifest
     *
     * @remarks
     * Epic 1: All manifests are encrypted
     * Epic 2: User can choose between encrypted and public
     *
     * TODO(MM-29): Implement complete manifest publishing workflow
     */
    async publishUserManifest(
        did: string,
        collections: TagCollection[],
        { encrypt = true, ...addObjectOptions }: PublishOptions = {}
    ): Promise<string> {
        // Get identity
        const identity = this.identityService.getCurrent();

        // create manifest
        const manifest: UserManifest = {
            ...createDbRow(),
            version: 1,
            encrypted: false,
            handle: identity.handle,
            did,
            collections,
        };

        let object = manifest as unknown;

        if (encrypt) {
            // Encrypt the manifest
            const { encryptedData, nonce, salt } =
                await this.identityService.encryptWithCurrentIdentity(manifest);

            // Create encrypted wrapper
            object = {
                ...createDbRow(),
                version: 1,
                encrypted: true,
                data: encryptedData,
                nonce,
                contentSalt: salt,
                publicKey: bytesToBase64(identity.publicKey),
            } satisfies EncryptedUserManifest;
        }

        return this.ipfsService.addObject(object, addObjectOptions);
    }

    /**
     * Retrieve and decrypt user manifest from IPFS
     *
     * @param cidString - CID of encrypted manifest
     * @returns Decrypted user manifest
     *
     * @remarks
     * The salt is included in the encrypted structure.
     * TODO(MM-29): Implement complete manifest retrieval workflow
     */
    async retrieveUserManifest(cidString: string): Promise<UserManifest> {
        const obj = await this.ipfsService.retrieveObject(cidString);

        let manifest: UserManifest;
        if (isEncryptedUserManifest(obj)) {
            log.info('[IpfsService] Decrypting user manifest...');

            // Decrypt using salt from encrypted structure
            manifest =
                await this.identityService.decryptWithCurrentIdentity<UserManifest>(
                    obj.data,
                    obj.nonce,
                    obj.contentSalt
                );

            log.info(
                '[IpfsService] User manifest decrypted successfully:',
                manifest.did
            );
        } else if (isUserManifest(obj)) {
            manifest = obj;
        } else {
            throw new Error('Invalid user manifest format');
        }

        return manifest;
    }
}
