// OrbitDB Manager service for discovery log management and replication
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOrbitDB } from '@orbitdb/core';
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
// PROTOCOL constants are used via config.orbitdb.logName
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import { Logger } from '../logger/logger.js';
import {
    HealthService,
    HealthProvider,
    HealthStatus,
} from '../health/health.service.js';
import { IpfsClient, IpfsHttpClient } from './ipfs-client.js';
import { ReplicationHandler } from './replication-handler.js';
import { OrbitDB, BaseDatabase } from '@orbitdb/core';

export interface LogStore<T = unknown> {
    add: (data: T) => Promise<string>;
    iterator: (options?: IteratorOptions) => Array<LogEntry<T>>;
    load: (amount?: number) => Promise<void>;
    close: () => Promise<void>;
    address: {
        toString: () => string;
        root: string;
    };
    events: {
        on: (event: string, callback: (...args: unknown[]) => void) => void;
        off: (event: string, callback: (...args: unknown[]) => void) => void;
    };
    replicationStatus: {
        progress: number;
        max: number;
    };
}

export interface LogEntry<T> {
    hash: string;
    payload: {
        value: T;
        key?: string;
    };
    next: string[];
    clock: {
        id: string;
        time: number;
    };
    signature: string;
    identity: {
        id: string;
        publicKey: string;
    };
}

export interface IteratorOptions {
    limit?: number;
    reverse?: boolean;
    gte?: string;
    gt?: string;
    lte?: string;
    lt?: string;
}

export interface OrbitDBConnectionStatus {
    connected: boolean;
    id?: string;
    peers: number;
    lastUpdate: number;
    error?: string;
}

export interface DiscoveryLogStats {
    address: string;
    entryCount: number;
    pinnedEntries: number;
    lastEntry?: LogEntry<DiscoveryRecord>;
    replicationProgress: number;
    peers: number;
    [key: string]: unknown;
}

export interface ReplicationEvent {
    address: string;
    hash: string;
    entry: LogEntry<DiscoveryRecord>;
    progress: number;
    max: number;
}

export interface OrbitDBManagerOptions {
    ipfs: IpfsHttpClient;
    directory: string;
    id?: string;
}

type OrbitDbIpfsArg = Parameters<typeof createOrbitDB>[0]['ipfs'];

