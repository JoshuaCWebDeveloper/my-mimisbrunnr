import log from 'loglevel';
import { createHelia, type Helia } from 'helia';
import { dagJson, type DAGJSON } from '@helia/dag-json';
import { MemoryBlockstore } from 'blockstore-core';
import { MemoryDatastore } from 'datastore-core';
import {
    create as createKuboClient,
    type KuboRPCClient,
} from 'kubo-rpc-client';
import type { TagCollection } from '@my-mimisbrunnr/protocol';
import { Libp2pConnection } from './libp2p-connection.js';

/**
 * IPFS Service using Helia for publishing and retrieving tag collections
 *
 * This is a minimal implementation for MM-27 POC that demonstrates:
 * - Basic IPFS publish/retrieve cycle using Helia with dag-json codec
 * - Optional pinning to perpetual node via kubo-rpc-client HTTP API using dag/put
 * - Content discovery via DHT (automatic in Helia)
 *
 * Encoding format:
 * - Uses dag-json codec (not plain JSON) as per technical spec
 * - Ensures CID compatibility between Helia and Kubo
 * - Enables IPLD linking capabilities for future features
 *
 * Pinning strategy:
 * - Uses dag/put endpoint instead of pin/add for atomic upload+pin operations
 * - Verifies CID matches between local Helia node and remote Kubo node
 * - Content passes through validation-proxy for security checks
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-28): No encryption - tags published in plain text
 * - TODO(MM-35): No content validation - no size limits or schema validation
 * - TODO(MM-36): No error handling - basic try/catch only, no retry logic
 * - TODO(MM-34): No caching - all IPFS operations fetch from network
 * - TODO(MM-36): No rate limiting - no protection against excessive API calls
 * - TODO(MM-28, MM-31): No authentication - anyone can retrieve published CIDs
 * - TODO(MM-33): No service architecture - direct implementation in background script
 * - TODO(MM-30): No libp2p dial to Kubo - will be added for OrbitDB
 */
export class IpfsService {
    private helia: Helia | null = null;
    private dagJsonCodec: DAGJSON | null = null;
    private kuboClient: KuboRPCClient | null = null;
    public libp2pConnection: Libp2pConnection | null = null;

