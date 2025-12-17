import log from 'loglevel';
import type { ExtensionOrbitDbManager } from './extension-orbitdb-manager.js';
import { sha256Hash } from '../crypto.js';
import type { DiscoveryRecord } from '@my-mimisbrunnr/protocol';

/**
 * Normalize handle format
 * Ensures consistent format: @lowercase
 *
 * @param handle - Raw handle input
 * @returns Normalized handle with @ prefix
 */
export function normalizeHandle(handle: string): string {
    const withoutAt = handle.startsWith('@') ? handle.slice(1) : handle;
    return `@${withoutAt.toLowerCase()}`;
}

/**
 * Generate lookup key from X.com handle
 *
 * Per technical spec section 2.3:
 * lookupKey = SHA-256(lowercase(handle)) — stable, opaque index key
 *
 * @param handle - X.com handle (e.g., "@alice" or "alice")
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * ```typescript
 * generateLookupKey("@Alice") // => "abc123..." (SHA-256 of "@alice")
 * generateLookupKey("alice")  // => "abc123..." (same result - @ is normalized)
 * ```
 */
export function generateLookupKey(handle: string): string {
    // Normalize handle: ensure @ prefix and lowercase
    const normalized = normalizeHandle(handle);

    // Return hash
    return sha256Hash(normalized);
}

/**
 * Validate handle format
 * X.com handles must be:
 * - Start with @ (optional, will be added)
 * - 1-15 characters (not including @)
 * - Only letters, numbers, underscores
 *
 * @param handle - Handle to validate
 * @returns true if valid
 */
export function isValidHandle(handle: string): boolean {
    const normalized = normalizeHandle(handle);
    return /^@[a-zA-Z0-9_]{1,15}$/.test(normalized);
}

/**
 * Discovery Service for MM-30
 *
 * This service manages discovery records in OrbitDB, implementing handle-based
 * discovery with Last-Write-Wins (LWW) conflict resolution.
 *
 * Core responsibilities:
 * - Generate lookup keys (SHA-256 of lowercase handle)
 * - Add discovery records to OrbitDB log
 * - Query records by handle with LWW selection
 * - Implement timestamp-based conflict resolution
 *
 * Last-Write-Wins (LWW) Strategy (per technical spec section 2.6):
 * - When multiple records exist for the same handle, select the one with the highest timestamp
 * - This handles cases where:
 *   1. A user publishes from multiple devices
 *   2. Network partitions cause conflicting records
 *   3. A user updates their manifest
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-35): No timestamp monotonicity - older records can overwrite newer ones
 * - TODO(MM-35): No signature verification - discovery records accepted without cryptographic proof
 * - TODO(MM-31): No tweet verification - no proof URL validation
 * - TODO(MM-34): No caching - queries always scan full OrbitDB log
 * - TODO(MM-36): No rate limiting - no protection against spam
 * - TODO(MM-35): No fallback validation - no backup when tweet proof unavailable
 */
export class DiscoveryService {
    constructor(private orbitdbService: ExtensionOrbitDbManager) {}

