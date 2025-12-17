import log from 'loglevel';
import { MessageType } from '../../messenger.js';
import { App } from './app.js';

log.setLevel('debug');

export default defineBackground(() => {
    log.info('X.com Account Tagger background script loaded');

    const app = new App();

    app.start()
        .then(() => {
            log.info('App started');
        })
        .catch(error => {
            log.error('Failed to start app:', error);
        });

    // Handle messages from popup and content script
    app.messenger.onRuntimeMessage((message, sender, sendResponse) => {
        (async () => {
            try {
                switch (message.type) {
                    case MessageType.LIST_TAGS: {
                        const tags = await app.tagService.list();
                        sendResponse<MessageType.LIST_TAGS>(tags);
                        break;
                    }
                    case MessageType.LIST_TAGS_BY_USERNAME: {
                        const tags = await app.tagService.listByUsername(
                            message.body.username
                        );
                        sendResponse<MessageType.LIST_TAGS_BY_USERNAME>(tags);
                        break;
                    }
                    case MessageType.SAVE_TAG: {
                        const newTag = await app.tagService.upsert(
                            message.body
                        );

                        // Notify content script to refresh tags
                        app.messenger.sendMessageToTabs(
                            MessageType.REFRESH_TAGS
                        );

                        sendResponse<MessageType.SAVE_TAG>(newTag);
                        break;
                    }
                    case MessageType.DELETE_TAG: {
                        await app.tagService.delete(message.body.id);

                        // Notify content script to refresh tags
                        app.messenger.sendMessageToTabs(
                            MessageType.REFRESH_TAGS
                        );

                        sendResponse<MessageType.DELETE_TAG>({
                            id: message.body.id,
                        });
                        break;
                    }
                    case MessageType.GET_TAG: {
                        const tag = await app.tagService.get(message.body.id);

                        sendResponse<MessageType.GET_TAG>(
                            tag ?? {
                                error: 'Tag not found',
                            }
                        );
                        break;
                    }
                    case MessageType.PUBLISH_TO_IPFS: {
                        // Publish to IPFS and pin to Kubo via RPC API (Connection #2)
                        const cid = await app.tagService.publishUserManifest();

                        sendResponse<MessageType.PUBLISH_TO_IPFS>({ cid });
                        break;
                    }
                    case MessageType.RETRIEVE_FROM_IPFS: {
                        // Retrieve from IPFS
                        const tagCollection =
                            await app.tagService.retrieveTagCollection(
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
                        const result = await app.tagService.importUserManifest(
                            message.body.cid,
                            { mode: message.body.mode }
                        );

                        // Notify content script to refresh tags
                        app.messenger.sendMessageToTabs(
                            MessageType.REFRESH_TAGS
                        );

                        sendResponse<MessageType.IMPORT_FROM_IPFS>({
                            imported: result.totalImported,
                            total: result.totalTags,
                        });
                        break;
                    }
                    case MessageType.UPDATE_PUBLISHED_MANIFEST: {
                        const cid =
                            await app.tagService.updatePublishedManifest();

                        sendResponse<MessageType.UPDATE_PUBLISHED_MANIFEST>({
                            cid,
                        });
                        break;
                    }
                    // Identity operations (MM-28)
                    case MessageType.CREATE_IDENTITY: {
                        const identity =
                            await app.identityService.createIdentity(
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
                        const identity =
                            await app.identityService.unlockIdentity(
                                message.body.passphrase
                            );

                        sendResponse<MessageType.UNLOCK_IDENTITY>({
                            did: identity.did,
                            handle: identity.handle,
                        });
                        break;
                    }
                    case MessageType.LOCK_IDENTITY: {
                        app.identityService.lock();

                        sendResponse<MessageType.LOCK_IDENTITY>(undefined);
                        break;
                    }
                    case MessageType.DELETE_IDENTITY: {
                        await app.identityService.delete(
                            message.body.passphrase
                        );

                        sendResponse<MessageType.DELETE_IDENTITY>(undefined);
                        break;
                    }
                    case MessageType.HAS_IDENTITY: {
                        const hasIdentity =
                            await app.identityService.hasIdentity();

                        sendResponse<MessageType.HAS_IDENTITY>({
                            hasIdentity,
                        });
                        break;
                    }
                    case MessageType.IS_IDENTITY_UNLOCKED: {
                        const isUnlocked = app.identityService.isUnlocked();

                        sendResponse<MessageType.IS_IDENTITY_UNLOCKED>({
                            isUnlocked,
                        });
                        break;
                    }
                    case MessageType.GET_IDENTITY_INFO: {
                        if (app.identityService.isUnlocked()) {
                            const identity = app.identityService.getCurrent();

                            sendResponse<MessageType.GET_IDENTITY_INFO>({
                                did: identity.did,
                                handle: identity.handle,
                            });
                        } else {
                            const encryptedIdentity =
                                await app.identityService.getEncryptedIdentity();

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
                    // Discovery operations (MM-30)
                    case MessageType.PUBLISH_DISCOVERY: {
                        // Get current identity info
                        if (!app.identityService.isUnlocked()) {
                            throw new Error(
                                'Identity must be unlocked to publish discovery'
                            );
                        }

                        // Get IPNS key from last publish
                        // TODO(MM-29): Store IPNS key in identity service
                        // For now, we'll need to get it from the manifest publish flow
                        // This is a limitation that will be addressed when we integrate
                        // discovery publishing into the manifest publish workflow

                        throw new Error(
                            'Discovery publishing not yet integrated with manifest publish. Use PUBLISH_TO_IPFS which will auto-publish discovery.'
                        );
                    }
                    case MessageType.DISCOVER_BY_HANDLE: {
                        const record =
                            await app.discoveryService.discoverByHandle(
                                message.body.handle
                            );

                        if (record) {
                            sendResponse<MessageType.DISCOVER_BY_HANDLE>({
                                handle: record.handle,
                                ipnsKey: record.ipnsKey,
                                did: record.did,
                                updatedAt: record.updatedAt,
                            });
                        } else {
                            sendResponse<MessageType.DISCOVER_BY_HANDLE>(null);
                        }
                        break;
                    }
                    case MessageType.GET_DISCOVERY_STATUS: {
                        const isInitialized =
                            app.orbitdbService.isInitialized();
                        const orbitdbId = app.orbitdbService.getId();

                        sendResponse<MessageType.GET_DISCOVERY_STATUS>({
                            isInitialized,
                            orbitdbId,
                        });
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