    /**
     * Initialize Helia IPFS node for MM-27 POC with dual connections:
     * - Connection #1: libp2p to Kubo via WebTransport for Bitswap block exchange
     * - Connection #2: HTTP API via kubo-rpc-client for dag/put-based pinning
     *
     * @param perpetualNodeMultiaddr - WebTransport multiaddr of Kubo node (with certhash)
     * @param kuboApiUrl - HTTP API URL for kubo-rpc-client (default: http://localhost:5001)
     * @remarks
     * MM-27 establishes both connections to prove extension ↔ perpetual node communication.
     * Connection #1 enables Bitswap for content retrieval via WebTransport.
     * Connection #2 enables optional pinning via dag/put with CID verification.
     *
     * TODO(MM-36): Add connection retry logic with exponential backoff
     * TODO(MM-34): Add IndexedDB persistence for blocks
     */
    async initialize(
        perpetualNodeMultiaddr?: string,
        kuboApiUrl?: string
    ): Promise<void> {
        try {
            log.info(
                '[IpfsService] Initializing Helia IPFS node for MM-27 POC...'
            );

            // Initialize kubo-rpc-client for pinning (Connection #2: HTTP API)
            // TODO(MM-36): Add error handling for kubo client initialization
            const apiUrl = kuboApiUrl || 'http://localhost:5001';
            this.kuboClient = createKuboClient({ url: apiUrl });
            log.info(
                '[IpfsService] Kubo RPC client initialized for pinning:',
                apiUrl
            );

            // Create Helia instance with libp2p configuration from Libp2pConnection
            // TODO(MM-34): Replace MemoryBlockstore/MemoryDatastore with IndexedDB persistence
            this.helia = await createHelia({
                blockstore: new MemoryBlockstore(),
                datastore: new MemoryDatastore(),
                libp2p: Libp2pConnection.createLibp2pOptions(
                    perpetualNodeMultiaddr
                ),
            });

            // Initialize DAG-JSON codec for publishing/retrieving JSON data with dag-json encoding
            // Note: dagJson accepts an object with blockstore property
            this.dagJsonCodec = dagJson({ blockstore: this.helia.blockstore });

            log.info(
                '[IpfsService] Helia IPFS node initialized successfully',
                `Peer ID: ${this.helia.libp2p.peerId.toString()}`
            );

            // Initialize libp2p connection manager (Connection #1: libp2p for Bitswap)
            this.libp2pConnection = new Libp2pConnection(
                this.helia.libp2p,
                perpetualNodeMultiaddr ? [perpetualNodeMultiaddr] : []
            );
        } catch (error) {
            log.error('[IpfsService] Failed to initialize Helia:', error);
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Publish a tag collection to IPFS
     *
     * @param tagCollection - The tag collection to publish
     * @param pin - Whether to pin the content via kubo-rpc-client (optional, default: false)
     * @returns CID of the published content
     *
     * @remarks
     * TODO(MM-28): Add encryption before publishing
     * TODO(MM-35): Add content validation (size limits, schema validation)
     * TODO(MM-36): Add timeout and retry logic
     * TODO(MM-36): Add rate limiting
     */
    async publishTagCollection(
        tagCollection: TagCollection,
        { pin = false }: { pin?: boolean } = {}
    ): Promise<string> {
        if (!this.helia || !this.dagJsonCodec || !this.kuboClient) {
            throw new Error('IPFS service not initialized');
        }

        try {
            log.info('[IpfsService] Publishing tag collection:', tagCollection);

            // TODO(MM-35): Validate content size (should be <= 1MB per spec)
            // TODO(MM-35): Validate schema structure
            // TODO(MM-28): Encrypt content before publishing

            // Publish JSON to IPFS using dag-json codec
            const cid = await this.dagJsonCodec.add(tagCollection);

            log.info(
                '[IpfsService] Tag collection published successfully:',
                cid.toString()
            );

            // pin content via kubo-rpc-client using dag/put (Connection #2: HTTP API)
            if (pin) {
                await this.pinContent(cid.toString());

                log.info(
                    '[IpfsService] Content pinned via dag/put with CID verification:',
                    cid.toString()
                );
            }

            // TODO(MM-34): Cache published content in IndexedDB

            return cid.toString();
        } catch (error) {
            log.error('[IpfsService] Failed to publish tag collection:', error);
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Pin content to the perpetual node via kubo-rpc-client HTTP API using dag/put
     * This is Connection #2: HTTP API for pinning operations
     *
     * This method:
     * 1. Retrieves the raw block data from Helia's blockstore
     * 2. Uploads the block to Kubo using dag/put with pin=true
     * 3. Verifies the returned CID matches our local CID
     *
     * @param cidString - CID string to pin
     * @remarks
     * TODO(MM-36): Add retry logic with exponential backoff
     * TODO(MM-36): Add rate limiting
     */
    private async pinContent(cidString: string): Promise<void> {
        if (!this.kuboClient || !this.helia) {
            throw new Error('Kubo RPC client or Helia not initialized');
        }

        try {
            log.info(
                '[IpfsService] Pinning content to perpetual node via dag/put:',
                cidString
            );

            const { CID } = await import('multiformats/cid');
            const cid = CID.parse(cidString);

            // Get the raw block data from Helia's blockstore
            const blockData = await this.helia.blockstore.get(cid);

            log.info(
                '[IpfsService] Retrieved block from local blockstore:',
                `CID: ${cidString}, Size: ${blockData.length} bytes`
            );

            // Upload block to Kubo using dag/put with pin=true
            // The dag/put endpoint will validate content via validation-proxy
            const remoteCid = await this.kuboClient.dag.put(blockData, {
                storeCodec: 'dag-json',
                inputCodec: 'dag-json',
                pin: true,
            });

            log.info(
                '[IpfsService] Content uploaded via dag/put:',
                `Local CID: ${cidString}, Remote CID: ${remoteCid.toString()}`
            );

            // Verify CID matches
            if (remoteCid.toString() !== cidString) {
                throw new Error(
                    `CID mismatch: local=${cidString}, remote=${remoteCid.toString()}`
                );
            }

            log.info(
                '[IpfsService] Content pinned successfully with verified CID:',
                cidString
            );
        } catch (error) {
            log.error('[IpfsService] Failed to pin content:', error);
            throw error;
        }
    }

    /**
     * Retrieve a tag collection from IPFS by CID
     *
     * @param cidString - CID string of the content to retrieve
     * @returns The retrieved tag collection
     *
     * @remarks
     * TODO(MM-28): Add decryption after retrieval
     * TODO(MM-35): Add content validation after retrieval
     * TODO(MM-36): Add timeout and retry logic
     * TODO(MM-34): Check cache before fetching from network
     */
    async retrieveTagCollection(cidString: string): Promise<TagCollection> {
        if (!this.helia || !this.dagJsonCodec) {
            throw new Error('IPFS service not initialized');
        }

        try {
            log.info('[IpfsService] Retrieving tag collection:', cidString);

            // TODO(MM-34): Check IndexedDB cache first

            // Parse CID string
            const { CID } = await import('multiformats/cid');
            const cid = CID.parse(cidString);

            // Retrieve JSON from IPFS using dag-json codec
            // TODO(MM-36): Add timeout (30s as per spec)
            const tagCollection = await this.dagJsonCodec.get(cid);

            log.info(
                '[IpfsService] Tag collection retrieved successfully:',
                tagCollection
            );

            // TODO(MM-35): Validate retrieved content structure
            // TODO(MM-35): Check content size limits
            // TODO(MM-28): Decrypt content if encrypted
            // TODO(MM-34): Cache retrieved content in IndexedDB

            return tagCollection as TagCollection;
        } catch (error) {
            log.error(
                '[IpfsService] Failed to retrieve tag collection:',
                error
            );
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Shutdown the IPFS node
     *
     * @remarks
     * TODO(MM-34): Backup blocks to IndexedDB before stopping
     */
    async stop(): Promise<void> {
        if (!this.helia) {
            return;
        }

        try {
            log.info('[IpfsService] Stopping Helia IPFS node...');

            // Shutdown libp2p connection manager
            await this.libp2pConnection?.shutdown();

            // TODO(MM-34): Backup blocks to IndexedDB

            await this.helia.stop();
            this.helia = null;
            this.dagJsonCodec = null;
            this.libp2pConnection = null;

            log.info('[IpfsService] Helia IPFS node stopped successfully');
        } catch (error) {
            log.error('[IpfsService] Failed to stop Helia:', error);
            throw error;
        }
    }

    /**
     * Check if IPFS service is initialized
     */
    isInitialized(): boolean {
        return this.helia !== null && this.dagJsonCodec !== null;
    }

    /**
     * Get the peer ID of the Helia node
     */
    getPeerId(): string | null {
        return this.helia?.libp2p.peerId.toString() ?? null;
    }
}
