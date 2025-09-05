/**
 * OrbitDB Discovery Record interface for cross-package communication
 * Used by both mimisbrunnr-ext and perpetual-node for interoperability
 */
export type DiscoveryRecord = {
    /** SHA-256 of lowercase handle */
    lookupKey: string;
    /** Original X.com handle */
    handle: string;
    /** IPNS key for mutable content */
    ipnsKey: string;
    /** DID identifier */
    did: string;
    /** Unix timestamp when first created */
    createdAt: number;
    /** Unix timestamp when last modified */
    updatedAt: number;
    /** Optional entry-level signature */
    sig?: string;
};

export const version = '1.0.11';
