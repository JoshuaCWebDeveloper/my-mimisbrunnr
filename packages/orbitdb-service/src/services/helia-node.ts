// Helia node wrapper with connection management to Kubo node
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHelia, Helia, HeliaInit } from 'helia';
import { tcp } from '@libp2p/tcp';
import { bootstrap } from '@libp2p/bootstrap';
import { Logger } from '../logger/logger.js';
import {
    HealthService,
    HealthProvider,
    HealthStatus,
} from '../health/health.service.js';
import type { Libp2p } from '@libp2p/interface';
import { MemoryDatastore } from 'datastore-core';
import { MemoryBlockstore } from 'blockstore-core';
import { identify } from '@libp2p/identify';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface HeliaConnectionStatus {
    connected: boolean;
    peerId?: string;
    lastCheck: number;
    error?: string;
    peers: number;
}

@Injectable()
export class HeliaNode
    implements OnModuleInit, OnModuleDestroy, HealthProvider
{
    private helia: Helia<Libp2p<Record<string, unknown>>> | null = null;
    private connectionStatus: HeliaConnectionStatus = {
        connected: false,
        lastCheck: 0,
        peers: 0,
    };

    constructor(
        private readonly logger: Logger,
        private readonly healthService: HealthService,
        private readonly configService: ConfigService
    ) {
        this.logger.info('Helia Node service created');
    }

    async onModuleInit() {
        this.logger.info('🔄 Initializing Helia node...');
        await this.initialize();
        const status = this.getConnectionStatus();
        if (!status.connected) {
            throw new Error('Helia node failed to initialize');
        }
        // Register with health service
        this.healthService.registerService('helia', this);
        this.logger.info('✅ Helia node initialized and connected');
    }

    async onModuleDestroy() {
        this.healthService.unregisterService('helia');
        await this.shutdown();
    }

    /**
     * Initialize Helia node with connection to Kubo
     */
    async initialize(): Promise<void> {
        const appConfig = this.configService.get('app');
        const kuboApiUrl = appConfig.ipfs.apiUrl;
        const maxCooldown = 10 * 1000;
        let cooldown = 0;

        while (!this.connectionStatus.connected) {
            try {
                this.logger.info(
                    `🔗 Creating Helia node (will connect to Kubo at ${kuboApiUrl})`
                );

                // Parse Kubo URL to extract host and port for multiaddr
                const kuboUrl = new URL(kuboApiUrl);
                const kuboHost = kuboUrl.hostname;
                const kuboPort = kuboUrl.port || '5001';

                // Note: We'll need to get the Kubo peer ID to create a proper multiaddr
                // For now, we'll create Helia and let it discover Kubo through the network
                const heliaConfig: HeliaInit<Libp2p<Record<string, unknown>>> =
                    {
                        libp2p: {
                            addresses: {
                                listen: ['/ip4/0.0.0.0/tcp/0'],
                            },
                            transports: [tcp()],
                            peerDiscovery: [
                                bootstrap({
                                    list: [
                                        `/dnsaddr/${kuboHost}/tcp/${kuboPort}`,
                                        // Add more bootstrap nodes if configured
                                        ...(appConfig.ipfs.bootstrapNodes ||
                                            []),
                                    ],
                                }),
                            ],
                            connectionEncrypters: [noise()],
                            streamMuxers: [yamux()],
                            services: {
                                identify: identify(),
                                pubsub: gossipsub({
                                    allowPublishToZeroTopicPeers: true,
                                }),
                            },
                        },
                        blockBrokers: [
                            // Use default block brokers
                        ],
                        datastore: new MemoryDatastore(),
                        blockstore: new MemoryBlockstore(),
                    };

                // Create Helia instance
                this.helia = await createHelia(heliaConfig);

                // Update connection status
                await this.updateConnectionStatus();

                if (!this.connectionStatus.connected) {
                    throw new Error('Failed to establish Helia node');
                }

                this.logger.info('✅ Helia node created successfully', {
                    peerId: this.helia.libp2p.peerId.toString(),
                    listeningAddrs: this.helia.libp2p
                        .getMultiaddrs()
                        .map(ma => ma.toString()),
                });

                // Log Kubo connection intent
                this.logger.info(
                    `📡 Helia node will discover and connect to Kubo node at ${kuboHost}:${kuboPort}`
                );
            } catch (error) {
                this.logger.error('❌ Failed to initialize Helia node', {
                    error: error instanceof Error ? error.message : error,
                    kuboApiUrl,
                });
            }
            cooldown = Math.min(cooldown + 1000, maxCooldown);
            await wait(cooldown);
        }
    }

    async awaitConnection(): Promise<void> {
        while (!(await this.updateConnectionStatus())) {
            await wait(5000);
            this.logger.info('🔄 Waiting for Helia connection...');
        }
    }

    /**
     * Check Helia node status
     */
    private async updateConnectionStatus(): Promise<boolean> {
        if (!this.helia) {
            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
                error: 'Helia not initialized',
                peers: 0,
            };
            return false;
        }

        try {
            const peerId = this.helia.libp2p.peerId.toString();
            const peers = this.helia.libp2p.getPeers();

            this.connectionStatus = {
                connected: true,
                peerId,
                lastCheck: Date.now(),
                peers: peers.length,
            };

            this.logger.debug('✅ Helia connection verified', {
                peerId,
                peerCount: peers.length,
            });

            return true;
        } catch (error) {
            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error',
                peers: 0,
            };

            this.logger.debug('❌ Helia connection check failed', {
                error: error instanceof Error ? error.message : error,
            });

            return false;
        }
    }

    /**
     * Get the Helia instance for use by OrbitDB
     */
    getHeliaInstance(): Helia<Libp2p<Record<string, unknown>>> | null {
        return this.helia;
    }

    /**
     * Get connection status
     */
    getConnectionStatus(): HeliaConnectionStatus {
        return this.connectionStatus;
    }

    /**
     * Get peer information
     */
    async getPeers(): Promise<string[]> {
        if (!this.helia) {
            return [];
        }
        return this.helia.libp2p.getPeers().map(peer => peer.toString());
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        try {
            this.logger.info('🛑 Shutting down Helia node');

            if (this.helia) {
                await this.helia.stop();
                this.helia = null;
            }

            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
                peers: 0,
            };

            this.logger.info('✅ Helia node shutdown complete');
        } catch (error) {
            this.logger.error('Error during Helia node shutdown', {
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
                        peers: connectionStatus.peers,
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
                    lastCheck: connectionStatus.lastCheck,
                    peers: connectionStatus.peers,
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