@Injectable()
export class OrbitDBManager
    implements OnModuleInit, OnModuleDestroy, HealthProvider
{
    private orbitdb?: OrbitDB; // OrbitDB v3 instance
    private discoveryLog?: BaseDatabase; // OrbitDB v3 database
    private replicationHandlerInstance?: ReplicationHandler;
    private connectionStatus: OrbitDBConnectionStatus = {
        connected: false,
        peers: 0,
        lastUpdate: 0,
    };
    private eventListeners: Map<string, (...args: unknown[]) => void> =
        new Map();

    constructor(
        private readonly ipfsClient: IpfsClient,
        private readonly replicationHandler: ReplicationHandler,
        private readonly healthService: HealthService,
        private readonly logger: Logger,
        private readonly configService: ConfigService
    ) {
        this.logger.info('OrbitDB Manager created');
    }

    async onModuleInit() {
        this.logger.info('🔄 Initializing OrbitDB manager...');
        await this.initialize();
        await this.openDiscoveryLog();

        // Set up replication handler
        this.setReplicationHandler(this.replicationHandler);

        const stats = await this.getDiscoveryLogStats();
        if (!stats) {
            throw new Error('Discovery log failed to open');
        }

        // Register with health service
        this.healthService.registerService('orbitdb', this);

        this.logger.info('✅ OrbitDB manager initialized', {
            address: stats.address,
            entries: stats.entryCount,
        });
    }

    async onModuleDestroy() {
        this.healthService.unregisterService('orbitdb');
        await this.shutdown();
    }

    /**
     * Initialize OrbitDB instance and connect to IPFS
     */
    async initialize(): Promise<void> {
        try {
            await this.ipfsClient.awaitConnection();

            // Create OrbitDB v3 instance
            const ipfs = this.ipfsClient.getRawClient();
            if (!ipfs) {
                throw new Error('IPFS client not initialized');
            }

            this.orbitdb = await createOrbitDB({
                ipfs: ipfs as unknown as OrbitDbIpfsArg,
            });

            this.connectionStatus = {
                connected: true,
                id: this.orbitdb?.id,
                peers: 0,
                lastUpdate: Date.now(),
            };

            const appConfig = this.configService.get('app');

            this.logger.info(`✅ OrbitDB instance created`, {
                id: this.orbitdb?.id,
                directory: appConfig.orbitdb.dataDir,
            });
        } catch (error) {
            this.logger.error('Failed to initialize OrbitDB', {
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
            const appConfig = this.configService.get('app');

            this.logger.info(
                `Opening discovery log: ${appConfig.orbitdb.logName}`
            );

            // Open the discovery log with the shared name from config (OrbitDB v3 API)
            this.discoveryLog = await this.orbitdb.open(
                appConfig.orbitdb.logName
            );

            // Set up event listeners for replication
            this.setupEventListeners();

            // Get entry count (OrbitDB v3 uses all() method)
            const entries = (await this.discoveryLog.all()) as unknown[];
            const entryCount = entries.length;
            this.logger.info(`✅ Discovery log opened`, {
                address: this.discoveryLog.address,
                entries: entryCount,
                logName: appConfig.orbitdb.logName,
            });
        } catch (error) {
            this.logger.error('Failed to open discovery log', {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Set replication handler
     */
    setReplicationHandler(handler: ReplicationHandler): void {
        this.replicationHandlerInstance = handler;
        this.logger.debug('Replication handler set');
    }

    /**
     * Handle replication events from OrbitDB
     */
    async handleReplication(address: string, hash: string): Promise<void> {
        if (!this.discoveryLog || !this.replicationHandlerInstance) {
            this.logger.warn(
                'Discovery log or replication handler not available for replication event'
            );
            return;
        }

        try {
            this.logger.debug(`Handling replication event`, {
                address,
                hash,
            });

            // Find the entry by hash (OrbitDB v3 API)
            const entries = (await this.discoveryLog.all()) as unknown[];
            const entry = entries.find(
                (e: unknown) => (e as { hash?: string }).hash === hash
            );

            if (!entry) {
                this.logger.warn(`Entry not found for hash: ${hash}`);
                return;
            }

            // Delegate to replication handler (cast to proper type)
            await this.replicationHandlerInstance.handleNewEntry(
                entry as LogEntry<DiscoveryRecord>
            );

            this.logger.debug(`✅ Replication event handled successfully`, {
                hash,
            });
        } catch (error) {
            this.logger.error('Error handling replication', {
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

            const hash = await this.discoveryLog.addOperation(record);

            this.logger.info(`➕ Discovery record added`, {
                hash,
                handle: record.handle,
                did: record.did,
            });

            return hash;
        } catch (error) {
            this.logger.error('Failed to add discovery record', {
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
            const entries = (await this.discoveryLog.all()) as unknown[];
            const lastEntry =
                entries.length > 0 ? entries[entries.length - 1] : undefined;

            return {
                address: this.discoveryLog.address,
                entryCount: entries.length,
                pinnedEntries: 0, // Will be updated by replication handler
                lastEntry: lastEntry as LogEntry<DiscoveryRecord> | undefined,
                replicationProgress: 100, // OrbitDB v3 doesn't expose replication status the same way
                peers: this.connectionStatus.peers,
            };
        } catch (error) {
            this.logger.error('Error getting discovery log stats', {
                error: error instanceof Error ? error.message : error,
            });
            return null;
        }
    }

    /**
     * Get the discovery log instance
     */
    getDiscoveryLog(): BaseDatabase | null {
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
        const updateListener = (...args: unknown[]) => {
            const entry = args[0] as { hash: string };
            this.logger.debug(`📡 Database updated`, { hash: entry.hash });
            this.handleReplication(
                this.discoveryLog?.address || '',
                entry.hash
            );
        };

        // Register listeners (OrbitDB v3 API)
        this.discoveryLog.events.on('update', updateListener);

        // Store listeners for cleanup
        this.eventListeners.set('update', updateListener);

        this.logger.debug('✅ OrbitDB event listeners set up');
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
        this.logger.debug('🧹 OrbitDB event listeners cleaned up');
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        try {
            this.logger.info('Shutting down OrbitDB manager...');

            // Clean up event listeners
            this.cleanupEventListeners();

            // Close discovery log
            if (this.discoveryLog) {
                await this.discoveryLog.close();
                this.logger.debug('Discovery log closed');
            }

            // Stop OrbitDB (v3 uses stop() instead of disconnect())
            if (this.orbitdb) {
                await this.orbitdb.stop();
                this.logger.debug('OrbitDB stopped');
            }

            this.connectionStatus = {
                connected: false,
                peers: 0,
                lastUpdate: Date.now(),
            };

            this.logger.info('✅ OrbitDB manager shut down successfully');
        } catch (error) {
            this.logger.error('Error during OrbitDB shutdown', {
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    /**
     * Get health status for health service registry
     */
    async getHealthStatus(): Promise<HealthStatus> {
        try {
            const connectionStatus = this.getConnectionStatus();

            if (!connectionStatus.connected) {
                return {
                    status: 'unhealthy',
                    timestamp: Date.now(),
                    uptime: process.uptime() * 1000,
                    details: {
                        connected: false,
                        error: connectionStatus.error,
                        id: connectionStatus.id,
                        peers: connectionStatus.peers,
                    },
                };
            }

            const stats = await this.getDiscoveryLogStats();

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: {
                    connected: true,
                    id: connectionStatus.id,
                    peers: connectionStatus.peers,
                    lastUpdate: connectionStatus.lastUpdate,
                    discoveryLog: stats
                        ? {
                              address: stats.address,
                              entryCount: stats.entryCount,
                              replicationProgress: stats.replicationProgress,
                          }
                        : null,
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
