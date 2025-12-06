/**
 * Identity Service for Decentralized Identity Management (MM-28)
 *
 * Coordinates identity operations between crypto functions and storage.
 * This service provides the high-level API for identity management.
 *
 * Responsibilities:
 * - Create new identities from passphrases
 * - Load and decrypt existing identities
 * - Validate passphrases
 * - Manage identity lifecycle
 *
 * Architecture:
 * - Uses IdentityRepository for persistent storage
 * - Uses crypto-functions for key derivation and encryption
 * - Maintains in-memory cache of current identity (while unlocked)
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-36): No auto-lock timeout (identity stays in memory)
 * - TODO(MM-36): No rate limiting on passphrase attempts
 * - TODO(Epic 2): No multi-identity support
 * - TODO(Epic 2): No identity backup/export functionality
 */

import log from 'loglevel';
import { IdentityRepository } from './identity-repository.js';
import { DidService } from './did-service.js';
import {
    encryptContent,
    decryptContent,
    generateContentSalt,
    bytesToBase64,
    base64ToBytes,
    generateDIDFromPublicKey,
    deriveIdentitySeed,
    generateKeypairFromSeed,
} from '../crypto.js';
import { createDbRow, DbRow, DidDocument } from '@my-mimisbrunnr/protocol';
import type { IpfsService } from '../ipfs/ipfs-service.js';

/**
 * Minimum passphrase length
 * TODO(MM-35): Add entropy validation beyond length
 */
const MIN_PASSPHRASE_LENGTH = 1;

// ============================================================================
// Types
// ============================================================================

/**
 * Ed25519 identity with DID
 * This is the decrypted, in-memory representation of a user's identity
 *
 * @remarks
 * SECURITY: Never persist this to storage - always encrypt first
 * TODO(MM-36): Implement secure memory clearing when identity no longer needed
 */
export interface Identity extends Omit<DbRow, 'id'> {
    /** DID identifier (did:key:z6Mk...) */
    did: string;
    /** Ed25519 public key (32 bytes) */
    publicKey: Uint8Array;
    /** Ed25519 secret key (64 bytes) */
    secretKey: Uint8Array;
    /** X.com handle (e.g., @alice) */
    handle: string;
}

/**
 * Encrypted identity storage format for IndexedDB
 * Uses passphrase-derived key for encryption
 *
 * @remarks
 * Storage format:
 * - Nonce: Random 24-byte nonce for XSalsa20-Poly1305
 * - Data: Encrypted JSON string of Identity (minus publicKey - derivable from DID)
 * - Salt: Salt used for scrypt key derivation of content encryption key
 *
 * TODO(MM-36): Add encryption-at-rest for IndexedDB (additional layer)
 */
export interface EncryptedIdentity extends Omit<DbRow, 'id'> {
    /** DID identifier (stored in plaintext for lookups) */
    did: string;
    /** X.com handle (stored in plaintext for lookups) */
    handle: string;
    /** Encrypted Identity (base64) */
    encryptedData: string;
    /** Nonce for decryption (base64) */
    nonce: string;
    /** Salt for content encryption key derivation (base64) */
    contentSalt: string;
}

// ============================================================================
// Identity Service Class
// ============================================================================

/**
 * Service for managing decentralized identities
 *
 * This service coordinates between cryptographic operations and persistent
 * storage, providing a high-level API for identity management.
 */
export class IdentityService {
    private identityRepository = new IdentityRepository();
    private currentIdentity: Identity | null = null;
    private currentPassphrase: string | null = null;
    private didService: DidService | null = null;

    constructor(ipfsService: IpfsService) {
        this.didService = new DidService(ipfsService);
    }

    /**
     * Close the service and clear sensitive data
     *
     * @remarks
     * TODO(MM-36): Implement secure memory clearing
     */
    close(): void {
        this.lock();
        this.identityRepository.close();
        log.info('[IdentityService] Service closed');
    }

    // ========================================================================
    // Identity Creation
    // ========================================================================

