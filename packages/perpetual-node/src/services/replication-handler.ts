// Simple replication handler for OrbitDB entries with basic validation and pinning
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import { config } from '../config/environment.js';
import { replicationLogger } from '../utils/logging.js';
import type { IpfsNode } from './ipfs-client.js';
import type { LogEntry } from '../types/orbitdb.js';

interface PinnedEntry {
    hash: string;
    cid: string;
    timestamp: number;
    size?: number;
    valid: boolean;
}

export class ReplicationHandler {
    private ipfsClient: IpfsNode;
    private pinnedEntries: Map<string, PinnedEntry> = new Map();
    private cleanupInterval?: NodeJS.Timeout;
    private totalEntriesProcessed = 0;
    private totalEntriesPinned = 0;
    private totalEntriesRejected = 0;

    constructor(ipfsClient: IpfsNode) {
        this.ipfsClient = ipfsClient;
        this.startCleanupInterval();
        replicationLogger.info('✅ Replication handler initialized');
    }

    /**
     * Handle a new OrbitDB entry from replication
     */
    async handleNewEntry(entry: LogEntry<DiscoveryRecord>): Promise<void> {
        this.totalEntriesProcessed++;

        try {
            replicationLogger.debug(`🔄 Processing new entry`, {
                hash: entry.hash,
                author: entry.identity.id,
            });

            // Basic format validation using shared validation utilities
            const isValid = this.validateEntry(entry.payload.value);

            if (!isValid) {
                this.totalEntriesRejected++;
                replicationLogger.warn(`❌ Entry validation failed`, {
                    hash: entry.hash,
                    payload: entry.payload.value,
                });

                // Still track the entry but mark as invalid
                this.pinnedEntries.set(entry.hash, {
                    hash: entry.hash,
                    cid: entry.hash, // Using hash as CID for invalid entries
                    timestamp: Date.now(),
                    valid: false,
                });
                return;
            }

            // Pin the entry content to IPFS
            await this.pinEntryContent(entry.hash);

            // Track the entry
            this.pinnedEntries.set(entry.hash, {
                hash: entry.hash,
                cid: entry.hash,
                timestamp: Date.now(),
                valid: true,
            });

            this.totalEntriesPinned++;

            replicationLogger.info(`✅ Entry processed successfully`, {
                hash: entry.hash,
                handle: entry.payload.value.handle,
                did: entry.payload.value.did,
                totalProcessed: this.totalEntriesProcessed,
                totalPinned: this.totalEntriesPinned,
            });
        } catch (error) {
            this.totalEntriesRejected++;
            replicationLogger.error('❌ Error processing entry', {
                hash: entry.hash,
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    /**
     * Pin entry content to IPFS with size limits
     */
    async pinEntryContent(entryCid: string): Promise<void> {
        try {
            // Check if we've already pinned this entry
            if (this.pinnedEntries.has(entryCid)) {
                replicationLogger.debug(`📌 Entry already pinned: ${entryCid}`);
                return;
            }

            // Pin the content using the IPFS client
            const pinResult = await this.ipfsClient.pinContent({
                cid: entryCid,
                recursive: false, // Single-block pinning for security
                clientIP: 'orbitdb-replication', // Internal replication
                timestamp: Date.now(),
            });

            if (!pinResult.success) {
                throw new Error(pinResult.error || 'Pin operation failed');
            }

            replicationLogger.debug(`📌 Entry content pinned: ${entryCid}`, {
                size: pinResult.size,
            });
        } catch (error) {
            replicationLogger.error(
                `❌ Failed to pin entry content: ${entryCid}`,
                {
                    error: error instanceof Error ? error.message : error,
                }
            );
            throw error;
        }
    }

    /**
     * Basic entry validation using shared validation utilities
     */
    private validateEntry(entry: DiscoveryRecord): boolean {
        try {
            // Use shared validation function
            const isValid = validateDiscoveryRecord(entry);

            if (!isValid) {
                replicationLogger.debug('Entry failed shared validation', {
                    entry,
                });
                return false;
            }

            // Additional basic checks
            if (!entry.lookupKey || entry.lookupKey.length === 0) {
                replicationLogger.debug('Entry missing lookupKey', { entry });
                return false;
            }

            if (!entry.handle || entry.handle.length === 0) {
                replicationLogger.debug('Entry missing handle', { entry });
                return false;
            }

            if (!entry.did || entry.did.length === 0) {
                replicationLogger.debug('Entry missing DID', { entry });
                return false;
            }

            // Check timestamps are reasonable (not in future, not too old)
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

            if (entry.createdAt > now + 60000) {
                // Allow 1 minute clock skew
                replicationLogger.debug('Entry createdAt is in the future', {
                    entry,
                });
                return false;
            }

            if (entry.createdAt < oneYearAgo) {
                replicationLogger.debug('Entry createdAt is too old', {
                    entry,
                });
                return false;
            }

            return true;
        } catch (error) {
            replicationLogger.error('Error validating entry', {
                entry,
                error: error instanceof Error ? error.message : error,
            });
            return false;
        }
    }

    /**
     * Get replication statistics
     */
    getReplicationStats(): {
        totalProcessed: number;
        totalPinned: number;
        totalRejected: number;
        pinnedEntries: number;
        validEntries: number;
        invalidEntries: number;
    } {
        const validEntries = Array.from(this.pinnedEntries.values()).filter(
            e => e.valid
        ).length;
        const invalidEntries = Array.from(this.pinnedEntries.values()).filter(
            e => !e.valid
        ).length;

        return {
            totalProcessed: this.totalEntriesProcessed,
            totalPinned: this.totalEntriesPinned,
            totalRejected: this.totalEntriesRejected,
            pinnedEntries: this.pinnedEntries.size,
            validEntries,
            invalidEntries,
        };
    }

    /**
     * Get list of pinned entries
     */
    getPinnedEntries(): PinnedEntry[] {
        return Array.from(this.pinnedEntries.values());
    }

    /**
     * Start cleanup interval for old entries
     */
    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldEntries();
        }, config.operational.storageCleanupInterval);
    }

    /**
     * Clean up very old entries (storage management only)
     */
    async cleanupOldEntries(): Promise<void> {
        try {
            const now = Date.now();
            const cutoff = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago
            let cleaned = 0;

            // Only clean up if we exceed the maximum pinned entries limit
            if (
                this.pinnedEntries.size <=
                config.operational.maxLogEntriesPinned
            ) {
                return;
            }

            // Find old entries to clean up
            const oldEntries = Array.from(this.pinnedEntries.entries())
                .filter(([_hash, entry]) => entry.timestamp < cutoff)
                .sort(([, a], [, b]) => a.timestamp - b.timestamp); // Oldest first

            // Calculate how many to remove
            const excessEntries =
                this.pinnedEntries.size -
                config.operational.maxLogEntriesPinned;
            const toRemove = Math.min(oldEntries.length, excessEntries);

            if (toRemove <= 0) {
                return;
            }

            replicationLogger.info(`🧹 Starting cleanup of old entries`, {
                totalPinned: this.pinnedEntries.size,
                maxAllowed: config.operational.maxLogEntriesPinned,
                toRemove,
            });

            // Remove old entries
            for (let i = 0; i < toRemove; i++) {
                const [hash, entry] = oldEntries[i];

                try {
                    // Unpin from IPFS (if it was valid)
                    if (entry.valid && entry.cid) {
                        await this.ipfsClient.unpinContent(entry.cid);
                    }

                    // Remove from tracking
                    this.pinnedEntries.delete(hash);
                    cleaned++;
                } catch (error) {
                    replicationLogger.warn(`Failed to cleanup entry: ${hash}`, {
                        error: error instanceof Error ? error.message : error,
                    });
                }
            }

            if (cleaned > 0) {
                replicationLogger.info(`🧹 Cleaned up ${cleaned} old entries`, {
                    remaining: this.pinnedEntries.size,
                });
            }
        } catch (error) {
            replicationLogger.error('Error during cleanup', {
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        const stats = this.getReplicationStats();
        replicationLogger.info('🛑 Replication handler shutdown', { stats });
    }
}
