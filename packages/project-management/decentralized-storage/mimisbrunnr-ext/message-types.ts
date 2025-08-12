// Extended message types in src/shared/types/messages.ts
import {
    UserIdentity,
    TagList,
    DiscoveryRecord,
} from '@my-mimisbrunnr/shared-api';

enum MessageType {
    // Existing types...
    LIST_TAGS = 'LIST_TAGS',
    SAVE_TAG = 'SAVE_TAG',
    DELETE_TAG = 'DELETE_TAG',

    // New decentralized types
    CREATE_IDENTITY = 'CREATE_IDENTITY',
    VERIFY_IDENTITY = 'VERIFY_IDENTITY',
    PUBLISH_TAGS = 'PUBLISH_TAGS',
    DISCOVER_HANDLE = 'DISCOVER_HANDLE',
    GET_IDENTITY_STATUS = 'GET_IDENTITY_STATUS',
    UPDATE_PUBLISHING_SETTINGS = 'UPDATE_PUBLISHING_SETTINGS',

    // Subscription management types
    SUBSCRIBE_TO_USER = 'SUBSCRIBE_TO_USER',
    UNSUBSCRIBE_FROM_USER = 'UNSUBSCRIBE_FROM_USER',
    LIST_SUBSCRIPTIONS = 'LIST_SUBSCRIPTIONS',
    REFRESH_SUBSCRIPTIONS = 'REFRESH_SUBSCRIPTIONS',
    GET_SUBSCRIPTION_FEED = 'GET_SUBSCRIPTION_FEED',

    // Discovery and network types
    LOOKUP_USER_BY_HANDLE = 'LOOKUP_USER_BY_HANDLE',
    GET_USER_TAGS = 'GET_USER_TAGS',
    SYNC_SUBSCRIBED_CONTENT = 'SYNC_SUBSCRIBED_CONTENT',
    GET_NETWORK_STATUS = 'GET_NETWORK_STATUS',
    CONNECT_TO_PERPETUAL_NODE = 'CONNECT_TO_PERPETUAL_NODE',
}

// Enhanced message interfaces
interface CreateIdentityMessage {
    type: MessageType.CREATE_IDENTITY;
    body: {
        passphrase: string;
        handle: string;
    };
}

interface PublishTagsMessage {
    type: MessageType.PUBLISH_TAGS;
    body: {
        tagList: TagList;
        publishToOrbitDB: boolean;
    };
}

interface DiscoverHandleMessage {
    type: MessageType.DISCOVER_HANDLE;
    body: {
        handle: string;
    };
}

interface SubscribeToUserMessage {
    type: MessageType.SUBSCRIBE_TO_USER;
    body: {
        handle: string;
        syncEnabled?: boolean;
    };
}

// Union type for all decentralized messages
type DecentralizedMessage =
    | CreateIdentityMessage
    | PublishTagsMessage
    | DiscoverHandleMessage
    | SubscribeToUserMessage;

export { MessageType, DecentralizedMessage };
