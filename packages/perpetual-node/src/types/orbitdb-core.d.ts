// Type declarations for @orbitdb/core
declare module '@orbitdb/core' {
  export function createOrbitDB(options: { ipfs: any }): Promise<any>;
}