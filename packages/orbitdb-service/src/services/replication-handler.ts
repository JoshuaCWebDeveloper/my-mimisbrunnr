// Simple replication handler for OrbitDB entries with basic validation and pinning
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import { Logger } from '../logger/logger.js';
import {
    HealthService,
    HealthProvider,
    HealthStatus,
} from '../health/health.service.js';
import { IpfsClient } from './ipfs-client.js';
import type { LogEntry } from './orbitdb-service-manager.js';
import { HeliaNode } from './helia-node.js';
import { CID } from 'multiformats/cid';

interface PinnedContent {
    content: unknown;
    cid: string;
    timestamp: number;
    size?: number;
    valid: boolean;
}

@Injectable()
export class ReplicationHandler implements OnModuleDestroy, HealthProvider {
    private pinnedContent: Map<string, PinnedContent> = new Map();
    private cleanupInterval?: NodeJS.Timeout;
    private totalEntriesProcessed = 0;
    private totalEntriesPinned = 0;
    private totalEntriesRejected = 0;

    constructor(
        private readonly heliaNode: HeliaNode,
        private readonly ipfsClient: IpfsClient,
        private readonly healthService: HealthService,
        private readonly logger: Logger,
        private readonly configService: ConfigService
    ) {
        this.startCleanupInterval();
        // Register with health service
        this.healthService.registerService('replication', this);
        this.logger.info('✅ Replication handler created');
    }

    async onModuleDestroy() {
        this.healthService.unregisterService('replication');
        await this.shutdown();
    }

