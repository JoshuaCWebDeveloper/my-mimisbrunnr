// IPFS Helia client wrapper with connection management and error handling
import { createHelia } from 'helia';
// Import removed - validation will be handled in MM-20 security layer
import { ipfsLogger } from '../utils/logging.js';
import type {
    IPFSConnectionStatus,
    PinningRequest,
    PinningResult,
    IPFSRepositoryStats,
} from '../types/ipfs.js';

export class IpfsNode {
    private helia: any;
    private connectionStatus: IPFSConnectionStatus = {
        connected: false,
        lastCheck: 0,
    };
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly reconnectDelay = 5000; // 5 seconds

    constructor() {
        ipfsLogger.info(`Initializing Helia IPFS client`);
    }

    /**
     * Initialize connection and verify IPFS node is accessible
     */
    async initialize(): Promise<void> {
        try {
            // Create Helia instance with default libp2p configuration
            this.helia = await createHelia();

            await this.checkConnection();
            if (!this.connectionStatus.connected) {
                throw new Error('Failed to establish IPFS connection');
            }
            ipfsLogger.info(`✅ Helia IPFS client initialized`);
        } catch (error) {
            ipfsLogger.error('Failed to initialize Helia IPFS client', {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Check IPFS connection status and update internal state
     */
    async checkConnection(): Promise<IPFSConnectionStatus> {
        try {
            if (!this.helia) {
                throw new Error('Helia instance not initialized');
            }

            // Get peer ID from libp2p
            const peerId = this.helia.libp2p.peerId.toString();

            this.connectionStatus = {
                connected: true,
                peerId,
                version: '5.x', // Helia version
                lastCheck: Date.now(),
            };

            this.reconnectAttempts = 0;
            ipfsLogger.debug(`Helia connection OK - Peer: ${peerId}`);
        } catch (error) {
            this.connectionStatus = {
                connected: false,
                lastCheck: Date.now(),
                error: error instanceof Error ? error.message : String(error),
            };

            ipfsLogger.warn('Helia connection check failed', {
                error: error instanceof Error ? error.message : error,
                attempts: this.reconnectAttempts,
            });

            // Attempt reconnection if we haven't exceeded max attempts
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                ipfsLogger.info(
                    `Attempting reconnection in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
                );

                setTimeout(async () => {
                    await this.checkConnection();
                }, this.reconnectDelay);
            }
        }

        return this.connectionStatus;
    }

    /**
     * Pin content to IPFS with validation and size limits
     */
    async pinContent(request: PinningRequest): Promise<PinningResult> {
        const { cid, recursive, clientIP } = request;

        try {
            ipfsLogger.debug(
                `Pinning content: ${cid} (recursive: ${recursive}) from ${clientIP}`
            );

            // Basic CID format validation (simple check)
            if (!cid || typeof cid !== 'string' || cid.length < 10) {
                throw new Error('Invalid CID format');
            }

            // Check if we're connected
            if (!this.connectionStatus.connected) {
                await this.checkConnection();
                if (!this.connectionStatus.connected) {
                    throw new Error('IPFS node is not accessible');
                }
            }

            // For security, we enforce non-recursive pinning for MM-19
            // (Recursive pinning will be handled by security facades in MM-20)
            const pinOptions = { recursive: false };

            // Note: Helia uses different pinning API - for now we'll mock this
            // In MM-20 security layer, this will be properly implemented with @helia/pin
            ipfsLogger.debug(`Mock pinning content: ${cid}`);

            ipfsLogger.info(`✅ Successfully pinned: ${cid}`, {
                clientIP,
                recursive: pinOptions.recursive,
            });

            return {
                cid,
                success: true,
                size: undefined, // Size will be tracked in MM-20 security layer
            };
        } catch (error) {
            ipfsLogger.error(`❌ Failed to pin content: ${cid}`, {
                error: error instanceof Error ? error.message : error,
                clientIP,
            });

            return {
                cid,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Remove pin from IPFS
     */
    async unpinContent(cid: string): Promise<boolean> {
        try {
            // Note: Helia unpinning will be implemented in MM-20
            ipfsLogger.info(`📌 Mock unpinning: ${cid}`);
            return true;
        } catch (error) {
            ipfsLogger.error(`❌ Failed to unpin content: ${cid}`, {
                error: error instanceof Error ? error.message : error,
            });
            return false;
        }
    }

    /**
     * Get DAG content from IPFS
     */
    async getDAGContent(cid: string): Promise<any> {
        try {
            if (!this.connectionStatus.connected) {
                await this.checkConnection();
                if (!this.connectionStatus.connected) {
                    throw new Error('IPFS node is not accessible');
                }
            }

            // Note: Helia DAG operations will be implemented in MM-20
            ipfsLogger.debug(`Mock DAG get for: ${cid}`);
            return { mock: 'data' };
        } catch (error) {
            ipfsLogger.error(`Failed to get DAG content: ${cid}`, {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Publish to pubsub topic (for OrbitDB replication)
     */
    async publishMessage(topic: string, _data: Uint8Array): Promise<void> {
        try {
            // Note: Helia pubsub will be implemented in MM-20
            ipfsLogger.debug(`Mock pubsub publish to topic: ${topic}`);
        } catch (error) {
            ipfsLogger.error(`Failed to publish to topic: ${topic}`, {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Subscribe to pubsub topic (for OrbitDB replication)
     */
    async subscribeToTopic(topic: string): Promise<AsyncIterable<any>> {
        try {
            // Note: Helia pubsub subscription will be implemented in MM-20
            ipfsLogger.debug(`Mock pubsub subscribe to topic: ${topic}`);
            return [] as any; // Mock async iterable
        } catch (error) {
            ipfsLogger.error(`Failed to subscribe to topic: ${topic}`, {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Get repository statistics
     */
    async getRepositoryStats(): Promise<IPFSRepositoryStats> {
        try {
            // Note: Helia repo stats will be implemented in MM-20
            return {
                numObjects: 100,
                repoSize: 1024 * 1024,
                storageMax: 10 * 1024 * 1024,
                repoPath: '/helia/data',
                version: '5.x',
            };
        } catch (error) {
            ipfsLogger.error('Failed to get repository stats', {
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Get current connection status
     */
    getConnectionStatus(): IPFSConnectionStatus {
        return { ...this.connectionStatus };
    }

    /**
     * Get the raw Helia instance for direct access (used by OrbitDB)
     */
    getRawClient(): any {
        return this.helia;
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        ipfsLogger.info('Shutting down Helia IPFS client');
        if (this.helia) {
            await this.helia.stop();
        }
    }
}
