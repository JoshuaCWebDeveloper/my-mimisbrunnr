/**
 * Unit tests for DID Service (MM-29)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DidService } from './did-service.js';
import type { Identity } from './identity-service.js';
import type { IpfsService } from '../ipfs/ipfs-service.js';
import { createDbRow } from '@my-mimisbrunnr/protocol';

describe('DidService', () => {
    let didService: DidService;
    let mockIpfsService: IpfsService;
    let mockIdentity: Identity;

    beforeEach(() => {
        // Mock IPFS service
        mockIpfsService = {
            addObject: vi.fn(),
            publishToIpns: vi.fn(),
            resolveIpns: vi.fn(),
            retrieveObject: vi.fn(),
        } as unknown as IpfsService;

        // Mock identity with a valid Ed25519 public key
        mockIdentity = {
            ...createDbRow(),
            did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            publicKey: new Uint8Array(32).fill(1), // Mock 32-byte public key
            secretKey: new Uint8Array(64).fill(1), // Mock 64-byte secret key
            handle: '@alice',
        };

        didService = new DidService(mockIpfsService);
    });

    describe('buildDidDocument', () => {
        it('should build a valid DID document with manifest endpoint', () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            const didDocument = didService.buildDidDocument(
                mockIdentity,
                manifestCid
            );

            expect(didDocument).toMatchObject({
                '@context': ['https://www.w3.org/ns/did/v1'],
                id: mockIdentity.did,
                verificationMethod: [
                    {
                        id: `${mockIdentity.did}#key-1`,
                        type: 'Ed25519VerificationKey2018',
                        controller: mockIdentity.did,
                        publicKeyMultibase: expect.stringMatching(
                            /^z[1-9A-HJ-NP-Za-km-z]+$/
                        ),
                    },
                ],
                assertionMethod: [`${mockIdentity.did}#key-1`],
                service: [
                    {
                        id: '#manifest',
                        type: 'UserManifest',
                        serviceEndpoint: `ipfs://${manifestCid}`,
                    },
                ],
            });
        });

        it('should include tweet proof service endpoint when provided', () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';
            const proofUrl = 'https://x.com/alice/status/123456789';

            const didDocument = didService.buildDidDocument(
                mockIdentity,
                manifestCid,
                proofUrl
            );

            expect(didDocument.service).toHaveLength(2);
            expect(didDocument.service[1]).toEqual({
                id: '#x-proof',
                type: 'XHandleProof',
                serviceEndpoint: proofUrl,
            });
        });

        it('should encode public key as multibase base58btc', () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            const didDocument = didService.buildDidDocument(
                mockIdentity,
                manifestCid
            );

            const publicKeyMultibase =
                didDocument.verificationMethod[0].publicKeyMultibase;

            // Multibase base58btc encoding starts with 'z'
            expect(publicKeyMultibase).toMatch(/^z/);

            // Ensure it's a valid base58 string (no 0, O, I, l characters)
            expect(publicKeyMultibase).toMatch(/^z[1-9A-HJ-NP-Za-km-z]+$/);
        });

        it('should use correct verification method type', () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            const didDocument = didService.buildDidDocument(
                mockIdentity,
                manifestCid
            );

            expect(didDocument.verificationMethod[0].type).toBe(
                'Ed25519VerificationKey2018'
            );
        });
    });

    describe('publishDidDocument', () => {
        it('should publish DID document to IPFS and IPNS', async () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';
            const expectedDidCid =
                'bafyreidtyrgnky7eobbone7266wzgwd4cwsshuc2pqdvc3oyjcnmksiigq';
            const expectedIpnsKey =
                'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            vi.mocked(mockIpfsService.addObject).mockResolvedValue(
                expectedDidCid
            );
            vi.mocked(mockIpfsService.publishToIpns).mockResolvedValue(
                expectedIpnsKey
            );

            const result = await didService.publishDidDocument(
                mockIdentity,
                manifestCid
            );

            expect(result).toEqual({
                didDocumentCid: expectedDidCid,
                ipnsKey: expectedIpnsKey,
            });

            // Verify IPFS service was called correctly
            expect(mockIpfsService.addObject).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: mockIdentity.did,
                }),
                { pin: true }
            );

            // Verify publishToIpns was called with CID and a private key object
            expect(mockIpfsService.publishToIpns).toHaveBeenCalledWith(
                expectedDidCid,
                expect.objectContaining({
                    publicKey: expect.any(Object),
                })
            );
        });

        it('should pass proof URL to DID document builder', async () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';
            const proofUrl = 'https://x.com/alice/status/123456789';
            const expectedDidCid =
                'bafyreidtyrgnky7eobbone7266wzgwd4cwsshuc2pqdvc3oyjcnmksiigq';
            const expectedIpnsKey =
                'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            vi.mocked(mockIpfsService.addObject).mockResolvedValue(
                expectedDidCid
            );
            vi.mocked(mockIpfsService.publishToIpns).mockResolvedValue(
                expectedIpnsKey
            );

            await didService.publishDidDocument(
                mockIdentity,
                manifestCid,
                proofUrl
            );

            // Verify DID document includes proof URL service endpoint
            expect(mockIpfsService.addObject).toHaveBeenCalledWith(
                expect.objectContaining({
                    service: expect.arrayContaining([
                        expect.objectContaining({
                            id: '#x-proof',
                            serviceEndpoint: proofUrl,
                        }),
                    ]),
                }),
                { pin: true }
            );
        });

        it('should propagate errors from IPFS service', async () => {
            const manifestCid =
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            vi.mocked(mockIpfsService.addObject).mockRejectedValue(
                new Error('IPFS publish failed')
            );

            await expect(
                didService.publishDidDocument(mockIdentity, manifestCid)
            ).rejects.toThrow('IPFS publish failed');
        });
    });

    describe('retrieveDidDocument', () => {
        it('should retrieve DID document by CID', async () => {
            const didCid =
                'bafyreidtyrgnky7eobbone7266wzgwd4cwsshuc2pqdvc3oyjcnmksiigq';
            const expectedDidDocument = {
                '@context': ['https://www.w3.org/ns/did/v1'],
                id: mockIdentity.did,
                verificationMethod: [],
                assertionMethod: [],
                service: [],
            };

            vi.mocked(mockIpfsService.retrieveObject).mockResolvedValue(
                expectedDidDocument
            );

            const result = await didService.retrieveDidDocument(didCid);

            expect(result).toEqual(expectedDidDocument);
            expect(mockIpfsService.retrieveObject).toHaveBeenCalledWith(didCid);
        });

        it('should propagate errors from IPFS service', async () => {
            const didCid =
                'bafyreidtyrgnky7eobbone7266wzgwd4cwsshuc2pqdvc3oyjcnmksiigq';

            vi.mocked(mockIpfsService.retrieveObject).mockRejectedValue(
                new Error('IPFS retrieve failed')
            );

            await expect(
                didService.retrieveDidDocument(didCid)
            ).rejects.toThrow('IPFS retrieve failed');
        });
    });
});
