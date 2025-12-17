import { z } from 'zod';

export const DbRowSchema = z.object({
    id: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type DbRow = z.infer<typeof DbRowSchema>;

export const createDbRow = (): DbRow => {
    return {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
};

export const PublishableRecordSchema = DbRowSchema.extend({
    version: z.coerce.number(),
    encrypted: z.coerce.boolean(),
});

export type PublishableRecord = z.infer<typeof PublishableRecordSchema>;

/**
 * Tag schema for X.com user tagging
 * Used by mimisbrunnr-ext and validation-service
 */
export const CreateTagSchema = z.object({
    username: z.string(),
    name: z.string(),
    color: z.string(),
});

export type CreateTag = z.infer<typeof CreateTagSchema>;

/**
 * CreateTag schema (Tag without required id)
 * Used when creating new tags where id may be auto-generated
 */
export const TagSchema = CreateTagSchema.extend(DbRowSchema.shape);

export type Tag = z.infer<typeof TagSchema>;

/**
 * TagCollection schema for IPFS publishing
 * This is the minimal structure needed for MM-27 POC
 */
export const TagCollectionSchema = PublishableRecordSchema.extend({
    version: z.literal(1),
    encrypted: z.literal(false),
    handle: z.string().regex(/^@[a-zA-Z0-9_]{1,15}$/),
    tags: z.array(TagSchema),
});

export type TagCollection = z.infer<typeof TagCollectionSchema>;

/**
 * Type guard for tag collection
 */
export function isTagCollection(data: unknown): data is TagCollection {
    return (
        typeof data === 'object' &&
        data !== null &&
        'version' in data &&
        'handle' in data &&
        'tags' in data
    );
}

export const EncryptedTagCollectionSchema = PublishableRecordSchema.extend({
    version: z.literal(1),
    encrypted: z.literal(true),
    // decodes to TagCollectionSchema
    data: z.string(),
    nonce: z.string(),
    contentSalt: z.string(),
});

export type EncryptedTagCollection = z.infer<
    typeof EncryptedTagCollectionSchema
>;

/**
 * Type guard for encrypted tag collection
 */
export function isEncryptedTagCollection(
    data: unknown
): data is EncryptedTagCollection {
    return (
        typeof data === 'object' &&
        data !== null &&
        'encrypted' in data &&
        data.encrypted === true &&
        'data' in data &&
        'nonce' in data
    );
}

export const UserManifestSchema = PublishableRecordSchema.extend({
    version: z.literal(1),
    encrypted: z.literal(false),
    handle: z.string().regex(/^@[a-zA-Z0-9_]{1,15}$/),
    did: z.string(),
    collections: z.array(z.string()), // Array of CID strings referencing TagCollection documents
});

export type UserManifest = z.infer<typeof UserManifestSchema>;

/**
 * Type guard for user manifest
 */
export function isUserManifest(data: unknown): data is UserManifest {
    return (
        typeof data === 'object' &&
        data !== null &&
        'version' in data &&
        'handle' in data &&
        'did' in data &&
        'collections' in data
    );
}

/**
 * W3C DID Core verification method
 */
export const VerificationMethodSchema = z.object({
    id: z.string(),
    type: z.literal('Ed25519VerificationKey2018'),
    controller: z.string(),
    publicKeyMultibase: z.string(),
});

export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

/**
 * DID document service endpoint
 */
export const ServiceEndpointSchema = z.object({
    id: z.string(),
    type: z.string(),
    serviceEndpoint: z.string(),
});

export type ServiceEndpoint = z.infer<typeof ServiceEndpointSchema>;

/**
 * W3C DID Core document structure
 * Always published unencrypted to IPFS
 */
export const DidDocumentSchema = z.object({
    '@context': z.array(z.string()),
    id: z.string(),
    verificationMethod: z.array(VerificationMethodSchema),
    assertionMethod: z.array(z.string()),
    service: z.array(ServiceEndpointSchema),
});

export type DidDocument = z.infer<typeof DidDocumentSchema>;

/**
 * OrbitDb Manifest
 */

export const OrbitDbManifestSchema = z.object({
    name: z.string(),
    type: z.enum(['events, logs, documents']),
    accessController: z.unknown(),
});

export type OrbitDbManifest = z.infer<typeof OrbitDbManifestSchema>;

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
