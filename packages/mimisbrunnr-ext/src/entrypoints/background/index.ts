import { MessageType, Messenger } from '../../messenger.js';
import { TagRepository } from './tag-repository.js';

export default defineBackground(() => {
    // eslint-disable-next-line no-console
    console.log('X.com Account Tagger background script loaded');

    const messenger = new Messenger();

    const tagRepository = new TagRepository();

    // Handle messages from popup and content script
    messenger.onRuntimeMessage((message, sender, sendResponse) => {
        (async () => {
            try {
                switch (message.type) {
                    case MessageType.LIST_TAGS: {
                        const tags = await tagRepository.list();
                        sendResponse<MessageType.LIST_TAGS>(tags);
                        break;
                    }
                    case MessageType.LIST_TAGS_BY_USERNAME: {
                        const tags = await tagRepository.listByUsername(
                            message.body.username
                        );
                        sendResponse<MessageType.LIST_TAGS_BY_USERNAME>(tags);
                        break;
                    }
                    case MessageType.SAVE_TAG: {
                        const newTag = await tagRepository.upsert(message.body);

                        // Notify content script to refresh tags
                        await messenger.sendMessageToTabs(
                            MessageType.REFRESH_TAGS
                        );

                        sendResponse<MessageType.SAVE_TAG>(newTag);
                        break;
                    }
                    case MessageType.DELETE_TAG: {
                        await tagRepository.delete(message.body.id);

                        // Notify content script to refresh tags
                        await messenger.sendMessageToTabs(
                            MessageType.REFRESH_TAGS
                        );

                        sendResponse<MessageType.DELETE_TAG>({
                            id: message.body.id,
                        });
                        break;
                    }
                    case MessageType.GET_TAG: {
                        const tag = await tagRepository.get(message.body.id);

                        sendResponse<MessageType.GET_TAG>(
                            tag ?? {
                                error: 'Tag not found',
                            }
                        );
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
