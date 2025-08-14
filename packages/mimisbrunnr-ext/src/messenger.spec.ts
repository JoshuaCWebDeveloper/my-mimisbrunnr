import { Messenger, MessageType } from './messenger.js';

describe('Messenger', () => {
    let messenger: Messenger;

    beforeEach(() => {
        messenger = new Messenger();
    });

    it('should be defined', () => {
        expect(messenger).toBeDefined();
    });

    it('should send a message to the tabs and receive a response', async () => {
        const response = await messenger.sendMessageToTabs(
            MessageType.LIST_TAGS
        );
        expect(response).toBeDefined();
    });

    it('should send a message to the tabs and receive an error', async () => {
        const response = await messenger.sendMessageToTabs(
            MessageType.LIST_TAGS
        );
        expect(response).toBeDefined();
    });
});
