import { z } from 'zod';

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
export const TagSchema = CreateTagSchema.extend({
    id: z.string(),
});

export type Tag = z.infer<typeof TagSchema>;

/**
 * TagCollection schema for IPFS publishing
 * This is the minimal structure needed for MM-27 POC
 */
export const TagCollectionSchema = z.object({
    version: z.literal(1),
    handle: z.string().regex(/^@[a-zA-Z0-9_]{1,15}$/),
    updated: z.number().min(1).max(9999999999999),
    tags: z.array(TagSchema),
});

export type TagCollection = z.infer<typeof TagCollectionSchema>;
