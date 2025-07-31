// IPFS/IPNS Data Flow Example

// 1. IPNS Record (Mutable, identity-based addressing)
// IPNS: "k51qzi5uqu5d..." → "/ipfs/QmDidDocument123..."

// 2. DID Document (Published to IPFS, referenced by IPNS)
interface DIDDocument {
    '@context': string[];
    id: string;
    verificationMethod: VerificationMethod[];
    service: ServiceEndpoint[];
}

interface ServiceEndpoint {
    id: string;
    type: string;
    serviceEndpoint: string;
}

const exampleDIDDocument: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: 'did:key:z6Mk...',
    verificationMethod: [
        /* ... */
    ],
    service: [
        {
            id: '#taglist',
            type: 'TagList',
            serviceEndpoint: 'ipfs://QmTagList456...', // Points to TagList CID
        },
        {
            id: '#x-proof',
            type: 'XHandleProof',
            serviceEndpoint: 'https://x.com/alice/status/123...',
        },
    ],
};

// 3. TagList (Published to IPFS, referenced by DID Document)
interface TagList {
    version: number;
    handle: string;
    createdAt: number;
    updatedAt: number;
    tags: string[]; // Aggregated from LocalTag entries where isLocal=true
}

const exampleTagList: TagList = {
    version: 1,
    handle: '@alice',
    createdAt: 1737152100000,
    updatedAt: 1737152200000,
    tags: ['defi', 'ux', 'ai'],
};

export {
    DIDDocument,
    ServiceEndpoint,
    TagList,
    exampleDIDDocument,
    exampleTagList,
};
