/**
 * DID Service for Decentralized Identifier Operations (MM-29)
 *
 * Handles all DID-related operations including:
 * - DID document generation and management
 * - W3C DID Core compliance
 * - Service endpoint management (manifests, proofs)
 *
 * Architecture:
 * - Owned and instantiated by IdentityService
 * - Works with Identity objects to build DID documents
 * - Coordinates with IpfsService for publishing
 *
 * @remarks
 * This service is a companion to IdentityService, handling the higher-level
 * DID document operations while IdentityService handles key management and
 * encryption.
 *
 * TODO(MM-31): Add tweet verification service endpoint management
 * TODO(MM-35): Add DID document validation
 */

import log from 'loglevel';
import type { Identity } from './identity-service.js';
import type { IpfsService } from '../ipfs/ipfs-service.js';
import { base58Encode, convertToLibp2pPrivateKey } from '../crypto.js';
import {
    DidDocument,
    VerificationMethod,
    ServiceEndpoint,
} from '@my-mimisbrunnr/protocol';

/**
 * DID Service for managing DID documents
 */
export class DidService {
    constructor(private ipfsService: IpfsService) {}

    /**
     * Build W3C DID Core compliant document
     *
     * @param identity - Identity containing DID and keys
     * @param manifestCid - CID of encrypted UserManifest
     * @param proofUrl - Optional X.com tweet URL for verification (MM-31)
     * @returns Complete DID Document
     *
     * @remarks
     * DID Document structure (always unencrypted):
     * - Verification method with Ed25519 public key
     * - Assertion method reference for signing
     * - Service endpoints:
     *   - #manifest: Points to encrypted UserManifest CID
     *   - #x-proof: Points to tweet verification URL (placeholder if not provided)
     *
     * TODO(MM-31): Integrate with tweet verification system
     * TODO(MM-35): Add DID document validation
     */
    buildDidDocument(
        identity: Identity,
        manifestCid: string,
        proofUrl?: string
    ): DidDocument {
        log.info('[DidService] Building DID document for:', identity.did);

        // Encode public key as multibase (z = base58btc)
        const multicodecPrefix = new Uint8Array([0xed, 0x01]);
        const multicodecKey = new Uint8Array(
            multicodecPrefix.length + identity.publicKey.length
        );
        multicodecKey.set(multicodecPrefix);
        multicodecKey.set(identity.publicKey, multicodecPrefix.length);
        const publicKeyMultibase = `z${base58Encode(multicodecKey)}`;

        // Build verification method
        const verificationMethod: VerificationMethod = {
            id: `${identity.did}#key-1`,
            type: 'Ed25519VerificationKey2018',
            controller: identity.did,
            publicKeyMultibase,
        };

        // Build service endpoints
        const services: ServiceEndpoint[] = [
            {
                id: '#manifest',
                type: 'UserManifest',
                serviceEndpoint: `ipfs://${manifestCid}`,
            },
        ];

        // Add proof URL if provided (MM-31)
        if (proofUrl) {
            services.push({
                id: '#x-proof',
                type: 'XHandleProof',
                serviceEndpoint: proofUrl,
            });
        }

        // Build complete DID document
        const didDocument: DidDocument = {
            '@context': ['https://www.w3.org/ns/did/v1'],
            id: identity.did,
            verificationMethod: [verificationMethod],
            assertionMethod: [`${identity.did}#key-1`],
            service: services,
        };

        log.info(
            '[DidService] DID document built successfully:',
            didDocument.id
        );

        return didDocument;
    }

    /**
     * Publish DID document to IPFS and IPNS
     *
     * @param identity - Identity for building the DID document
     * @param manifestCid - CID of the encrypted manifest
     * @param proofUrl - Optional tweet proof URL
     * @returns Object containing DID document CID and IPNS key
     *
     * @remarks
     * This is the primary publishing method that:
     * 1. Builds the DID document
     * 2. Publishes it to IPFS (pinned)
     * 3. Publishes the CID to IPNS for mutable addressing
     *
     * TODO(MM-35): Add validation before publishing
     * TODO(MM-36): Add retry logic
     */
    async publishDidDocument(
        identity: Identity,
        manifestCid: string,
        proofUrl?: string
    ): Promise<{ didDocumentCid: string; ipnsKey: string }> {
        log.info('[DidService] Publishing DID document for:', identity.did);

        try {
            // Build DID document
            const didDocument = this.buildDidDocument(
                identity,
                manifestCid,
                proofUrl
            );

            // Publish to IPFS with pinning
            const didDocumentCid = await this.ipfsService.addObject(
                didDocument,
                { pin: true }
            );
            log.info(
                '[DidService] DID document published to IPFS:',
                didDocumentCid
            );

            // Convert identity's Ed25519 secret key to libp2p PrivateKey format (MM-29)
            const libp2pPrivateKey = await convertToLibp2pPrivateKey(
                identity.secretKey
            );

            // Publish to IPNS using the user's identity key
            // This creates a unique IPNS name derived from the user's identity
            const ipnsKey = await this.ipfsService.publishToIpns(
                didDocumentCid,
                libp2pPrivateKey
            );
            log.info('[DidService] DID document published to IPNS:', ipnsKey);

            return {
                didDocumentCid,
                ipnsKey,
            };
        } catch (error) {
            log.error('[DidService] Failed to publish DID document:', error);
            throw error;
        }
    }

    /**
     * Retrieve DID document from IPFS
     *
     * @param cidOrIpns - CID or IPNS name of the DID document
     * @returns DID Document
     *
     * @remarks
     * Handles both CID and IPNS resolution.
     * If IPNS name provided, resolves to CID first.
     *
     * TODO(MM-35): Add DID document validation
     * TODO(MM-36): Add caching
     */
    async retrieveDidDocument(cidOrIpns: string): Promise<DidDocument> {
        log.info('[DidService] Retrieving DID document:', cidOrIpns);

        try {
            let cid = cidOrIpns;

            // If it's an IPNS name, resolve it first
            if (cidOrIpns.startsWith('k5')) {
                cid = await this.ipfsService.resolveIpns(cidOrIpns);
                log.info('[DidService] IPNS resolved to CID:', cid);
            }

            // Retrieve from IPFS
            const obj = await this.ipfsService.retrieveObject(cid);

            // TODO(MM-35): Validate DID document structure

            log.info('[DidService] DID document retrieved successfully');

            return obj as DidDocument;
        } catch (error) {
            log.error('[DidService] Failed to retrieve DID document:', error);
            throw error;
        }
    }
}
