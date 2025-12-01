import { getRuntime, getTabs } from './runtime.js';
import type { Tag, CreateTag } from '@my-mimisbrunnr/protocol';

export enum MessageType {
    LIST_TAGS = 'LIST_TAGS',
    LIST_TAGS_BY_USERNAME = 'LIST_TAGS_BY_USERNAME',
    GET_TAG = 'GET_TAG',
    SAVE_TAG = 'SAVE_TAG',
    DELETE_TAG = 'DELETE_TAG',
    REFRESH_TAGS = 'REFRESH_TAGS',
    // IPFS operations
    PUBLISH_TO_IPFS = 'PUBLISH_TO_IPFS',
    RETRIEVE_FROM_IPFS = 'RETRIEVE_FROM_IPFS',
    IMPORT_FROM_IPFS = 'IMPORT_FROM_IPFS',
    // Identity operations (MM-28)
    CREATE_IDENTITY = 'CREATE_IDENTITY',
    UNLOCK_IDENTITY = 'UNLOCK_IDENTITY',
    LOCK_IDENTITY = 'LOCK_IDENTITY',
    DELETE_IDENTITY = 'DELETE_IDENTITY',
    HAS_IDENTITY = 'HAS_IDENTITY',
    IS_IDENTITY_UNLOCKED = 'IS_IDENTITY_UNLOCKED',
    GET_IDENTITY_INFO = 'GET_IDENTITY_INFO',
}

export type MessageError = {
    error: string;
};

export type Message<T extends MessageType = MessageType> =
    T extends MessageType.LIST_TAGS
        ? {
              type: T;
              body: never;
              response: Tag[];
          }
        : T extends MessageType.LIST_TAGS_BY_USERNAME
        ? {
              type: T;
              body: { username: string };
              response: Tag[];
          }
        : T extends MessageType.GET_TAG
        ? {
              type: T;
              body: { id: string };
              response: Tag;
          }
        : T extends MessageType.SAVE_TAG
        ? {
              type: T;
              body: CreateTag;
              response: Tag;
          }
        : T extends MessageType.DELETE_TAG
        ? {
              type: T;
              body: { id: string };
              response: {
                  id: string;
              };
          }
        : T extends MessageType.REFRESH_TAGS
        ? {
              type: T;
              body: never;
              response: void;
          }
        : T extends MessageType.PUBLISH_TO_IPFS
        ? {
              type: T;
              body: never;
              response: { cid: string };
          }
        : T extends MessageType.RETRIEVE_FROM_IPFS
        ? {
              type: T;
              body: { cid: string };
              response: { tags: Tag[] };
          }
        : T extends MessageType.IMPORT_FROM_IPFS
        ? {
              type: T;
              body: { cid: string; mode: 'merge' | 'overwrite' };
              response: { imported: number; total: number };
          }
        : T extends MessageType.CREATE_IDENTITY
        ? {
              type: T;
              body: { passphrase: string; handle: string };
              response: { did: string; handle: string };
          }
        : T extends MessageType.UNLOCK_IDENTITY
        ? {
              type: T;
              body: { passphrase: string };
              response: { did: string; handle: string };
          }
        : T extends MessageType.LOCK_IDENTITY
        ? {
              type: T;
              body: never;
              response: void;
          }
        : T extends MessageType.DELETE_IDENTITY
        ? {
              type: T;
              body: { passphrase: string };
              response: void;
          }
        : T extends MessageType.HAS_IDENTITY
        ? {
              type: T;
              body: never;
              response: { hasIdentity: boolean };
          }
        : T extends MessageType.IS_IDENTITY_UNLOCKED
        ? {
              type: T;
              body: never;
              response: { isUnlocked: boolean };
          }
        : T extends MessageType.GET_IDENTITY_INFO
        ? {
              type: T;
              body: never;
              response: { did: string; handle: string } | null;
          }
        : never;

type MessageCallback = <T extends MessageType>(
    response: Message<T>['response'] | MessageError
) => void;

type MessageListener<T extends MessageType = MessageType> = (
    message: Message<T>,
    sender: unknown,
    sendResponse: MessageCallback
) => void;

type DestinationMessage<T extends MessageType = MessageType> = {
    type: T;
    body?: Message<T>['body'];
};

type BaseDestination = {
    onMessage: {
        addListener: <T extends MessageType = MessageType>(
            callback: MessageListener<T>
        ) => void;
    };
};

type RuntimeDestination = BaseDestination & {
    sendMessage: <T extends MessageType = MessageType>(
        message: DestinationMessage<T>
    ) => Promise<Message<T>['response'] | MessageError>;
};

type TabsDestination = BaseDestination & {
    sendMessage: <T extends MessageType = MessageType>(
        id: number,
        message: DestinationMessage<T>
    ) => Promise<Message<T>['response'] | MessageError>;
};

export class Messenger {
    private async handleResponse<T extends MessageType>(
        response: Message<T>['response'] | MessageError
    ): Promise<Message<T>['response']> {
        if ((response as MessageError)?.error) {
            throw new Error((response as MessageError).error);
        }

        return response as Message<T>['response'];
    }

    private get runtime() {
        // Support both browser and chrome APIs
        const runtime = getRuntime();

        return runtime as unknown as RuntimeDestination;
    }

    async sendMessageToRuntime<T extends MessageType>(
        type: T,
        body?: Message<T>['body']
    ): Promise<Message<T>['response']> {
        const response = await this.runtime.sendMessage({ type, body });

        return this.handleResponse(response);
    }

    async onRuntimeMessage(listener: MessageListener<MessageType>) {
        this.runtime.onMessage.addListener(listener);
    }

    private get tabs() {
        const tabs = getTabs();

        return tabs as unknown as TabsDestination & {
            query: (query: unknown) => Promise<{ id: number }[]>;
        };
    }

    async sendMessageToTabs<T extends MessageType>(
        type: T,
        body?: Message<T>['body']
    ): Promise<Message<T>['response'][]> {
        const foundTabs = await this.tabs.query({
            url: ['*://*.twitter.com/*', '*://*.x.com/*'],
        });

        return Promise.all(
            foundTabs.map(async ({ id }) =>
                this.handleResponse(
                    await this.tabs.sendMessage(id, { type, body })
                )
            )
        );
    }
}
