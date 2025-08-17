// OrbitDB Manager service for discovery log management and replication
import { createOrbitDB } from '@orbitdb/core';
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
// PROTOCOL constants are used via config.orbitdb.logName
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import { config } from '../config/environment.js';
import { orbitdbLogger } from '../utils/logging.js';
import type { IpfsNode } from './ipfs-client.js';
import type { ReplicationHandler } from './replication-handler.js';
import type {
    OrbitDBConnectionStatus,
    DiscoveryLogStats,
} from '../types/orbitdb.js';

export class OrbitDBManager {
    private ipfsClient: IpfsNode;
    private orbitdb?: any; // OrbitDB v3 instance
    private discoveryLog?: any; // OrbitDB v3 database
    private replicationHandler?: ReplicationHandler;
    private connectionStatus: OrbitDBConnectionStatus = {
        connected: false,
        peers: 0,
        lastUpdate: 0,
    };
    private eventListeners: Map<string, (...args: any[]) => void> = new Map();

    constructor(ipfsClient: IpfsNode) {
        this.ipfsClient = ipfsClient;
        orbitdbLogger.info('OrbitDB Manager initialized');
    }

    /**
     * Initialize OrbitDB instance and connect to IPFS
     */
    async initialize(): Promise<void> {
        try {
            // Ensure IPFS client is connected
            if (!this.ipfsClient.getConnectionStatus().connected) {
                throw new Error(
                    'IPFS client must be connected before initializing OrbitDB'
                );
            }

            // Create OrbitDB v3 instance
            const ipfs = this.ipfsClient.getRawClient();

            this.orbitdb = await createOrbitDB({ ipfs });

            this.connectionStatus = {
                connected: true,
                id: this.orbitdb.id,
                peers: 0,
                lastUpdate: Date.now(),
            };

            orbitdbLogger.info(`✅ OrbitDB instance created`, {
                id: this.orbitdb.id,
                directory: config.orbitdb.dataDir,
            });
        } catch (error) {
            orbitdbLogger.error('Failed to initialize OrbitDB', {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Open or create the discovery log database
     */
    async openDiscoveryLog(): Promise<void> {
        if (!this.orbitdb) {
            throw new Error('OrbitDB not initialized');
        }

        try {
            orbitdbLogger.info(
                `Opening discovery log: ${config.orbitdb.logName}`
            );

            // Open the discovery log with the shared name from config (OrbitDB v3 API)
            this.discoveryLog = await this.orbitdb.open(config.orbitdb.logName);

            // Set up event listeners for replication
            this.setupEventListeners();

            // Get entry count (OrbitDB v3 uses all() method)
            const entries = await this.discoveryLog.all();
            const entryCount = entries.length;
            orbitdbLogger.info(`✅ Discovery log opened`, {
                address: this.discoveryLog.address,
                entries: entryCount,
                logName: config.orbitdb.logName,
            });
        } catch (error) {
            orbitdbLogger.error('Failed to open discovery log', {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Set replication handler
     */
    setReplicationHandler(handler: ReplicationHandler): void {
        this.replicationHandler = handler;
        orbitdbLogger.debug('Replication handler set');
    }

    /**
     * Handle replication events from OrbitDB
     */
    async handleReplication(address: string, hash: string): Promise<void> {
        if (!this.discoveryLog || !this.replicationHandler) {
            orbitdbLogger.warn(
                'Discovery log or replication handler not available for replication event'
            );
            return;
        }

        try {
            orbitdbLogger.debug(`Handling replication event`, {
                address,
                hash,
            });

            // Find the entry by hash (OrbitDB v3 API)
            const entries = await this.discoveryLog.all();
            const entry = entries.find((e: any) => e.hash === hash);

            if (!entry) {
                orbitdbLogger.warn(`Entry not found for hash: ${hash}`);
                return;
            }

            // Delegate to replication handler
            await this.replicationHandler.handleNewEntry(entry);

            orbitdbLogger.debug(`✅ Replication event handled successfully`, {
                hash,
            });
        } catch (error) {
            orbitdbLogger.error('Error handling replication', {
                address,
                hash,
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    /**
     * Add a discovery record to the log (mainly for testing)
     */
    async addDiscoveryRecord(record: DiscoveryRecord): Promise<string> {
        if (!this.discoveryLog) {
            throw new Error('Discovery log not opened');
        }

        try {
            // Validate the record before adding
            const isValid = validateDiscoveryRecord(record);
            if (!isValid) {
                throw new Error('Invalid discovery record');
            }

            const hash = await this.discoveryLog.add(record);

            orbitdbLogger.info(`➕ Discovery record added`, {
                hash,
                handle: record.handle,
                did: record.did,
            });

            return hash;
        } catch (error) {
            orbitdbLogger.error('Failed to add discovery record', {
                record,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Get discovery log statistics
     */
    async getDiscoveryLogStats(): Promise<DiscoveryLogStats | null> {
        if (!this.discoveryLog) {
            return null;
        }

        try {
            const entries = await this.discoveryLog.all();
            const lastEntry =
                entries.length > 0 ? entries[entries.length - 1] : undefined;

            return {
                address: this.discoveryLog.address,
                entryCount: entries.length,
                pinnedEntries: 0, // Will be updated by replication handler
                lastEntry,
                replicationProgress: 100, // OrbitDB v3 doesn't expose replication status the same way
                peers: this.connectionStatus.peers,
            };
        } catch (error) {
            orbitdbLogger.error('Error getting discovery log stats', {
                error: error instanceof Error ? error.message : error,
            });
            return null;
        }
    }

    /**
     * Get the discovery log instance
     */
    getDiscoveryLog(): any | null {
        return this.discoveryLog || null;
    }

    /**
     * Get OrbitDB connection status
     */
    getConnectionStatus(): OrbitDBConnectionStatus {
        return { ...this.connectionStatus };
    }

    /**
     * Set up event listeners for OrbitDB replication
     */
    private setupEventListeners(): void {
        if (!this.discoveryLog) {
            return;
        }

        // OrbitDB v3 uses 'update' events
        const updateListener = (entry: any) => {
            orbitdbLogger.debug(`📡 Database updated`, { hash: entry.hash });
            this.handleReplication(this.discoveryLog.address, entry.hash);
        };

        // Register listeners (OrbitDB v3 API)
        this.discoveryLog.events.on('update', updateListener);

        // Store listeners for cleanup
        this.eventListeners.set('update', updateListener);

        orbitdbLogger.debug('✅ OrbitDB event listeners set up');
    }

    /**
     * Clean up event listeners
     */
    private cleanupEventListeners(): void {
        if (!this.discoveryLog) {
            return;
        }

        for (const [event, listener] of this.eventListeners) {
            this.discoveryLog.events.off(event, listener);
        }

        this.eventListeners.clear();
        orbitdbLogger.debug('🧹 OrbitDB event listeners cleaned up');
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        try {
            orbitdbLogger.info('Shutting down OrbitDB manager...');

            // Clean up event listeners
            this.cleanupEventListeners();

            // Close discovery log
            if (this.discoveryLog) {
                await this.discoveryLog.close();
                orbitdbLogger.debug('Discovery log closed');
            }

            // Stop OrbitDB (v3 uses stop() instead of disconnect())
            if (this.orbitdb) {
                await this.orbitdb.stop();
                orbitdbLogger.debug('OrbitDB stopped');
            }

            this.connectionStatus = {
                connected: false,
                peers: 0,
                lastUpdate: Date.now(),
            };

            orbitdbLogger.info('✅ OrbitDB manager shut down successfully');
        } catch (error) {
            orbitdbLogger.error('Error during OrbitDB shutdown', {
                error: error instanceof Error ? error.message : error,
            });
        }
    }
}
