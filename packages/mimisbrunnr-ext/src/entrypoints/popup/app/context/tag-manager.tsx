import { createContext, useContext, useRef } from 'react';
import { useMessenger } from './messenger.js';
import {
    CreateTag,
    MessageType,
    Messenger,
    Tag,
} from '../../../../messenger.js';

export class TagManager {
    constructor(private readonly messenger: Messenger) {}

    async list() {
        return this.messenger.sendMessageToRuntime(MessageType.LIST_TAGS);
    }

    async get(id: string) {
        return this.messenger.sendMessageToRuntime(MessageType.GET_TAG, {
            id,
        });
    }

    async save(tag: CreateTag) {
        return this.messenger.sendMessageToRuntime(MessageType.SAVE_TAG, tag);
    }

    async delete(tag: Tag) {
        return this.messenger.sendMessageToRuntime(MessageType.DELETE_TAG, {
            id: tag.id,
        });
    }
}

export const TagManagerContext = createContext<TagManager | null>(null);

export const TagManagerProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const messenger = useMessenger();
    const tagManager = useRef(new TagManager(messenger));

    return (
        <TagManagerContext.Provider value={tagManager.current}>
            {children}
        </TagManagerContext.Provider>
    );
};

export const useTagManager = () => {
    const tagManager = useContext(TagManagerContext);

    if (!tagManager) {
        throw new Error(
            'useTagManager must be used within a TagManagerProvider'
        );
    }

    return tagManager;
};
