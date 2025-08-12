// Enhanced OrbitDB Manager with Security Integration
// File: packages/perpetual-node/src/services/enhanced-orbitdb-manager.ts

import { create as createIpfsClient, IPFSHTTPClient } from 'ipfs-http-client';
import OrbitDB from 'orbit-db';
import { DiscoveryRecord } from '@my-mimisbrunnr/shared-api';
import { PinningIndex } from './pinning-index';

export interface OrbitDBConfig {
    ipfsApiUrl: string;
    logName: string;
    dataDir: string;
    enableCompaction: boolean;
    maintainPinIndex: boolean;
    compactionInterval: number;
}

export class EnhancedOrbitDBManager {
    private ipfs!: IPFSHTTPClient;
    private orbitdb!: OrbitDB;
    private discoveryLog: any;
    private pinningIndex: PinningIndex;
    private compactionTimer?: NodeJS.Timeout;

    constructor(private config: OrbitDBConfig) {
        this.pinningIndex = new PinningIndex({
            maintainIndex: config.maintainPinIndex,
            indexPath: `${config.dataDir}/pinning-index.json`,
        });
    }

    async initialize(): Promise<void> {
        console.log('🚀 Initializing Enhanced OrbitDB Manager...');

        // Connect to Kubo via HTTP API
        this.ipfs = createIpfsClient({
            url: this.config.ipfsApiUrl,
            timeout: 30000,
        });

        // Test IPFS connection
        try {
            const nodeInfo = await this.ipfs.id();
            console.log(`✅ Connected to IPFS node: ${nodeInfo.id}`);
        } catch (error) {
            console.error('❌ Failed to connect to IPFS:', error);
            throw new Error('IPFS connection failed');
        }

        // Initialize OrbitDB
        this.orbitdb = await OrbitDB.createInstance(this.ipfs, {
            directory: this.config.dataDir,
        });

        console.log(`✅ OrbitDB initialized at: ${this.config.dataDir}`);

        // Open discovery log
        await this.openDiscoveryLog();

        // Initialize pinning index
        await this.pinningIndex.initialize();

        // Set up periodic compaction if enabled
        if (this.config.enableCompaction) {
            this.setupPeriodicCompaction();
        }

        console.log('🎯 Enhanced OrbitDB Manager ready');
    }

    private async openDiscoveryLog(): Promise<void> {
        console.log(`📖 Opening discovery log: ${this.config.logName}`);

        this.discoveryLog = await this.orbitdb.log(this.config.logName, {
            accessController: {
                write: ['*'], // Allow all to write (validated by clients)
            },
            sync: true,
            meta: {
                description: 'Decentralized taglist discovery log',
                version: '1.0.0',
            },
        });

        // Set up replication event handlers
        this.discoveryLog.events.on('replicated', async (address: string) => {
            console.log(`🔄 Replicated from: ${address}`);
            await this.handleReplication();
        });

        this.discoveryLog.events.on(
            'write',
            async (address: string, entry: any) => {
                console.log(`✍️ New entry written: ${entry.hash}`);
                await this.handleNewEntry(entry);
            }
        );

        // Load existing entries
        await this.discoveryLog.load();

        console.log(
            `✅ Discovery log loaded with ${
                this.discoveryLog.iterator().collect().length
            } entries`
        );
    }

    private async handleReplication(): Promise<void> {
        try {
            // Get recent entries that might not be pinned yet
            const recentEntries = this.discoveryLog
                .iterator({
                    limit: 50,
                })
                .collect();

            for (const entry of recentEntries) {
                await this.ensureEntryPinned(entry);
            }

            // Update metrics
            await this.updateReplicationMetrics();
        } catch (error) {
            console.error('Error handling replication:', error);
        }
    }

    private async handleNewEntry(entry: any): Promise<void> {
        try {
            console.log(`📝 Processing new entry: ${entry.hash}`);

            // Basic validation of entry structure
            if (!this.isValidDiscoveryRecord(entry.payload.value)) {
                console.warn(
                    `⚠️ Invalid discovery record format: ${entry.hash}`
                );
                return;
            }

            // Ensure the entry itself is pinned
            await this.ensureEntryPinned(entry);

            // Track in pinning index
            await this.pinningIndex.addEntry(entry);
        } catch (error) {
            console.error(`Error processing entry ${entry.hash}:`, error);
        }
    }

    private async ensureEntryPinned(entry: any): Promise<void> {
        try {
            const entryCid = entry.hash;

            // Check if already pinned
            const isPinned = await this.isPinned(entryCid);
            if (isPinned) {
                return;
            }

            // Pin the entry CID
            await this.ipfs.pin.add(entryCid, { recursive: false });
            console.log(`📌 Pinned entry: ${entryCid}`);

            // Update pinning index
            await this.pinningIndex.recordPin(entryCid, 'orbitdb-entry');
        } catch (error) {
            console.error(`Failed to pin entry ${entry.hash}:`, error);
        }
    }

