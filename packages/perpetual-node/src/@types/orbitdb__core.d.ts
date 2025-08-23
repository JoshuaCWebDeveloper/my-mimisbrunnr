// Type declarations for @orbitdb/core
declare module '@orbitdb/core' {
  export interface OrbitDBInstance {
    open(address: string): Promise<OrbitDBDatabase>;
    stop(): Promise<void>;
    id: string;
    [key: string]: unknown;
  }

  export interface OrbitDBDatabase {
    address: string;
    events: {
      on(event: string, handler: (...args: unknown[]) => void): void;
      off(event: string, handler?: (...args: unknown[]) => void): void;
    };
    all(): Promise<unknown[]>;
    add(data: unknown): Promise<string>;
    close(): Promise<void>;
    [key: string]: unknown;
  }

  // OrbitDB should work with any IPFS client that implements the core interface
  export function createOrbitDB(options: { ipfs: unknown }): Promise<OrbitDBInstance>;
}