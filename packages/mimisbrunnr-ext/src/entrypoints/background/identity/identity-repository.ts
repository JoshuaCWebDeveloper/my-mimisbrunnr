/**
 * Identity Repository for IndexedDB Storage (MM-28)
 *
 * Manages persistent storage of encrypted identity data using IndexedDB.
 * This repository handles the storage layer for user identities.
 *
 * Storage strategy:
 * - Database: 'my-mimisbrunnr' (shared with tags)
 * - Object Store: 'identities'
 * - Key: 'did' (DID string)
 * - Indexes: 'handle' for lookups
 *
 * Security:
 * - All identities stored in encrypted form (EncryptedIdentity)
 * - Passphrase required for decryption (not stored)
 * - Only one identity per extension instance (current user)
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-36): No encryption-at-rest for IndexedDB (additional layer)
 * - TODO(MM-36): No database migration strategy for schema changes
 * - TODO(Epic 2): No multi-identity support (only current user)
 */

import log from 'loglevel';
import type { EncryptedIdentity } from './identity-service.js';
import { IdbRepository } from '../idb-repository.js';

enum IndexName {
    Handle = 'handle_idx',
}

/**
 * Repository for managing encrypted identity storage
 *
 * This class provides a clean API for storing and retrieving encrypted
 * identity data from IndexedDB.
 */
export class IdentityRepository extends IdbRepository {
    protected override readonly storeName = 'identities';
    protected override readonly version = 3; // Same version as TagRepository for shared DB
    protected override readonly indexes = [
        { name: 'did', keyPath: 'did', primary: true },
        { name: IndexName.Handle, keyPath: 'handle' },
    ];

    /**
     * Save encrypted identity to storage
     *
     * @param encryptedIdentity - Encrypted identity data
     * @returns Saved encrypted identity
     *
     * @remarks
     * This will overwrite any existing identity with the same DID
     */
    async save(encryptedIdentity: EncryptedIdentity): Promise<EncryptedIdentity> {
        const store = await this.openStore();
        const request = store.put(encryptedIdentity);
        await this.waitFor(request);

        log.info('[IdentityRepository] Saved encrypted identity:', encryptedIdentity.did);
        return encryptedIdentity;
    }

    /**
     * Load encrypted identity by DID
     *
     * @param did - DID to load
     * @returns EncryptedIdentity if found, null otherwise
     */
    async get(did: string): Promise<EncryptedIdentity | null> {
        const store = await this.openStore('readonly');
        const request = store.get(did);
        const identity = await this.waitFor<EncryptedIdentity | undefined>(request);

        if (identity) {
            log.info('[IdentityRepository] Loaded encrypted identity:', did);
        } else {
            log.info('[IdentityRepository] Identity not found:', did);
        }

        return identity || null;
    }

    /**
     * Load encrypted identity by handle
     *
     * @param handle - X.com handle to look up
     * @returns EncryptedIdentity if found, null otherwise
     *
     * @remarks
     * Uses index lookup for efficient queries
     */
    async getByHandle(handle: string): Promise<EncryptedIdentity | null> {
        const store = await this.openStore('readonly');
        const index = store.index(IndexName.Handle);
        const request = index.get(handle);
        const identity = await this.waitFor<EncryptedIdentity | undefined>(request);

        if (identity) {
            log.info('[IdentityRepository] Loaded identity by handle:', handle);
        } else {
            log.info('[IdentityRepository] Identity not found for handle:', handle);
        }

        return identity || null;
    }

    /**
     * Get all identities
     *
     * @returns Array of all encrypted identities
     */
    async list(): Promise<EncryptedIdentity[]> {
        const store = await this.openStore('readonly');
        const request = store.getAll();
        const identities = await this.waitFor<EncryptedIdentity[]>(request);

        log.info('[IdentityRepository] Loaded all identities:', identities.length);
        return identities;
    }

    /**
     * Check if any identity exists
     *
     * @returns True if at least one identity exists
     *
     * @remarks
     * Used to determine if this is a first-time setup
     */
    async hasIdentity(): Promise<boolean> {
        const store = await this.openStore('readonly');
        const request = store.count();
        const count = await this.waitFor<number>(request);

        log.info('[IdentityRepository] Identity count:', count);
        return count > 0;
    }

    /**
     * Get the current identity (there should only be one)
     *
     * @returns EncryptedIdentity if exists, null otherwise
     *
     * @remarks
     * In MM-28, we only support one identity per extension
     * TODO(Epic 2): Multi-identity support
     */
    async getCurrent(): Promise<EncryptedIdentity | null> {
        const identities = await this.list();

        if (identities.length === 0) {
            log.info('[IdentityRepository] No identity found');
            return null;
        } else if (identities.length === 1) {
            log.info('[IdentityRepository] Current identity:', identities[0].did);
            return identities[0];
        } else {
            log.warn('[IdentityRepository] Multiple identities found:', identities.length);
            // For now, return the first one
            // TODO(Epic 2): Handle multiple identities properly
            return identities[0];
        }
    }

    /**
     * Delete identity by DID
     *
     * @param did - DID to delete
     *
     * @remarks
     * WARNING: This permanently deletes the identity
     * User cannot recover without passphrase
     */
    async delete(did: string): Promise<void> {
        const store = await this.openStore();
        const request = store.delete(did);
        await this.waitFor(request);

        log.info('[IdentityRepository] Deleted identity:', did);
    }

    /**
     * Clear all identities
     *
     * @remarks
     * WARNING: This permanently deletes all identities
     * Used for reset/cleanup operations
     */
    async clear(): Promise<void> {
        const store = await this.openStore();
        const request = store.clear();
        await this.waitFor(request);

        log.info('[IdentityRepository] Cleared all identities');
    }
}