    /**
     * Validate passphrase meets minimum requirements
     *
     * @param passphrase - User's passphrase
     * @returns Error message if invalid, null if valid
     *
     * @remarks
     * TODO(MM-35): Add entropy/strength validation
     * TODO(MM-36): Add rate limiting to prevent brute force
     */
    private validatePassphrase(passphrase: string): string | null {
        if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
            return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`;
        }
        return null;
    }

    // ============================================================================
    // Identity Generation
    // ============================================================================

    /**
     * Generate complete identity from passphrase
     * This is the main entry point for identity creation
     *
     * @param passphrase - User's passphrase
     * @param handle - X.com handle (e.g., @alice)
     * @returns Complete Identity object
     *
     * @remarks
     * Process:
     * 1. Validate passphrase
     * 2. Derive seed using constant IDENTITY_SALT
     * 3. Generate Ed25519 keypair from seed
     * 4. Generate DID from public key
     * 5. Create Identity object
     *
     * TODO(MM-36): Add timing attack protection
     */
    private async generateIdentity(
        passphrase: string,
        handle: string
    ): Promise<Identity> {
        // Validate passphrase
        const validationError = this.validatePassphrase(passphrase);
        if (validationError) {
            throw new Error(validationError);
        }

        // Validate handle format
        if (
            !handle.startsWith('@') ||
            handle.length < 2 ||
            handle.length > 16
        ) {
            throw new Error('Invalid handle format');
        }

        // Derive identity seed
        const seed = await deriveIdentitySeed(passphrase);

        // Generate keypair
        const keypair = generateKeypairFromSeed(seed);

        // Generate DID
        const did = generateDIDFromPublicKey(keypair.publicKey);

        // Create identity
        const identity: Identity = {
            ...createDbRow(),
            did,
            publicKey: keypair.publicKey,
            secretKey: keypair.secretKey,
            handle,
        };

        // TODO(MM-36): Clear sensitive data
        // seed.fill(0);

        return identity;
    }

    /**
     * Verify that a passphrase can derive a specific identity
     * Used for identity loading/validation
     *
     * @param passphrase - User's passphrase
     * @param expectedDID - Expected DID
     * @returns True if passphrase derives the expected DID
     */
    private async verifyPassphrase(
        passphrase: string,
        expectedDID: string
    ): Promise<boolean> {
        try {
            const seed = await deriveIdentitySeed(passphrase);
            const keypair = generateKeypairFromSeed(seed);
            const derivedDID = generateDIDFromPublicKey(keypair.publicKey);

            // TODO(MM-36): Clear sensitive data
            // seed.fill(0);

            return derivedDID === expectedDID;
        } catch {
            return false;
        }
    }

    /**
     * Create a new identity from passphrase and handle
     *
     * @param passphrase - User's passphrase
     * @param handle - X.com handle (e.g., @alice)
     * @returns Created Identity
     * @throws Error if passphrase invalid, handle invalid, or identity already exists
     *
     * @remarks
     * Process:
     * 1. Validate passphrase and handle
     * 2. Check no identity exists (single identity per extension)
     * 3. Generate identity using crypto functions
     * 4. Encrypt identity for storage
     * 5. Save to IndexedDB
     * 6. Set as current identity (auto-unlock)
     */
    async createIdentity(
        passphrase: string,
        handle: string
    ): Promise<Identity> {
        log.info('[IdentityService] Creating new identity for handle:', handle);

        // Validate passphrase
        const passphraseError = this.validatePassphrase(passphrase);
        if (passphraseError) {
            throw new Error(passphraseError);
        }

        // Check if identity already exists
        const hasExisting = await this.identityRepository.hasIdentity();
        if (hasExisting) {
            throw new Error(
                'Identity already exists. Delete existing identity before creating new one.'
            );
        }

        // Generate identity
        const identity = await this.generateIdentity(passphrase, handle);

        log.info('[IdentityService] Generated identity:', identity.did);

        // Encrypt identity for storage
        const encryptedIdentity = await this.encryptIdentity(
            identity,
            passphrase
        );

        // Save to storage
        await this.identityRepository.save(encryptedIdentity);

        // Set as current identity (auto-unlock)
        this.currentIdentity = identity;
        this.currentPassphrase = passphrase;

        log.info('[IdentityService] Identity created and unlocked');

        return identity;
    }

    // ========================================================================
    // Identity Loading and Unlocking
    // ========================================================================

    /**
     * Load and unlock identity with passphrase
     *
     * @param passphrase - User's passphrase
     * @returns Decrypted Identity
     * @throws Error if no identity exists or passphrase incorrect
     *
     * @remarks
     * This loads the current identity (there should only be one)
     * TODO(MM-36): Add rate limiting to prevent brute force attacks
     */
    async unlockIdentity(passphrase: string): Promise<Identity> {
        log.info('[IdentityService] Unlocking identity...');

        // Get current encrypted identity
        const encryptedIdentity = await this.identityRepository.getCurrent();
        if (!encryptedIdentity) {
            throw new Error('No identity found. Create one first.');
        }

        // Verify passphrase
        const isValid = await this.verifyPassphrase(
            passphrase,
            encryptedIdentity.did
        );
        if (!isValid) {
            log.warn('[IdentityService] Invalid passphrase attempt');
            throw new Error('Invalid passphrase');
        }

        // Decrypt identity
        const identity = await this.decryptIdentity(
            encryptedIdentity,
            passphrase
        );

        // Set as current identity
        this.currentIdentity = identity;
        this.currentPassphrase = passphrase;

        log.info('[IdentityService] Identity unlocked:', identity.did);

        return identity;
    }

    /**
     * Lock the current identity (clear from memory)
     *
     * @remarks
     * TODO(MM-36): Implement secure memory clearing
     */
    lock(): void {
        if (this.currentIdentity) {
            log.info(
                '[IdentityService] Locking identity:',
                this.currentIdentity.did
            );
            this.currentIdentity = null;
            this.currentPassphrase = null;
        }
    }

    /**
     * Check if identity is currently unlocked
     */
    isUnlocked(): boolean {
        return this.currentIdentity !== null;
    }

    /**
     * Get current unlocked identity
     *
     * @returns Current Identity
     */
    getCurrent(): Identity {
        if (!this.isUnlocked()) {
            throw new Error('Identity not unlocked');
        }

        return this.currentIdentity as Identity;
    }

    /**
     * Get current passphrase (for encryption operations)
     *
     * @returns Current passphrase or null if locked
     *
     * @remarks
     * SECURITY: Only use for encryption/decryption operations
     * TODO(MM-36): Consider more secure passphrase caching
     */
    getCurrentPassphrase(): string | null {
        return this.currentPassphrase;
    }

    // ========================================================================
    // Identity Existence Checks
    // ========================================================================

    /**
     * Check if any identity exists
     *
     * @returns True if identity exists
     */
    async hasIdentity(): Promise<boolean> {
        return this.identityRepository.hasIdentity();
    }

    /**
     * Get encrypted identity (without unlocking)
     *
     * @returns EncryptedIdentity or null if none exists
     *
     * @remarks
     * Useful for displaying identity info (DID, handle) without unlocking
     */
    async getEncryptedIdentity(): Promise<EncryptedIdentity | null> {
        return this.identityRepository.getCurrent();
    }

    // ========================================================================
    // Identity Management
    // ========================================================================

    /**
     * Delete current identity
     *
     * @param passphrase - Passphrase for verification
     * @throws Error if passphrase incorrect
     *
     * @remarks
     * WARNING: This is permanent. User cannot recover without passphrase.
     * TODO(MM-36): Add confirmation mechanism
     */
    async delete(passphrase: string): Promise<void> {
        log.warn('[IdentityService] Deleting identity...');

        const encryptedIdentity = await this.identityRepository.getCurrent();
        if (!encryptedIdentity) {
            throw new Error('No identity to delete');
        }

        // Verify passphrase before deletion
        const isValid = await this.verifyPassphrase(
            passphrase,
            encryptedIdentity.did
        );
        if (!isValid) {
            throw new Error('Invalid passphrase - cannot delete identity');
        }

        // Delete from storage
        await this.identityRepository.delete(encryptedIdentity.did);

        // Clear from memory
        this.lock();

        log.warn('[IdentityService] Identity deleted:', encryptedIdentity.did);
    }

    /**
     * Update identity handle
     *
     * @param newHandle - New X.com handle
     * @throws Error if not unlocked
     *
     * @remarks
     * TODO(MM-31): Require new tweet verification after handle change
     */
    async updateHandle(newHandle: string): Promise<void> {
        if (!this.currentIdentity || !this.currentPassphrase) {
            throw new Error('Identity not unlocked');
        }

        log.info('[IdentityService] Updating handle:', newHandle);

        // Update identity object
        this.currentIdentity.handle = newHandle;
        this.currentIdentity.updatedAt = new Date().toISOString();

        // Re-encrypt and save
        const encryptedIdentity = await this.encryptIdentity(
            this.currentIdentity,
            this.currentPassphrase
        );

        await this.identityRepository.save(encryptedIdentity);

        log.info('[IdentityService] Handle updated');
    }

    // ========================================================================
    // Encryption/Decryption Helpers
    // ========================================================================

    /**
     * Encrypt identity for storage
     *
     * @param identity - Identity to encrypt
     * @param passphrase - User's passphrase
     * @returns EncryptedIdentity
     */
    private async encryptIdentity(
        identity: Identity,
        passphrase: string
    ): Promise<EncryptedIdentity> {
        // Generate content salt for this encryption
        const contentSalt = generateContentSalt();

        // Prepare data to encrypt (without publicKey - derivable from DID)
        const dataToEncrypt = {
            ...identity,
            // Convert to array for JSON
            secretKey: Array.from(identity.secretKey),
            publicKey: Array.from(identity.publicKey),
        };

        // Encrypt
        const { encryptedData, nonce } = await encryptContent(
            dataToEncrypt,
            passphrase,
            contentSalt
        );

        // Create encrypted identity
        const encryptedIdentity: EncryptedIdentity = {
            did: identity.did,
            handle: identity.handle,
            encryptedData,
            nonce,
            contentSalt: bytesToBase64(contentSalt),
            createdAt: identity.createdAt,
            updatedAt: identity.updatedAt,
        };

        return encryptedIdentity;
    }

    /**
     * Decrypt identity from storage
     *
     * @param encryptedIdentity - Encrypted identity
     * @param passphrase - User's passphrase
     * @returns Decrypted Identity
     */
    private async decryptIdentity(
        encryptedIdentity: EncryptedIdentity,
        passphrase: string
    ): Promise<Identity> {
        // Decode content salt
        const contentSalt = base64ToBytes(encryptedIdentity.contentSalt);

        // Decrypt
        const decryptedData = await decryptContent<
            Identity & { secretKey: number[]; publicKey: number[] }
        >(
            encryptedIdentity.encryptedData,
            encryptedIdentity.nonce,
            passphrase,
            contentSalt
        );

        // Reconstruct identity
        const identity: Identity = {
            ...decryptedData,
            publicKey: new Uint8Array(decryptedData.publicKey),
            secretKey: new Uint8Array(decryptedData.secretKey),
        };

        return identity;
    }

    // ========================================================================
    // Content Encryption Utilities (for use by other services)
    // ========================================================================

    /**
     * Encrypt content using current identity's passphrase
     *
     * @param content - Content to encrypt
     * @returns Encrypted data, nonce, and salt
     * @throws Error if identity not unlocked
     *
     * @remarks
     * This method is used by other services (e.g., IpfsService) to encrypt
     * content for publishing
     */
    async encryptContent(content: unknown): Promise<{
        encryptedData: string;
        nonce: string;
        salt: string;
    }> {
        if (!this.currentPassphrase) {
            throw new Error('Identity not unlocked - cannot encrypt content');
        }

        const salt = generateContentSalt();
        const { encryptedData, nonce } = await encryptContent(
            content,
            this.currentPassphrase,
            salt
        );

        return {
            encryptedData,
            nonce,
            salt: bytesToBase64(salt),
        };
    }

    /**
     * Decrypt content using current identity's passphrase
     *
     * @param encryptedData - Encrypted data (base64)
     * @param nonce - Nonce (base64)
     * @param salt - Salt (base64)
     * @returns Decrypted content
     * @throws Error if identity not unlocked
     *
     * @remarks
     * This method is used by other services to decrypt retrieved content
     */
    async decryptContent<T = unknown>(
        encryptedData: string,
        nonce: string,
        salt: string
    ): Promise<T> {
        if (!this.currentPassphrase) {
            throw new Error('Identity not unlocked - cannot decrypt content');
        }

        const saltBytes = base64ToBytes(salt);
        return decryptContent<T>(
            encryptedData,
            nonce,
            this.currentPassphrase,
            saltBytes
        );
    }

    // ========================================================================
    // DID Operations (MM-29)
    // ========================================================================

    private getDidService(): DidService {
        if (!this.didService) {
            throw new Error('DID service not initialized');
        }
        return this.didService;
    }

    /**
     * Build DID document for current identity
     *
     * @param manifestCid - CID of encrypted user manifest
     * @param proofUrl - Optional tweet proof URL
     * @returns Complete DID document
     * @throws Error if identity not unlocked or DID service not initialized
     *
     * @remarks
     * This is a convenience wrapper around DidService.buildDidDocument
     * that uses the current identity.
     */
    buildDidDocument(manifestCid: string, proofUrl?: string): DidDocument {
        const identity = this.getCurrent();

        return this.getDidService().buildDidDocument(
            identity,
            manifestCid,
            proofUrl
        );
    }

    /**
     * Publish DID document for current identity to IPFS and IPNS
     *
     * @param manifestCid - CID of encrypted user manifest
     * @param proofUrl - Optional tweet proof URL
     * @returns Object containing DID document CID and IPNS key
     * @throws Error if identity not unlocked or DID service not initialized
     *
     * @remarks
     * This is the primary method for publishing identity to the decentralized network.
     * It coordinates:
     * 1. Building the DID document
     * 2. Publishing to IPFS (with pinning)
     * 3. Publishing to IPNS for mutable addressing
     */
    async publishDidDocument(
        manifestCid: string,
        proofUrl?: string
    ): Promise<{ didDocumentCid: string; ipnsKey: string }> {
        const identity = this.getCurrent();

        return this.getDidService().publishDidDocument(
            identity,
            manifestCid,
            proofUrl
        );
    }

    /**
     * Retrieve DID document from IPFS/IPNS
     *
     * @param cid - CID of DID document
     * @returns DID document
     * @throws Error if DID service not initialized
     *
     * @remarks
     * Can be called without an unlocked identity since it's retrieving
     * someone else's DID document.
     */
    async retrieveDidDocument(cid: string): Promise<DidDocument> {
        return this.getDidService().retrieveDidDocument(cid);
    }
}
