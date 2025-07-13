import { defineContentScript } from '#imports';
import { MessageType, Messenger } from '../../messenger.js';
import { TagProcessor } from './tag-processor.js';
import { MutationObserverManager } from './mutation-observer-manager.js';

export default defineContentScript({
    matches: ['*://*.twitter.com/*', '*://*.x.com/*'],
    async main() {
        // eslint-disable-next-line no-console
        console.log('X.com Account Tagger loaded');

        const messenger = new Messenger();
        const processor = new TagProcessor(messenger);
        const observerManager = new MutationObserverManager(processor);

        // Set up message listeners
        messenger.onRuntimeMessage(message => {
            switch (message.type) {
                case MessageType.REFRESH_TAGS: {
                    // Remove existing tags and reset processing state
                    processor.resetProcessingState();
                    observerManager.resetProcessingState();

                    // Reprocess the page
                    processor.processPage();
                    break;
                }
            }
        });

        // Initialize observer
        observerManager.initialize();

        // Initial processing
        await processor.processPage();

        // Set up cleanup
        window.addEventListener('beforeunload', () => {
            observerManager.disconnect();
        });
    },
});