    /**
     * Publish discovery record for current user
     *
     * This method creates a discovery record linking the user's handle to their
     * IPNS key and DID, then adds it to the OrbitDB discovery log.
     *
     * Per technical spec section 3.4, discovery records are created after publishing
     * the user's manifest and DID document to IPFS/IPNS.
     *
     * @param handle - X.com handle (e.g., "@alice")
     * @param ipnsKey - IPNS key (k51qzi5uqu5d... format)
     * @param did - DID identifier (did:key:z6Mk... format)
     *
     * @remarks
     * TODO(MM-35): Add signature to discovery record for verification
     * TODO(MM-36): Add retry logic with exponential backoff
     * TODO(MM-36): Add rate limiting
     * TODO(MM-35): Validate inputs before publishing
     */
    async publishDiscovery(
        handle: string,
        ipnsKey: string,
        did: string
    ): Promise<void> {
        if (!this.orbitdbService.isInitialized()) {
            throw new Error('OrbitDB service not initialized');
        }

        // Validate handle
        if (!isValidHandle(handle)) {
            throw new Error(`Invalid handle format: ${handle}`);
        }

        // TODO(MM-35): Validate IPNS key format
        // TODO(MM-35): Validate DID format

        try {
            const normalized = normalizeHandle(handle);
            const lookupKey = generateLookupKey(normalized);
            const now = Date.now();

            log.info('[DiscoveryService] Publishing discovery record:', {
                handle: normalized,
                lookupKey,
                ipnsKey,
                did,
            });

            // Create discovery record
            const record: DiscoveryRecord = {
                lookupKey,
                handle: normalized,
                ipnsKey,
                did,
                createdAt: now,
                updatedAt: now,
                // TODO(MM-35): Add signature
                // sig: signRecord(record, privateKey),
            };

            // Add to OrbitDB log
            const db = this.orbitdbService.getDatabase();
            if (!db) {
                throw new Error('Discovery log database not available');
            }

            // Add record to OrbitDB events log
            const hash = await db.add(record);

            log.info(
                '[DiscoveryService] Discovery record published successfully:',
                {
                    hash,
                    lookupKey,
                    handle: normalized,
                }
            );

            // TODO(MM-34): Update cache with new record
        } catch (error) {
            log.error(
                '[DiscoveryService] Failed to publish discovery record:',
                error
            );
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Update existing discovery record
     *
     * Updates an existing record with a new timestamp. This is used when a user
     * republishes their manifest (e.g., after updating tags).
     *
     * @param handle - X.com handle
     * @param ipnsKey - IPNS key (should remain same for user)
     * @param did - DID identifier (should remain same for user)
     *
     * @remarks
     * TODO(MM-35): Implement timestamp monotonicity check
     * TODO(MM-36): Add optimistic locking to prevent race conditions
     */
    async updateDiscovery(
        handle: string,
        ipnsKey: string,
        did: string
    ): Promise<void> {
        // For MM-30, update is the same as publish (just adds new record with newer timestamp)
        // LWW logic will select the newest record
        // TODO(MM-35): Add check that new timestamp > old timestamp (monotonicity)
        await this.publishDiscovery(handle, ipnsKey, did);
    }

    /**
     * Discover user by handle
     *
     * Queries the OrbitDB discovery log for records matching the given handle,
     * then applies Last-Write-Wins (LWW) logic to select the most recent record.
     *
     * LWW Algorithm:
     * 1. Generate lookup key from handle
     * 2. Query OrbitDB log for all records with that lookup key
     * 3. Filter records to ensure handle matches (defense against hash collisions)
     * 4. Sort by updatedAt timestamp (descending)
     * 5. Return record with highest timestamp
     *
     * @param handle - X.com handle to look up (e.g., "@alice" or "alice")
     * @returns Discovery record or null if not found
     *
     * @remarks
     * TODO(MM-34): Check cache before querying OrbitDB
     * TODO(MM-36): Add timeout (2s as per spec)
     * TODO(MM-35): Validate returned record structure
     * TODO(MM-35): Verify record signature
     * TODO(MM-36): Add telemetry for query performance
     */
    async discoverByHandle(handle: string): Promise<DiscoveryRecord | null> {
        if (!this.orbitdbService.isInitialized()) {
            throw new Error('OrbitDB service not initialized');
        }

        if (!isValidHandle(handle)) {
            throw new Error(`Invalid handle format: ${handle}`);
        }

        try {
            const normalized = normalizeHandle(handle);
            const lookupKey = generateLookupKey(normalized);

            log.info('[DiscoveryService] Discovering user by handle:', {
                handle: normalized,
                lookupKey,
            });

            // TODO(MM-34): Check cache first
            // const cached = await this.cache.get(lookupKey);
            // if (cached) return cached;

            // Get database
            const db = this.orbitdbService.getDatabase();
            if (!db) {
                throw new Error('Discovery log database not available');
            }

            // Query all records from OrbitDB log
            // TODO(MM-36): Add timeout wrapper
            const allRecords = (await db.all()) as unknown[];

            log.debug(
                '[DiscoveryService] Queried OrbitDB log:',
                `Total records: ${allRecords.length}`
            );

            // Filter records by lookup key
            const matchingRecords = allRecords
                .map(entry => (entry as { value: DiscoveryRecord }).value)
                .filter(
                    (record): record is DiscoveryRecord =>
                        record !== undefined &&
                        record.lookupKey === lookupKey &&
                        record.handle === normalized
                );

            log.debug('[DiscoveryService] Matching records found:', {
                count: matchingRecords.length,
                lookupKey,
            });

            if (matchingRecords.length === 0) {
                log.info(
                    '[DiscoveryService] No discovery record found for handle:',
                    normalized
                );
                return null;
            }

            // Apply Last-Write-Wins: select record with highest updatedAt timestamp
            const latestRecord = this.selectLatestRecord(matchingRecords);

            log.info('[DiscoveryService] Discovery successful:', {
                handle: normalized,
                ipnsKey: latestRecord?.ipnsKey,
                did: latestRecord?.did,
                updatedAt: latestRecord?.updatedAt
                    ? new Date(latestRecord.updatedAt).toISOString()
                    : undefined,
            });

            // TODO(MM-34): Cache result
            // await this.cache.set(lookupKey, latestRecord);

            // TODO(MM-35): Validate record structure
            // TODO(MM-35): Verify signature

            return latestRecord;
        } catch (error) {
            log.error(
                '[DiscoveryService] Failed to discover user by handle:',
                error
            );
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Select latest record using Last-Write-Wins (LWW) logic
     *
     * Per technical spec section 2.6:
     * "Last-Write-Wins (LWW) semantics on timestamp per handle (client chooses max)"
     *
     * This method implements the LWW conflict resolution strategy by selecting
     * the record with the highest updatedAt timestamp.
     *
     * @param records - Array of discovery records for the same handle
     * @returns Record with highest timestamp or null if empty array
     *
     * @remarks
     * TODO(MM-35): Add timestamp validation (ensure not in future, not too old)
     * TODO(MM-35): Add monotonicity check (reject if timestamp <= known timestamp)
     * TODO(MM-36): Add telemetry for conflict resolution
     */
    private selectLatestRecord(
        records: DiscoveryRecord[]
    ): DiscoveryRecord | null {
        if (records.length === 0) {
            return null;
        }

        // Sort by updatedAt timestamp descending
        const sorted = records.sort((a, b) => b.updatedAt - a.updatedAt);

        // Return record with highest timestamp
        const latest = sorted[0];

        // Log if there were conflicts (multiple records for same handle)
        if (records.length > 1) {
            log.debug('[DiscoveryService] LWW conflict resolution:', {
                totalRecords: records.length,
                selectedTimestamp: new Date(latest.updatedAt).toISOString(),
                rejectedCount: records.length - 1,
            });
            // TODO(MM-36): Add telemetry for conflict frequency
        }

        return latest;
    }

    /**
     * Get all discovery records (for debugging/admin)
     *
     * @returns All records in the discovery log
     *
     * @remarks
     * This is primarily for debugging and testing. In production, use
     * discoverByHandle() for targeted queries.
     *
     * TODO(MM-36): Add pagination for large result sets
     * TODO(MM-36): Add filtering options
     */
    async getAllRecords(): Promise<DiscoveryRecord[]> {
        if (!this.orbitdbService.isInitialized()) {
            throw new Error('OrbitDB service not initialized');
        }

        try {
            const db = this.orbitdbService.getDatabase();
            if (!db) {
                throw new Error('Discovery log database not available');
            }

            const allRecords = (await db.all()) as unknown[];
            return allRecords
                .map(entry => (entry as { value: DiscoveryRecord }).value)
                .filter((record): record is DiscoveryRecord => !!record);
        } catch (error) {
            log.error('[DiscoveryService] Failed to get all records:', error);
            throw error;
        }
    }
}
