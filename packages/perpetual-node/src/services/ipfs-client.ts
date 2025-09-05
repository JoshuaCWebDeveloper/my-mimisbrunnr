// IPFS Kubo RPC client wrapper with connection management and error handling
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { create, type KuboRPCClient, CID } from 'kubo-rpc-client';
import { Logger } from '../logger/logger.js';
import {
    HealthService,
    HealthProvider,
    HealthStatus,
} from '../health/health.service.js';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// IPFS-related types
interface IpfsAddResult {
    cid: string;
    size: number;
}

interface IpfsIdResult {
    id: string;
    publicKey: string;
    addresses: string[];
}

interface IpfsVersionResult {
    version: string;
    commit: string;
}

interface IpfsRepoStatResult {
    numObjects: number;
    repoSize: number;
    storageMax: number;
    repoPath: string;
    version: string;
}

export interface IpfsHttpClient {
    add: (
        data: string | Uint8Array | Buffer,
        options?: Record<string, unknown>
    ) => Promise<IpfsAddResult>;
    pin: {
        add: (
            cid: string,
            options?: { recursive?: boolean }
        ) => Promise<{ cid: string }>;
        rm: (
            cid: string,
            options?: { recursive?: boolean }
        ) => Promise<{ cid: string }>;
        ls: () => AsyncIterable<{ cid: string; type: string }>;
    };
    dag: {
        get: (
            cid: string,
            options?: Record<string, unknown>
        ) => Promise<{ value: unknown; remainderPath: string }>;
        put: (
            data: unknown,
            options?: Record<string, unknown>
        ) => Promise<{ cid: string }>;
    };
    pubsub: {
        publish: (topic: string, data: Uint8Array) => Promise<void>;
        subscribe: (
            topic: string
        ) => AsyncIterable<{ from: string; data: Uint8Array; topic: string }>;
        unsubscribe: (topic: string) => Promise<void>;
        peers: (topic: string) => Promise<string[]>;
    };
    id: () => Promise<IpfsIdResult>;
    version: () => Promise<IpfsVersionResult>;
    repo: {
        stat: () => Promise<IpfsRepoStatResult>;
    };
}

export interface IpfsPinStatus {
    cid: string;
    pinned: boolean;
    recursive: boolean;
    timestamp: number;
}

export interface IpfsConnectionStatus {
    connected: boolean;
    peerId?: string;
    version?: string;
    lastCheck: number;
    error?: string;
}

export interface PinningRequest {
    cid: string;
    recursive: boolean;
    clientIP: string;
    timestamp: number;
}

export interface PinningResult {
    cid: string;
    success: boolean;
    error?: string;
    size?: number;
}

export interface IpfsRepositoryStats {
    numObjects: number;
    repoSize: number;
    storageMax: number;
    repoPath: string;
    version: string;
}

