import log from 'loglevel';
import { Messenger } from '../../messenger.js';
import { initDevtools } from './devtools.js';
import { DiscoveryService } from './discovery/discovery-service.js';
import { ExtensionOrbitDbManager } from './discovery/extension-orbitdb-manager.js';
import { IdentityService } from './identity/identity-service.js';
import { IpfsService } from './ipfs/ipfs-service.js';
import { TagService } from './tag/tag-service.js';

export class App {
    public readonly messenger = new Messenger();
    public readonly ipfsService = new IpfsService();
    public readonly orbitdbService = new ExtensionOrbitDbManager();
    public readonly discoveryService = new DiscoveryService(
        this.orbitdbService
    );
    public readonly identityService = new IdentityService(this.ipfsService);
    public readonly tagService = new TagService(
        this.ipfsService,
        this.identityService,
        this.discoveryService
    );

    async start() {
        initDevtools(this.ipfsService);

        // Connection #1: libp2p WebSocket multiaddr for Bitswap block exchange
        // Connects to Kubo through validation-proxy's WebSocket stream proxy (port 4002/ws)
        // validation-proxy transparently proxies UDP traffic to Kubo's WebSocket endpoint
        // Get Kubo's peer ID: docker exec kubo ipfs id -f "<id>"
        // Get Kubo's WebSocket multiaddr: docker exec kubo ipfs swarm addrs local | grep ws | grep 127.0.0.1
        // Format: /ip4/127.0.0.1/tcp/4002/ws/p2p/{kubo-peerId}
        const PERPETUAL_NODE_MULTIADDR =
            '/ip4/127.0.0.1/tcp/6002/ws/p2p/12D3KooWAaM3G2rXAkPW5NhKzsLgfcht6e3sYuMmFXbVdfDpJMXc';
        // Connection #2: HTTP API URL for kubo-rpc-client (pinning operations)
        // Connects to Kubo's HTTP RPC API through validation-proxy HTTP security facade (port 5001)
        const KUBO_API_URL = 'http://localhost:5001';

        try {
            // Initialize IPFS first, then OrbitDB (MM-30)
            await this.ipfsService.initialize(
                PERPETUAL_NODE_MULTIADDR,
                KUBO_API_URL
            );
        } catch (error) {
            log.error('[Background] Failed to initialize services:', error);
            return;
        }

        log.info('[Background] IPFS service initialized, starting OrbitDB...');

        // Get Helia instance for OrbitDB
        const helia = this.ipfsService.getHelia();

        if (!helia) {
            throw new Error(
                'Helia instance not available after IPFS initialization'
            );
        }

        // Initialize OrbitDB using Helia's libp2p connection
        await this.orbitdbService.start(Promise.resolve(helia));

        log.info('[Background] OrbitDB and Discovery services ready for MM-30');
    }
}
