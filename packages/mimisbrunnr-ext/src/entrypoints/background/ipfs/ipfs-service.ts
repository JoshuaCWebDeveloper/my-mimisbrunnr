import log from 'loglevel';
import { createHelia, type Helia } from 'helia';
import { dagJson, type DAGJSON } from '@helia/dag-json';
import { createIPNSRecord, marshalIPNSRecord } from 'ipns';
import { peerIdFromPublicKey } from '@libp2p/peer-id';
import { MemoryBlockstore } from 'blockstore-core';
import { MemoryDatastore } from 'datastore-core';
import {
    create as createKuboClient,
    type KuboRPCClient,
} from 'kubo-rpc-client';
import { Libp2pConnection } from './libp2p-connection.js';
import { CID } from 'multiformats/cid';
import type { Ed25519PrivateKey } from '@libp2p/interface';

export interface AddObjectOptions {
    pin?: boolean;
}

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
    private async propagateToDagJson(cidString: string): Promise<void> {
        if (!this.kuboClient || !this.helia) {
            throw new Error('Kubo RPC client or Helia not initialized');
        }

        try {
            log.info(
                '[IpfsService] Pinning content to perpetual node via dag/put:',
                cidString
            );

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
     * Add an object to IPFS
     *
     * @param object - The object to add
     * @param options - Options for the add operation
     * @returns CID of the added object
     *
     * @remarks
     * TODO(MM-35): Add content validation (size limits, schema validation)
     * TODO(MM-36): Add timeout and retry logic
     */
    async addObject(
        object: unknown,
        { pin = true }: AddObjectOptions = {}
    ): Promise<string> {
        if (!this.helia || !this.dagJsonCodec || !this.kuboClient) {
            throw new Error('IPFS service not initialized');
        }

        try {
            log.info('[IpfsService] Publishing object:', object);

            // TODO(MM-35): Validate content size (should be <= 1MB per spec)
            // TODO(MM-35): Validate schema structure
            // TODO(MM-28): Encrypt content before publishing

            // Publish JSON to IPFS using dag-json codec
            const cid = await this.dagJsonCodec.add(object);

            log.info(
                '[IpfsService] Object published successfully:',
                cid.toString()
            );

            // pin content via kubo-rpc-client using dag/put (Connection #2: HTTP API)
            if (pin) {
                await this.propagateToDagJson(cid.toString());

                log.info(
                    '[IpfsService] Content pinned via dag/put with CID verification:',
                    cid.toString()
                );
            }

            // TODO(MM-34): Cache published content in IndexedDB

            return cid.toString();
        } catch (error) {
            log.error('[IpfsService] Failed to publish object:', error);
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Retrieve an object from IPFS by CID
     *
     * @param cidString - CID string of the content to retrieve
     * @returns The retrieved object
     *
     * @remarks
     * TODO(MM-35): Add content validation after retrieval
     * TODO(MM-36): Add timeout and retry logic
     * TODO(MM-34): Check cache before fetching from network
     */
    async retrieveObject(cidString: string): Promise<unknown> {
        if (!this.helia || !this.dagJsonCodec) {
            throw new Error('IPFS service not initialized');
        }

        try {
            log.info('[IpfsService] Retrieving object:', cidString);

            // TODO(MM-34): Check IndexedDB cache first

            // Parse CID string
            const cid = CID.parse(cidString);

            // Retrieve JSON from IPFS using dag-json codec
            // TODO(MM-36): Add timeout (30s as per spec)
            const object = await this.dagJsonCodec.get(cid);

            log.info('[IpfsService] Object retrieved successfully:', object);

            // TODO(MM-35): Validate retrieved content structure
            // TODO(MM-35): Check content size limits
            // TODO(MM-28): Decrypt content if encrypted
            // TODO(MM-34): Cache retrieved content in IndexedDB

            return object;
        } catch (error) {
            log.error('[IpfsService] Failed to retrieve object:', error);
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Publish a CID to IPNS using user's identity key (MM-29)
     *
     * @param cidString - CID to publish (typically DID document CID)
     * @param privateKey - User's Ed25519 private key (from identity)
     * @param sequenceNumber - IPNS record sequence number (default: 0)
     * @returns IPNS name (Peer ID string)
     *
     * @remarks
     * IPNS (InterPlanetary Name System) provides mutable pointers to content.
     *
     * Architecture (MM-29):
     * 1. Browser creates and signs IPNS record using user's identity key (via ipns package)
     * 2. Marshal the record to protobuf bytes
     * 3. POST the raw record to validation-proxy at /api/v0/routing/put
     * 4. validation-proxy validates the record via validation-service
     * 5. If valid, forward to Kubo which publishes to DHT
     *
     * This keeps the user's private key in the browser and derives a unique IPNS name
     * from their identity, ensuring each user has their own IPNS name.
     *
     * TODO(MM-36): Add retry logic with exponential backoff
     * TODO(MM-36): Implement sequence number tracking (for updates)
     * TODO(MM-35): Validate CID format before publishing
     */
    async publishToIpns(
        cidString: string,
        privateKey: Ed25519PrivateKey,
        sequenceNumber = 0n
    ): Promise<string> {
        if (!this.kuboClient) {
            throw new Error('Kubo RPC client not initialized');
        }

        try {
            // Validate CID format
            const cid = CID.parse(cidString);

            log.info(
                '[IpfsService] Creating IPNS record:',
                `CID: ${cidString}, Sequence: ${sequenceNumber}`
            );

            // Create and sign IPNS record in the browser using the user's identity key
            // Lifetime: 24 hours (86400000 ms) as per IPNS defaults
            const ipnsRecord = await createIPNSRecord(
                privateKey,
                cid,
                sequenceNumber,
                86400000
            );

            // Marshal the IPNS record to protobuf bytes
            const marshaledRecord = marshalIPNSRecord(ipnsRecord);

            // Get the Peer ID (IPNS name) from the public key
            const peerId = peerIdFromPublicKey(privateKey.publicKey);
            const peerIdString = peerId.toString();

            log.info(
                '[IpfsService] IPNS record created, publishing to DHT:',
                `IPNS Name: ${peerIdString}`
            );

            // Publish the marshaled IPNS record to the DHT via Kubo
            // This goes through validation-proxy which validates via validation-service
            await this.kuboClient.routing.put(
                `/ipns/${peerIdString}`,
                marshaledRecord
            );

            log.info(
                '[IpfsService] IPNS published successfully to DHT:',
                `IPNS: ${peerIdString}, CID: ${cidString}`
            );

            // TODO(MM-36): Verify IPNS resolution
            // TODO(MM-36): Store IPNS record metadata (sequence number, timestamp)

            return peerIdString;
        } catch (error) {
            log.error('[IpfsService] Failed to publish IPNS:', error);
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }

    /**
     * Resolve an IPNS name to CID (MM-29)
     *
     * @param ipnsName - IPNS name (k51qzi5uqu5d... format)
     * @returns Resolved CID
     *
     * @remarks
     * Resolves IPNS name to current CID via Kubo RPC API
     *
     * TODO(MM-36): Add retry logic with exponential backoff
     * TODO(MM-36): Add timeout (10s as per spec)
     * TODO(MM-36): Add IPNS freshness validation
     * TODO(MM-34): Cache IPNS resolutions
     */
    async resolveIpns(ipnsName: string): Promise<string> {
        if (!this.kuboClient) {
            throw new Error('Kubo RPC client not initialized');
        }

        try {
            log.info('[IpfsService] Resolving IPNS:', ipnsName);

            // TODO(MM-36): Add timeout wrapper

            // Resolve IPNS via Kubo RPC API
            let cid: string | undefined = undefined;
            for await (const result of this.kuboClient.name.resolve(ipnsName)) {
                if (!result) {
                    continue;
                }

                cid = result.replace('/ipfs/', '');
                break;
            }

            if (!cid) {
                throw new Error(`No results returned for IPNS: ${ipnsName}`);
            }

            log.info(
                '[IpfsService] IPNS resolved successfully:',
                `IPNS: ${ipnsName}, CID: ${cid}`
            );

            // TODO(MM-34): Cache resolution
            // TODO(MM-36): Validate freshness (sequence numbers)

            return cid;
        } catch (error) {
            log.error('[IpfsService] Failed to resolve IPNS:', error);
            // TODO(MM-36): Add proper error handling and user notification
            throw error;
        }
    }
}
