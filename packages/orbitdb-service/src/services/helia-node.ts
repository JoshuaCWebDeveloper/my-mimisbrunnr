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
import { Libp2pConnection } from '@my-mimisbrunnr/ipfs';
import { AppConfiguration } from '../config/configuration.js';
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { dagJson, type DAGJSON } from '@helia/dag-json';
import { dagCbor, type DAGCBOR } from '@helia/dag-cbor';
import { CID } from 'multiformats/cid';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export enum IpfsCodec {
    DAG_JSON = 'dag-json',
    DAG_CBOR = 'dag-cbor',
}

type CodecTypeMap = {
    [IpfsCodec.DAG_JSON]: DAGJSON;
    [IpfsCodec.DAG_CBOR]: DAGCBOR;
};

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
    private ipfsCodecs: Partial<Record<IpfsCodec, CodecTypeMap[IpfsCodec]>> =
        {};
    private libp2pConnection: Libp2pConnection | null = null;
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

    private registerCodecs(codecs: IpfsCodec[]): void {
        if (!this.helia) {
            throw new Error('Helia node not initialized');
        }

        for (const codec of codecs) {
            switch (codec) {
                case IpfsCodec.DAG_JSON:
                    this.ipfsCodecs[IpfsCodec.DAG_JSON] = dagJson({
                        blockstore: this.helia.blockstore,
                    });
                    break;
                case IpfsCodec.DAG_CBOR:
                    this.ipfsCodecs[IpfsCodec.DAG_CBOR] = dagCbor({
                        blockstore: this.helia.blockstore,
                    });
                    break;
            }
        }
    }

    private getCodec(codec: IpfsCodec): CodecTypeMap[IpfsCodec] {
        if (!this.ipfsCodecs[codec]) {
            throw new Error(`Codec ${codec} not registered`);
        }

        return this.ipfsCodecs[codec];
    }

    /**
     * Initialize Helia node with connection to Kubo
     */
    async initialize(): Promise<void> {
        const appConfig = this.configService.get<AppConfiguration>(
            'app'
        ) as AppConfiguration;

        const maxCooldown = 10 * 1000;
        let cooldown = 0;
        const port = appConfig.service.port;
        const kuboMultiaddr = appConfig.ipfs.gatewayMultiaddr;
        const keyString = appConfig.orbitdb.libp2pPrivateKey;
        const protobufBytes = Buffer.from(keyString, 'base64');
        const privateKey = privateKeyFromProtobuf(protobufBytes);

        while (!this.connectionStatus.connected) {
            try {
                this.logger.info(
                    `🔗 Creating Helia node (will connect to Kubo at ${kuboMultiaddr})`
                );

                const heliaConfig: HeliaInit<Libp2p<Record<string, unknown>>> =
                    {
                        libp2p: {
                            privateKey,
                            addresses: {
                                listen: [
                                    `/ip4/0.0.0.0/tcp/${port + 1}`,
                                    `/ip4/0.0.0.0/tcp/${port + 2}/ws`,
                                ],
                            },
                            transports: [tcp(), webSockets()],
                            peerDiscovery: appConfig.ipfs.bootstrapNodes?.length
                                ? [
                                      bootstrap({
                                          list: appConfig.ipfs.bootstrapNodes,
                                      }),
                                  ]
                                : undefined,
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

                this.registerCodecs(Object.values(IpfsCodec));

                this.libp2pConnection = kuboMultiaddr
                    ? new Libp2pConnection(this.helia.libp2p, kuboMultiaddr)
                    : null;

                // Wait for connection to be established
                await this.awaitConnection();

                this.logger.info('✅ Helia node created successfully', {
                    peerId: this.helia.libp2p.peerId.toString(),
                    listeningAddrs: this.helia.libp2p
                        .getMultiaddrs()
                        .map(ma => ma.toString()),
                });
            } catch (error) {
                this.logger.error('❌ Failed to initialize Helia node', {
                    error: error instanceof Error ? error.message : error,
                    kuboMultiaddr,
                });
            }
            cooldown = Math.min(cooldown + 1000, maxCooldown);
            await wait(cooldown);
        }
    }

    async awaitConnection(): Promise<void> {
        while (!this.connectionStatus.connected) {
            await this.updateConnectionStatus();
            await wait(5000);
            this.logger.info('🔄 Waiting for Helia connection...');
        }
    }

    /**
     * Check Helia node status
     */
    private async updateConnectionStatus(): Promise<void> {
        const baseConnectionStatus = {
            connected: false,
            lastCheck: Date.now(),
            peers: 0,
        };

        if (!this.helia) {
            this.connectionStatus = {
                ...baseConnectionStatus,
                error: 'Helia not initialized',
            };
            return;
        }

        try {
            const peerId = this.helia.libp2p.peerId.toString();
            const peers = this.helia.libp2p.getPeers();

            if (!this.libp2pConnection) {
                this.connectionStatus = {
                    ...baseConnectionStatus,
                    error: 'Libp2p connection not initialized',
                    peers: peers.length,
                    peerId,
                };
                return;
            }

            const libp2pConnectionStatus =
                this.libp2pConnection.getConnectionInfo();

            this.connectionStatus = {
                ...baseConnectionStatus,
                connected: libp2pConnectionStatus.isConnected,
                peerId,
                peers: peers.length,
            };

            this.logger.debug('✅ Helia connection verified', {
                peerId,
                peerCount: peers.length,
            });
        } catch (error) {
            this.connectionStatus = {
                ...baseConnectionStatus,
                error: error instanceof Error ? error.message : 'Unknown error',
            };

            this.logger.debug('❌ Helia connection check failed', {
                error: error instanceof Error ? error.message : error,
            });
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

    get blockstore() {
        if (!this.helia) {
            throw new Error('Helia node not initialized');
        }

        return this.helia?.blockstore;
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

    /**
     * Retrieve an object from IPFS by CID
     *
     * @param cidString - CID string of the content to retrieve
     * @returns The retrieved object
     *
     */
    async retrieveObject(
        cidString: string,
        codecName = IpfsCodec.DAG_JSON
    ): Promise<unknown> {
        const codec = this.getCodec(codecName);

        try {
            this.logger.info('Retrieving object:', cidString);

            // Parse CID string
            const cid = CID.parse(cidString);

            // Retrieve JSON from IPFS using dag-json codec
            const object = await codec.get(cid);

            this.logger.info('Object retrieved successfully:', object);

            return object;
        } catch (error) {
            this.logger.error('Failed to retrieve object:', error);
            throw error;
        }
    }
}
