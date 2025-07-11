import { getRuntime, getTabs } from './runtime.js';

export type Tag = {
    id: string;
    username: string;
    name: string;
    color: string;
};

export type CreateTag = Omit<Tag, 'id'> & {
    id?: string;
};

export enum MessageType {
    LIST_TAGS = 'LIST_TAGS',
    LIST_TAGS_BY_USERNAME = 'LIST_TAGS_BY_USERNAME',
    GET_TAG = 'GET_TAG',
    SAVE_TAG = 'SAVE_TAG',
    DELETE_TAG = 'DELETE_TAG',
    REFRESH_TAGS = 'REFRESH_TAGS',
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