@Injectable()
export class IpfsClient
    implements OnModuleInit, OnModuleDestroy, HealthProvider
{
    private client: KuboRPCClient | null = null;
    private connectionStatus: IpfsConnectionStatus = {
        connected: false,
        lastCheck: 0,
    };

    constructor(
        private readonly logger: Logger,
        private readonly healthService: HealthService,
        private readonly configService: ConfigService
    ) {
        this.logger.info('IPFS Kubo RPC Client created');
    }

    async onModuleInit() {
        this.logger.info('🔄 Initializing IPFS client...');
        await this.initialize();
        const status = this.getConnectionStatus();
        if (!status.connected) {
            throw new Error('IPFS client failed to connect');
        }
        // Register with health service
        this.healthService.registerService('ipfs', this);
        this.logger.info('✅ IPFS client initialized and connected');
    }

    async onModuleDestroy() {
        this.healthService.unregisterService('ipfs');
        await this.shutdown();
    }

    /**
     * Initialize connection to Kubo RPC API
     */
    async initialize(): Promise<void> {
        const appConfig = this.configService.get('app');
        const ipfsApiUrl = appConfig.ipfs.apiUrl;
        const maxCooldown = 10 * 1000;
        let cooldown = 0;

        while (!this.connectionStatus.connected) {
            try {
                this.logger.info(
                    `🔗 Connecting to Kubo RPC API at ${ipfsApiUrl}`
                );

                // Create client connection to Kubo
                this.client = create({ url: ipfsApiUrl });

                // Test the connection
                await this.updateConnectionStatus();

                if (!this.connectionStatus.connected) {
                    throw new Error(
                        'Failed to establish connection to Kubo RPC API'
                    );
                }

                this.logger.info(
                    '✅ IPFS Kubo RPC Client connected successfully'
                );
            } catch (error) {
                this.logger.error('❌ Failed to initialize IPFS client', {
                    error: error instanceof Error ? error.message : error,
                    apiUrl: ipfsApiUrl,
                });
            }
            cooldown = Math.min(cooldown + 1000, maxCooldown);
            await wait(cooldown);
        }
    }

    async awaitConnection(): Promise<void> {
        while (!(await this.updateConnectionStatus())) {
            await wait(5000);
            this.logger.info('🔄 Waiting for IPFS connection...');
        }
    }

    /**
     * Check connection to Kubo node
     */
    private async updateConnectionStatus(): Promise<boolean> {
        if (!this.client) {
            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
                error: 'Client not initialized',
            };
            return false;
        }

        try {
            // Test connection with id and version calls
            const [idResult, versionResult] = await Promise.all([
                this.client.id(),
                this.client.version(),
            ]);

            this.connectionStatus = {
                connected: true,
                peerId: idResult.id.toString(),
                version: versionResult.version,
                lastCheck: Date.now(),
            };

            this.logger.debug('✅ IPFS connection verified', {
                peerId: idResult.id.toString(),
                version: versionResult.version,
            });

            return true;
        } catch (error) {
            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error',
            };

            this.logger.debug('❌ IPFS connection check failed', {
                error: error instanceof Error ? error.message : error,
                apiUrl: this.configService.get('app').ipfs.apiUrl,
            });

            return false;
        }
    }

    /**
     * Pin content to IPFS node
     */
    async pinContent(request: PinningRequest): Promise<PinningResult> {
        const startTime = Date.now();

        try {
            if (!this.connectionStatus.connected) {
                await this.updateConnectionStatus();
                if (!this.connectionStatus.connected) {
                    throw new Error('IPFS client not connected');
                }
            }

            this.logger.debug(`📌 Pinning content: ${request.cid}`, {
                cid: request.cid,
                recursive: request.recursive,
                clientIP: request.clientIP,
            });

            if (!this.client) {
                throw new Error('IPFS client not initialized');
            }

            const result = await this.client.pin.add(request.cid, {
                recursive: request.recursive,
            });

            const duration = Date.now() - startTime;

            this.logger.info(`✅ Content pinned successfully: ${request.cid}`, {
                cid: result.toString(),
                duration,
                recursive: request.recursive,
            });

            return {
                cid: result.toString(),
                success: true,
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            this.logger.error(`❌ Failed to pin content: ${request.cid}`, {
                error: error instanceof Error ? error.message : error,
                duration,
                cid: request.cid,
            });

            return {
                cid: request.cid,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Unpin content from IPFS node
     */
    async unpinContent(cid: string): Promise<boolean> {
        try {
            if (!this.connectionStatus.connected) {
                await this.updateConnectionStatus();
                if (!this.connectionStatus.connected) {
                    throw new Error('IPFS client not connected');
                }
            }

            this.logger.debug(`📌 Unpinning content: ${cid}`);

            if (!this.client) {
                throw new Error('IPFS client not initialized');
            }

            await this.client.pin.rm(cid);

            this.logger.info(`✅ Content unpinned successfully: ${cid}`, {
                cid,
            });

            return true;
        } catch (error) {
            this.logger.error(`❌ Failed to unpin content: ${cid}`, {
                error: error instanceof Error ? error.message : error,
                cid,
            });
            return false;
        }
    }

    /**
     * Get DAG content from IPFS
     */
    async getDagContent(cid: string): Promise<unknown> {
        try {
            if (!this.connectionStatus.connected) {
                await this.updateConnectionStatus();
                if (!this.connectionStatus.connected) {
                    throw new Error('IPFS client not connected');
                }
            }

            this.logger.debug(`📥 Getting DAG content: ${cid}`);

            if (!this.client) {
                throw new Error('IPFS client not initialized');
            }

            const result = await this.client.dag.get(CID.parse(cid));

            this.logger.debug(`✅ DAG content retrieved: ${cid}`, { cid });

            return result.value;
        } catch (error) {
            this.logger.error(`❌ Failed to get DAG content: ${cid}`, {
                error: error instanceof Error ? error.message : error,
                cid,
            });
            throw error;
        }
    }

    /**
     * Publish message to pubsub topic (for OrbitDB replication)
     */
    async publishMessage(topic: string, _data: Uint8Array): Promise<void> {
        try {
            // Note: Pubsub publishing will be implemented in MM-20
            this.logger.debug(`Mock pubsub publish to topic: ${topic}`);
            // await this.client!.pubsub.publish(topic, data);
        } catch (error) {
            this.logger.error(`Failed to publish to topic: ${topic}`, {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Subscribe to pubsub topic (for OrbitDB replication)
     */
    async subscribeToTopic(topic: string): Promise<AsyncIterable<Uint8Array>> {
        try {
            // Note: Pubsub subscription will be implemented in MM-20
            this.logger.debug(`Mock pubsub subscribe to topic: ${topic}`);
            return {
                async *[Symbol.asyncIterator]() {
                    // Mock empty async iterable - no items to yield
                    // eslint-disable-next-line no-constant-condition
                    if (false) yield new Uint8Array(); // Satisfies generator requirements
                },
            };
        } catch (error) {
            this.logger.error(`Failed to subscribe to topic: ${topic}`, {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Get repository statistics
     */
    async getRepositoryStats(): Promise<IpfsRepositoryStats> {
        try {
            if (!this.connectionStatus.connected) {
                await this.updateConnectionStatus();
                if (!this.connectionStatus.connected) {
                    throw new Error('IPFS client not connected');
                }
            }

            if (!this.client) {
                throw new Error('IPFS client not initialized');
            }

            const stats = await this.client.repo.stat();

            return {
                numObjects: Number(stats.numObjects),
                repoSize: Number(stats.repoSize),
                storageMax: Number(stats.storageMax),
                repoPath: stats.repoPath,
                version: stats.version,
            };
        } catch (error) {
            this.logger.error('Failed to get repository statistics', {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Get the raw Kubo RPC client instance for direct access (used by OrbitDB)
     */
    getRawClient(): KuboRPCClient | null {
        return this.client;
    }

    /**
     * Get connection status
     */
    getConnectionStatus(): IpfsConnectionStatus {
        return this.connectionStatus;
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        try {
            this.logger.info('🛑 Shutting down IPFS client');

            // Kubo RPC client doesn't need explicit shutdown
            this.client = null;
            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
            };

            this.logger.info('✅ IPFS client shutdown complete');
        } catch (error) {
            this.logger.error('Error during IPFS client shutdown', {
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
                        lastCheck: connectionStatus.lastCheck,
                    },
                };
            }

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: {
                    connected: true,
                    peerId: connectionStatus.peerId,
                    version: connectionStatus.version,
                    lastCheck: connectionStatus.lastCheck,
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