    async handleNewManifest(cid: string, manifest: unknown): Promise<void> {
        try {
            this.logger.debug(`🔄 Processing new manifest`, {
                manifest,
            });

            await this.pinContent(cid);

            this.logger.info(`✅ Manifest pinned: ${cid}`, {
                manifest,
            });
        } catch (error) {
            this.logger.error(`❌ Error pinning manifest: ${cid}`, {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Handle a new OrbitDB entry from replication
     */
    async handleNewEntry(entry: LogEntry<DiscoveryRecord>): Promise<void> {
        this.totalEntriesProcessed++;

        try {
            this.logger.debug(`🔄 Processing new entry`, {
                hash: entry.hash,
                author: entry.identity.id,
            });

            // Basic format validation using shared validation utilities
            const isValid = this.validateEntry(entry.payload.value);

            if (!isValid) {
                this.totalEntriesRejected++;
                this.logger.warn(`❌ Entry validation failed`, {
                    hash: entry.hash,
                    payload: entry.payload.value,
                });

                // Still track the entry but mark as invalid
                this.pinnedContent.set(entry.hash, {
                    content: entry,
                    cid: entry.hash,
                    timestamp: Date.now(),
                    valid: false,
                } as PinnedContent);
                return;
            }

            // Pin the entry content to IPFS
            await this.pinContent(entry.hash);

            this.totalEntriesPinned++;

            this.logger.info(`✅ Entry processed successfully`, {
                hash: entry.hash,
                handle: entry.payload.value.handle,
                did: entry.payload.value.did,
                totalProcessed: this.totalEntriesProcessed,
                totalPinned: this.totalEntriesPinned,
            });
        } catch (error) {
            this.totalEntriesRejected++;
            this.logger.error('❌ Error processing entry', {
                hash: entry.hash,
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    /**
     * Pin content to IPFS with size limits
     */
    private async pinContent(cidString: string): Promise<void> {
        if (!this.ipfsClient || !this.heliaNode) {
            throw new Error('IPFS client or Helia node not initialized');
        }

        // Check if we've already pinned this entry
        if (this.pinnedContent.has(cidString)) {
            this.logger.debug(`📌 Content already pinned: ${cidString}`);
            return;
        }

        try {
            this.logger.info(
                'Pinning content to perpetual node via dag/put:',
                cidString
            );

            const cid = CID.parse(cidString);

            // Get the raw block data from Helia's blockstore
            const blockData = await this.heliaNode.blockstore.get(cid);

            this.logger.info(
                'Retrieved block from local blockstore:',
                `CID: ${cidString}, Size: ${blockData.length} bytes`
            );

            // Upload block to Kubo using dag/put with pin=true
            // The dag/put endpoint will validate content via validation-proxy
            const remoteCid = await this.ipfsClient.putDagContent(blockData, {
                storeCodec: 'dag-cbor',
                inputCodec: 'dag-cbor',
                pin: true,
            });

            this.logger.info(
                'Content uploaded via dag/put:',
                `Local CID: ${cidString}, Remote CID: ${remoteCid.cid}`
            );

            // Verify CID matches
            if (remoteCid.cid !== cidString) {
                throw new Error(
                    `CID mismatch: local=${cidString}, remote=${remoteCid.cid}`
                );
            }

            this.logger.info(
                'Content pinned successfully with verified CID:',
                cidString
            );

            // Track the entry
            this.pinnedContent.set(cidString, {
                content: blockData,
                cid: remoteCid.cid,
                timestamp: Date.now(),
                valid: true,
            } as PinnedContent);
        } catch (error) {
            this.logger.error('Failed to pin content:', error);
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
                this.logger.debug('Entry failed shared validation', {
                    entry,
                });
                return false;
            }

            // Additional basic checks
            if (!entry.lookupKey || entry.lookupKey.length === 0) {
                this.logger.debug('Entry missing lookupKey', {
                    entry,
                });
                return false;
            }

            if (!entry.handle || entry.handle.length === 0) {
                this.logger.debug('Entry missing handle', {
                    entry,
                });
                return false;
            }

            if (!entry.did || entry.did.length === 0) {
                this.logger.debug('Entry missing DID', {
                    entry,
                });
                return false;
            }

            // Check timestamps are reasonable (not in future, not too old)
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

            if (entry.createdAt > now + 60000) {
                // Allow 1 minute clock skew
                this.logger.debug('Entry createdAt is in the future', {
                    entry,
                });
                return false;
            }

            if (entry.createdAt < oneYearAgo) {
                this.logger.debug('Entry createdAt is too old', {
                    entry,
                });
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error('Error validating entry', {
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
        const validEntries = Array.from(this.pinnedContent.values()).filter(
            e => e.valid
        ).length;
        const invalidEntries = Array.from(this.pinnedContent.values()).filter(
            e => !e.valid
        ).length;

        return {
            totalProcessed: this.totalEntriesProcessed,
            totalPinned: this.totalEntriesPinned,
            totalRejected: this.totalEntriesRejected,
            pinnedEntries: this.pinnedContent.size,
            validEntries,
            invalidEntries,
        };
    }

    /**
     * Get list of pinned entries
     */
    getPinnedEntries(): PinnedContent[] {
        return Array.from(this.pinnedContent.values());
    }

    /**
     * Start cleanup interval for old entries
     */
    private startCleanupInterval(): void {
        const appConfig = this.configService.get('app');

        this.cleanupInterval = setInterval(() => {
            this.cleanupOldEntries();
        }, appConfig.operational.storageCleanupInterval);
    }

    /**
     * Clean up very old entries (storage management only)
     */
    async cleanupOldEntries(): Promise<void> {
        try {
            const appConfig = this.configService.get('app');
            const now = Date.now();
            const cutoff = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago
            let cleaned = 0;

            // Only clean up if we exceed the maximum pinned entries limit
            if (
                this.pinnedContent.size <=
                appConfig.operational.maxLogEntriesPinned
            ) {
                return;
            }

            // Find old entries to clean up
            const oldEntries = Array.from(this.pinnedContent.entries())
                .filter(([_hash, entry]) => entry.timestamp < cutoff)
                .sort(([, a], [, b]) => a.timestamp - b.timestamp); // Oldest first

            // Calculate how many to remove
            const excessEntries =
                this.pinnedContent.size -
                appConfig.operational.maxLogEntriesPinned;
            const toRemove = Math.min(oldEntries.length, excessEntries);

            if (toRemove <= 0) {
                return;
            }

            this.logger.info(`🧹 Starting cleanup of old entries`, {
                totalPinned: this.pinnedContent.size,
                maxAllowed: appConfig.operational.maxLogEntriesPinned,
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
                    this.pinnedContent.delete(hash);
                    cleaned++;
                } catch (error) {
                    this.logger.warn(`Failed to cleanup entry: ${hash}`, {
                        error: error instanceof Error ? error.message : error,
                    });
                }
            }

            if (cleaned > 0) {
                this.logger.info(`🧹 Cleaned up ${cleaned} old entries`, {
                    remaining: this.pinnedContent.size,
                });
            }
        } catch (error) {
            this.logger.error('Error during cleanup', {
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
        this.logger.info('🛑 Replication handler shutdown', {
            stats,
        });
    }

    /**
     * Get health status for health service registry
     */
    async getHealthStatus(): Promise<HealthStatus> {
        try {
            const stats = this.getReplicationStats();

            // Consider the service degraded if rejection rate is high
            const rejectionRate =
                stats.totalProcessed > 0
                    ? stats.totalRejected / stats.totalProcessed
                    : 0;

            let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

            if (rejectionRate > 0.8) {
                status = 'unhealthy';
            } else if (rejectionRate > 0.5) {
                status = 'degraded';
            }

            return {
                status,
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: {
                    ...stats,
                    rejectionRate: Math.round(rejectionRate * 100) / 100,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }
}
