// OrbitDB-related types for the perpetual node
import type { DiscoveryRecord } from '@my-mimisbrunnr/protocol';

export interface OrbitDB {
    log: (name: string, options?: any) => Promise<LogStore<any>>;
    disconnect: () => Promise<void>;
    id: string;
}

export interface LogStore<T> {
    add: (data: T) => Promise<string>;
    iterator: (options?: IteratorOptions) => Array<LogEntry<T>>;
    load: (amount?: number) => Promise<void>;
    close: () => Promise<void>;
    address: {
        toString: () => string;
        root: string;
    };
    events: {
        on: (event: string, callback: (...args: any[]) => void) => void;
        off: (event: string, callback: (...args: any[]) => void) => void;
    };
    replicationStatus: {
        progress: number;
        max: number;
    };
}

export interface LogEntry<T> {
    hash: string;
    payload: {
        value: T;
        key?: string;
    };
    next: string[];
    clock: {
        id: string;
        time: number;
    };
    signature: string;
    identity: {
        id: string;
        publicKey: string;
    };
}

export interface IteratorOptions {
    limit?: number;
    reverse?: boolean;
    gte?: string;
    gt?: string;
    lte?: string;
    lt?: string;
}

export interface OrbitDBConnectionStatus {
    connected: boolean;
    id?: string;
    peers: number;
    lastUpdate: number;
    error?: string;
}

export interface DiscoveryLogStats {
    address: string;
    entryCount: number;
    pinnedEntries: number;
    lastEntry?: LogEntry<DiscoveryRecord>;
    replicationProgress: number;
    peers: number;
}

export interface ReplicationEvent {
    address: string;
    hash: string;
    entry: LogEntry<DiscoveryRecord>;
    progress: number;
    max: number;
}

export interface OrbitDBManagerOptions {
    ipfs: any; // IPFSHTTPClient but avoiding circular deps
    directory: string;
    id?: string;
}