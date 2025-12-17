// OrbitDB Manager service for discovery log management and replication
import type { BaseDatabase } from '@my-mimisbrunnr/orbitdb';
import {
    OrbitDbManager,
    type OrbitDbManagerConfig,
} from '@my-mimisbrunnr/orbitdb';
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    HealthProvider,
    HealthService,
    HealthStatus,
} from '../health/health.service.js';
import { Logger } from '../logger/logger.js';
import { HeliaNode } from './helia-node.js';
import { ReplicationHandler } from './replication-handler.js';
import { AppConfiguration } from 'src/config/configuration.js';
import { IpfsCodec } from './helia-node.js';

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

@Injectable()
export class OrbitDbServiceManager
    extends OrbitDbManager
    implements OnModuleInit, OnModuleDestroy, HealthProvider
{
    private connectionStatus: OrbitDBConnectionStatus = {
        connected: false,
        peers: 0,
        lastUpdate: 0,
    };

    constructor(
        private readonly heliaNode: HeliaNode,
        private readonly replicationHandler: ReplicationHandler,
        private readonly healthService: HealthService,
        private readonly loggerService: Logger,
        configService: ConfigService
    ) {
        const appConfig = configService.get<AppConfiguration>(
            'app'
        ) as AppConfiguration;
        const config: OrbitDbManagerConfig = {
            logName: appConfig.orbitdb.logName,
            address: appConfig.orbitdb.address,
            dataDir: appConfig.orbitdb.dataDir,
        };
        super(config);
        this.loggerService.info('OrbitDB Manager created');
    }

    async onModuleInit() {
        this.loggerService.info('🔄 Initializing OrbitDB manager...');

        // Wait for Helia to be ready
        await this.heliaNode.awaitConnection();
        const helia = this.heliaNode.getHeliaInstance();
        if (!helia) {
            throw new Error('Helia node not initialized');
        }

        // Initialize OrbitDB and open discovery log
        await this.start(Promise.resolve(helia));

        // if we just created a new database
        if (!this.config.address && this.discoveryLog?.address) {
            if (!this.replicationHandler) {
                throw new Error(
                    'Replication handler not initialized for replication of new database'
                );
            }

            const manifestCid = this.discoveryLog.address.split('/')[2];
            const manifest = await this.heliaNode.retrieveObject(
                manifestCid,
                IpfsCodec.DAG_CBOR
            );

            await this.replicationHandler.handleNewManifest(
                manifestCid,
                manifest
            );
        }

        // Update connection status
        this.connectionStatus = {
            connected: true,
            id: this.getId() ?? undefined,
            peers: 0,
            lastUpdate: Date.now(),
        };

        const stats = await this.getDiscoveryLogStats();
        if (!stats) {
            throw new Error('Discovery log failed to open');
        }

        // Register with health service
        this.healthService.registerService('orbitdb', this);

        this.loggerService.info('✅ OrbitDB manager initialized', {
            address: stats.address,
            entries: stats.entryCount,
        });
    }

    async onModuleDestroy() {
        this.healthService.unregisterService('orbitdb');
        await this.stop();
    }

    /**
     * Handle replication events from OrbitDB
     */
    async handleReplication(
        address: string,
        entry: LogEntry<DiscoveryRecord>
    ): Promise<void> {
        if (!this.discoveryLog || !this.replicationHandler) {
            this.loggerService.warn(
                'Discovery log or replication handler not available for replication event'
            );
            return;
        }

        try {
            this.loggerService.debug(`Handling replication event`, {
                address,
                entry,
            });

            // Delegate to replication handler (cast to proper type)
            await this.replicationHandler.handleNewEntry(entry);

            this.loggerService.debug(
                `✅ Replication event handled successfully`,
                {
                    entry,
                }
            );
        } catch (error) {
            this.loggerService.error('Error handling replication', {
                address,
                entry,
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

            this.loggerService.info(`➕ Discovery record added`, {
                hash,
                handle: record.handle,
                did: record.did,
            });

            return hash;
        } catch (error) {
            this.loggerService.error('Failed to add discovery record', {
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
            this.loggerService.error('Error getting discovery log stats', {
                error: error instanceof Error ? error.message : error,
            });
            return null;
        }
    }

    /**
     * Get the discovery log instance
     */
    getDiscoveryLog(): BaseDatabase | null {
        return this.getDatabase();
    }

    /**
     * Get OrbitDB connection status
     */
    getConnectionStatus(): OrbitDBConnectionStatus {
        return { ...this.connectionStatus };
    }

    /**
     * Setup event listeners for OrbitDB replication events
     *
     * Implements abstract method from BaseOrbitDbServiceManager
     */
    protected override async setupEventListeners(): Promise<void> {
        if (!this.discoveryLog) {
            return;
        }

        // OrbitDB v3 uses 'update' events
        const updateListener = (...args: unknown[]) => {
            const entry = args[0] as LogEntry<DiscoveryRecord>;
            this.loggerService.debug(`📡 Database updated`, {
                entry,
            });
            this.handleReplication(this.discoveryLog?.address || '', entry);
        };

        // Register listeners (OrbitDB v3 API)
        this.addEventListener('update', updateListener);

        // Store listeners for cleanup
        this.loggerService.debug('✅ OrbitDB event listeners set up');
    }

    /**
     * Logging implementation using NestJS Logger
     *
     * Implements abstract method from BaseOrbitDbServiceManager
     */
    protected override log(
        level: 'debug' | 'info' | 'warn' | 'error',
        message: string,
        context?: Record<string, unknown>
    ): void {
        const logContext = context ? { ...context } : undefined;

        switch (level) {
            case 'debug':
                this.loggerService.debug(message, logContext);
                break;
            case 'info':
                this.loggerService.info(message, logContext);
                break;
            case 'warn':
                this.loggerService.warn(message, logContext);
                break;
            case 'error':
                this.loggerService.error(message, logContext);
                break;
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
