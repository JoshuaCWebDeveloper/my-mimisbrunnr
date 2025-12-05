import log from 'loglevel';
import { MessageType, Messenger } from '../../messenger.js';
import { initDevtools } from './devtools.js';
import { IpfsService } from './ipfs/ipfs-service.js';
import { TagService } from './tag/tag-service.js';
import { IdentityService } from './identity/identity-service.js';

log.setLevel('debug');

export default defineBackground(() => {
    log.info('X.com Account Tagger background script loaded');

    const messenger = new Messenger();

    // Initialize IPFS service (MM-27)
    const ipfsService = new IpfsService();

    const identityService = new IdentityService(ipfsService);

    const tagService = new TagService(ipfsService, identityService);

    initDevtools(ipfsService);

    // Connection #1: libp2p WebSocket multiaddr for Bitswap block exchange
    // Connects to Kubo through validation-proxy's WebSocket stream proxy (port 4002/ws)
    // validation-proxy transparently proxies UDP traffic to Kubo's WebSocket endpoint
    // Get Kubo's peer ID: docker exec kubo ipfs id -f "<id>"
    // Get Kubo's WebSocket multiaddr: docker exec kubo ipfs swarm addrs local | grep ws | grep 127.0.0.1
    // Format: /ip4/127.0.0.1/tcp/4002/ws/p2p/{kubo-peerId}
    const PERPETUAL_NODE_MULTIADDR =
        '/ip4/127.0.0.1/tcp/4002/ws/p2p/12D3KooWFUFJMaov3MJ7ibq46vYdZq4HLbhXvujtmmR4r3ijVNts';
    // Connection #2: HTTP API URL for kubo-rpc-client (pinning operations)
    // Connects to Kubo's HTTP RPC API through validation-proxy HTTP security facade (port 5001)
    const KUBO_API_URL = 'http://localhost:5001';

    ipfsService
        .initialize(PERPETUAL_NODE_MULTIADDR, KUBO_API_URL)
        .catch(error => {
            log.error('Failed to initialize IPFS service:', error);
        });

    // Handle messages from popup and content script
    messenger.onRuntimeMessage((message, sender, sendResponse) => {
        (async () => {
            try {
                switch (message.type) {
                    case MessageType.LIST_TAGS: {
                        const tags = await tagService.list();
                        sendResponse<MessageType.LIST_TAGS>(tags);
                        break;
                    }
                    case MessageType.LIST_TAGS_BY_USERNAME: {
                        const tags = await tagService.listByUsername(
                            message.body.username
                        );
                        sendResponse<MessageType.LIST_TAGS_BY_USERNAME>(tags);
                        break;
                    }
                    case MessageType.SAVE_TAG: {
                        const newTag = await tagService.upsert(message.body);

                        // Notify content script to refresh tags
                        messenger.sendMessageToTabs(MessageType.REFRESH_TAGS);

                        sendResponse<MessageType.SAVE_TAG>(newTag);
                        break;
                    }
                    case MessageType.DELETE_TAG: {
                        await tagService.delete(message.body.id);

                        // Notify content script to refresh tags
                        messenger.sendMessageToTabs(MessageType.REFRESH_TAGS);

                        sendResponse<MessageType.DELETE_TAG>({
                            id: message.body.id,
                        });
                        break;
                    }
                    case MessageType.GET_TAG: {
                        const tag = await tagService.get(message.body.id);

                        sendResponse<MessageType.GET_TAG>(
                            tag ?? {
                                error: 'Tag not found',
                            }
                        );
                        break;
                    }
                    case MessageType.PUBLISH_TO_IPFS: {
                        // Publish to IPFS and pin to Kubo via RPC API (Connection #2)
                        const cid = await tagService.publishUserManifest();

                        sendResponse<MessageType.PUBLISH_TO_IPFS>({ cid });
                        break;
                    }
                    case MessageType.RETRIEVE_FROM_IPFS: {
                        // Retrieve from IPFS
                        const tagCollection =
                            await tagService.retrieveTagCollection(
                                message.body.cid
                            );

                        // Convert TagCollection back to Tag array
                        // TODO(MM-28): Add decryption
                        // TODO(MM-35): Add content validation
                        // TODO(MM-32): Implement intelligent data merging
                        sendResponse<MessageType.RETRIEVE_FROM_IPFS>(
                            tagCollection
                        );
                        break;
                    }
                    case MessageType.IMPORT_FROM_IPFS: {
                        // Import tags into repository with specified mode
                        const result = await tagService.importUserManifest(
                            message.body.cid,
                            { mode: message.body.mode }
                        );

                        // Notify content script to refresh tags
                        messenger.sendMessageToTabs(MessageType.REFRESH_TAGS);

                        sendResponse<MessageType.IMPORT_FROM_IPFS>({
                            imported: result.totalImported,
                            total: result.totalTags,
                        });
                        break;
                    }
                    case MessageType.UPDATE_PUBLISHED_MANIFEST: {
                        const cid = await tagService.updatePublishedManifest();

                        sendResponse<MessageType.UPDATE_PUBLISHED_MANIFEST>({
                            cid,
                        });
                        break;
                    }
                    // Identity operations (MM-28)
                    case MessageType.CREATE_IDENTITY: {
                        const identity = await identityService.createIdentity(
                            message.body.passphrase,
                            message.body.handle
                        );

                        sendResponse<MessageType.CREATE_IDENTITY>({
                            did: identity.did,
                            handle: identity.handle,
                        });
                        break;
                    }
                    case MessageType.UNLOCK_IDENTITY: {
                        const identity = await identityService.unlockIdentity(
                            message.body.passphrase
                        );

                        sendResponse<MessageType.UNLOCK_IDENTITY>({
                            did: identity.did,
                            handle: identity.handle,
                        });
                        break;
                    }
                    case MessageType.LOCK_IDENTITY: {
                        identityService.lock();

                        sendResponse<MessageType.LOCK_IDENTITY>(undefined);
                        break;
                    }
                    case MessageType.DELETE_IDENTITY: {
                        await identityService.delete(message.body.passphrase);

                        sendResponse<MessageType.DELETE_IDENTITY>(undefined);
                        break;
                    }
                    case MessageType.HAS_IDENTITY: {
                        const hasIdentity = await identityService.hasIdentity();

                        sendResponse<MessageType.HAS_IDENTITY>({
                            hasIdentity,
                        });
                        break;
                    }
                    case MessageType.IS_IDENTITY_UNLOCKED: {
                        const isUnlocked = identityService.isUnlocked();

                        sendResponse<MessageType.IS_IDENTITY_UNLOCKED>({
                            isUnlocked,
                        });
                        break;
                    }
                    case MessageType.GET_IDENTITY_INFO: {
                        if (identityService.isUnlocked()) {
                            const identity = identityService.getCurrent();

                            sendResponse<MessageType.GET_IDENTITY_INFO>({
                                did: identity.did,
                                handle: identity.handle,
                            });
                        } else {
                            const encryptedIdentity =
                                await identityService.getEncryptedIdentity();

                            if (encryptedIdentity) {
                                sendResponse<MessageType.GET_IDENTITY_INFO>({
                                    did: encryptedIdentity.did,
                                    handle: encryptedIdentity.handle,
                                });
                            } else {
                                sendResponse<MessageType.GET_IDENTITY_INFO>(
                                    null
                                );
                            }
                        }
                        break;
                    }
                }
            } catch (error) {
                sendResponse({ error: (error as Error).message });
            }
        })();

        return true; // Keep message channel open for async response
    });
});
