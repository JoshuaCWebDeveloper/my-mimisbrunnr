// IPFS-related types for the perpetual node

export interface IPFSHTTPClient {
    add: (data: any, options?: any) => Promise<any>;
    pin: {
        add: (cid: string, options?: { recursive?: boolean }) => Promise<any>;
        rm: (cid: string, options?: { recursive?: boolean }) => Promise<any>;
        ls: () => AsyncIterable<any>;
    };
    dag: {
        get: (cid: string, options?: any) => Promise<any>;
        put: (data: any, options?: any) => Promise<any>;
    };
    pubsub: {
        publish: (topic: string, data: Uint8Array) => Promise<void>;
        subscribe: (topic: string) => AsyncIterable<any>;
        unsubscribe: (topic: string) => Promise<void>;
        peers: (topic: string) => Promise<string[]>;
    };
    id: () => Promise<any>;
    version: () => Promise<any>;
    repo: {
        stat: () => Promise<any>;
    };
}

export interface IPFSPinStatus {
    cid: string;
    pinned: boolean;
    recursive: boolean;
    timestamp: number;
}

export interface IPFSConnectionStatus {
    connected: boolean;
    peerId?: string;
    version?: string;
    lastCheck: number;
    error?: string;
}

export interface PinningRequest {
    cid: string;
    recursive: boolean;
    clientIP: string;
    timestamp: number;
}

export interface PinningResult {
    cid: string;
    success: boolean;
    error?: string;
    size?: number;
}

export interface IPFSRepositoryStats {
    numObjects: number;
    repoSize: number;
    storageMax: number;
    repoPath: string;
    version: string;
}