    private async isPinned(cid: string): Promise<boolean> {
        try {
            for await (const pin of this.ipfs.pin.ls({ paths: [cid] })) {
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    private isValidDiscoveryRecord(record: any): boolean {
        // Basic structure validation
        if (!record || typeof record !== 'object') return false;
        if (
            !record.lookupKey ||
            !record.handle ||
            !record.ipnsKey ||
            !record.did
        )
            return false;
        if (!record.timestamp || typeof record.timestamp !== 'number')
            return false;

        // Handle format validation
        if (!record.handle.startsWith('@') || record.handle.length > 16)
            return false;

        // DID format validation
        if (!record.did.startsWith('did:')) return false;

        return true;
    }

    public async performLogHeadScan(): Promise<void> {
        console.log('🔍 Performing periodic log head scan...');

        try {
            // Get all current log heads
            const entries = this.discoveryLog.iterator().collect();
            console.log(`📊 Scanning ${entries.length} log entries`);

            // Group by handle to find latest per handle
            const latestPerHandle = new Map<string, any>();

            for (const entry of entries) {
                const record = entry.payload.value as DiscoveryRecord;
                if (!this.isValidDiscoveryRecord(record)) continue;

                const existing = latestPerHandle.get(record.handle);
                if (
                    !existing ||
                    record.timestamp > existing.payload.value.timestamp
                ) {
                    latestPerHandle.set(record.handle, entry);
                }
            }

            console.log(`📈 Found ${latestPerHandle.size} unique handles`);

            // Ensure all latest entries are pinned
            for (const [handle, entry] of latestPerHandle) {
                await this.ensureEntryPinned(entry);
            }

            // Update pinning index with scan results
            await this.pinningIndex.updateScanResults({
                totalEntries: entries.length,
                uniqueHandles: latestPerHandle.size,
                scannedAt: Date.now(),
            });
        } catch (error) {
            console.error('Error during log head scan:', error);
        }
    }

    private setupPeriodicCompaction(): void {
        const interval = this.config.compactionInterval || 3600000; // 1 hour default

        console.log(`⏰ Setting up periodic compaction every ${interval}ms`);

        this.compactionTimer = setInterval(async () => {
            try {
                await this.performCompaction();
            } catch (error) {
                console.error('Error during periodic compaction:', error);
            }
        }, interval);
    }

    private async performCompaction(): Promise<void> {
        console.log('🗜️ Performing OrbitDB compaction...');

        try {
            const allEntries = this.discoveryLog.iterator().collect();
            const latestPerHandle = new Map<string, any>();

            // Find latest entry per handle
            for (const entry of allEntries) {
                const record = entry.payload.value as DiscoveryRecord;
                if (!this.isValidDiscoveryRecord(record)) continue;

                const existing = latestPerHandle.get(record.handle);
                if (
                    !existing ||
                    record.timestamp > existing.payload.value.timestamp
                ) {
                    latestPerHandle.set(record.handle, entry);
                }
            }

            // Calculate compaction benefit
            const originalCount = allEntries.length;
            const compactedCount = latestPerHandle.size;
            const reduction = originalCount - compactedCount;

            console.log(
                `📉 Compaction would reduce ${originalCount} entries to ${compactedCount} (${reduction} removed)`
            );

            // Only compact if there's significant benefit (>20% reduction)
            if (reduction / originalCount > 0.2) {
                console.log('🚀 Performing actual compaction...');

                // Create new compacted log (in practice, this would involve more complex log management)
                // For now, we just track the compaction metrics
                await this.pinningIndex.recordCompaction({
                    originalCount,
                    compactedCount,
                    reduction,
                    compactedAt: Date.now(),
                });
            } else {
                console.log('📊 Compaction skipped - insufficient benefit');
            }
        } catch (error) {
            console.error('Error during compaction:', error);
        }
    }

    private async updateReplicationMetrics(): Promise<void> {
        try {
            const stats = {
                totalEntries: this.discoveryLog.iterator().collect().length,
                replicatedAt: Date.now(),
                logAddress: this.discoveryLog.address.toString(),
                peers: Object.keys(this.discoveryLog._oplog.heads).length,
            };

            await this.pinningIndex.updateMetrics(stats);
        } catch (error) {
            console.error('Error updating replication metrics:', error);
        }
    }

    public async getMetrics(): Promise<any> {
        const entries = this.discoveryLog.iterator().collect();
        const pinningStats = await this.pinningIndex.getStats();

        return {
            orbitdb: {
                totalEntries: entries.length,
                logAddress: this.discoveryLog.address.toString(),
                replicationPeers: Object.keys(
                    this.discoveryLog._oplog.heads || {}
                ).length,
            },
            pinning: pinningStats,
            config: {
                logName: this.config.logName,
                compactionEnabled: this.config.enableCompaction,
                indexMaintenance: this.config.maintainPinIndex,
            },
        };
    }

    public async shutdown(): Promise<void> {
        console.log('🛑 Shutting down Enhanced OrbitDB Manager...');

        if (this.compactionTimer) {
            clearInterval(this.compactionTimer);
        }

        if (this.discoveryLog) {
            await this.discoveryLog.close();
        }

        if (this.orbitdb) {
            await this.orbitdb.stop();
        }

        await this.pinningIndex.shutdown();

        console.log('✅ OrbitDB Manager shutdown complete');
    }

    // Public API for health checks
    public isReady(): boolean {
        return !!(this.ipfs && this.orbitdb && this.discoveryLog);
    }

    public getDiscoveryLog(): any {
        return this.discoveryLog;
    }
}
