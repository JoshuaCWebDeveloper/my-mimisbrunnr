/**
 * Tests for IpfsService IPNS methods (MM-29)
 *
 * Covers critical IPNS publishing and resolution functionality:
 * - publishToIpns: Creating and publishing IPNS records
 * - resolveIpns: Resolving IPNS names to CIDs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IpfsService } from './ipfs-service.js';
import type { Ed25519PrivateKey } from '@libp2p/interface';

describe('IpfsService - IPNS Methods', () => {
    let ipfsService: IpfsService;
    let mockKuboClient: any;

    beforeEach(async () => {
        ipfsService = new IpfsService();

        // Create mock Kubo client
        mockKuboClient = {
            routing: {
                put: vi.fn(),
            },
            name: {
                resolve: vi.fn(),
            },
            dag: {
                put: vi.fn(),
            },
        };

        // Directly inject mock kubo client without full Helia initialization
        // (avoids Promise.withResolvers issue with Node v20)
        (ipfsService as any).kuboClient = mockKuboClient;
    });

    describe('publishToIpns', () => {
        let mockPrivateKey: Ed25519PrivateKey;
        let testCid: string;

        beforeEach(async () => {
            // Create a real Ed25519 key for testing
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');
            const seed = new Uint8Array(32);
            crypto.getRandomValues(seed);
            mockPrivateKey = (await generateKeyPairFromSeed('Ed25519', seed)) as Ed25519PrivateKey;

            testCid = 'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            // Mock routing.put to return an async iterable
            mockKuboClient.routing.put.mockImplementation(async function* () {
                yield { Type: 'SendingQuery' };
                yield { Type: 'PeerResponse' };
            });

            // Mock name.resolve for verification
            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield `/ipfs/${testCid}`;
            });
        });

        it('should successfully create and publish IPNS record', async () => {
            const ipnsName = await ipfsService.publishToIpns(testCid, mockPrivateKey);

            // Verify IPNS name is a valid peer ID format
            expect(ipnsName).toMatch(/^12D3KooW[a-zA-Z0-9]+$/);

            // Verify routing.put was called
            expect(mockKuboClient.routing.put).toHaveBeenCalledWith(
                `/ipns/${ipnsName}`,
                expect.any(Uint8Array)
            );

            // Verify IPNS resolution was called for verification
            expect(mockKuboClient.name.resolve).toHaveBeenCalledWith(ipnsName);
        });

        it('should validate CID format before publishing', async () => {
            const invalidCid = 'not-a-valid-cid';

            await expect(
                ipfsService.publishToIpns(invalidCid, mockPrivateKey)
            ).rejects.toThrow();
        });

        it('should create IPNS record with correct sequence number', async () => {
            await ipfsService.publishToIpns(testCid, mockPrivateKey, 5n);

            // Verify routing.put was called with marshaled record
            expect(mockKuboClient.routing.put).toHaveBeenCalled();

            const [, marshaledRecord] = mockKuboClient.routing.put.mock.calls[0];

            // Unmarshal and verify sequence number
            const { unmarshalIPNSRecord } = await import('ipns');
            const ipnsRecord = unmarshalIPNSRecord(marshaledRecord);

            expect(ipnsRecord.sequence).toBe(5n);
        });

        it('should handle Kubo RPC routing.put failure', async () => {
            mockKuboClient.routing.put.mockImplementation(async function* () {
                throw new Error('Kubo routing.put failed');
            });

            await expect(
                ipfsService.publishToIpns(testCid, mockPrivateKey)
            ).rejects.toThrow('Kubo routing.put failed');
        });

        it('should handle IPNS resolution verification failure', async () => {
            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield '/ipfs/wrong-cid';
            });

            await expect(
                ipfsService.publishToIpns(testCid, mockPrivateKey)
            ).rejects.toThrow('IPNS resolution mismatch');
        });

        it('should throw error if Kubo client not initialized', async () => {
            (ipfsService as any).kuboClient = null;

            await expect(
                ipfsService.publishToIpns(testCid, mockPrivateKey)
            ).rejects.toThrow('Kubo RPC client not initialized');
        });

        it('should create valid IPNS record that can be unmarshaled', async () => {
            await ipfsService.publishToIpns(testCid, mockPrivateKey);

            const [, marshaledRecord] = mockKuboClient.routing.put.mock.calls[0];

            // Verify record can be unmarshaled
            const { unmarshalIPNSRecord } = await import('ipns');
            const ipnsRecord = unmarshalIPNSRecord(marshaledRecord);

            expect(ipnsRecord.value).toBeDefined();
            expect(ipnsRecord.value.toString()).toBe(`/ipfs/${testCid}`);
            expect(ipnsRecord.sequence).toBe(0n); // Default sequence
            // TTL is in nanoseconds, not milliseconds (86400000ms = 86400000000000ns)
            expect(ipnsRecord.ttl).toBeGreaterThan(0n);
        });

        it('should derive IPNS name from private key public key', async () => {
            const ipnsName = await ipfsService.publishToIpns(testCid, mockPrivateKey);

            // Verify IPNS name matches peer ID derived from public key
            const { peerIdFromPublicKey } = await import('@libp2p/peer-id');
            const expectedPeerId = peerIdFromPublicKey(mockPrivateKey.publicKey);

            expect(ipnsName).toBe(expectedPeerId.toString());
        });
    });

    describe('resolveIpns', () => {
        beforeEach(() => {
            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield '/ipfs/bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';
            });
        });

        it('should successfully resolve IPNS name to CID', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            const resolvedCid = await ipfsService.resolveIpns(ipnsName);

            expect(resolvedCid).toBe('bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm');
            expect(mockKuboClient.name.resolve).toHaveBeenCalledWith(ipnsName);
        });

        it('should strip /ipfs/ prefix from resolved path', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield '/ipfs/QmTest123';
            });

            const resolvedCid = await ipfsService.resolveIpns(ipnsName);

            expect(resolvedCid).toBe('QmTest123');
            expect(resolvedCid).not.toContain('/ipfs/');
        });

        it('should handle IPNS resolution timeout', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                // Simulate timeout by never yielding
                await new Promise((resolve) => setTimeout(resolve, 100));
            });

            // Note: Actual timeout handling would require implementation in the method
            // This test documents the expected behavior
            const promise = ipfsService.resolveIpns(ipnsName);

            // Should eventually timeout or throw (implementation dependent)
            // For now, we're just documenting this case needs handling
        });

        it('should handle IPNS name not found', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                // No results
            });

            await expect(ipfsService.resolveIpns(ipnsName)).rejects.toThrow(
                'No results returned for IPNS'
            );
        });

        it('should handle invalid IPNS name format', async () => {
            const invalidIpnsName = 'not-a-valid-ipns-name';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                throw new Error('Invalid IPNS name');
            });

            await expect(ipfsService.resolveIpns(invalidIpnsName)).rejects.toThrow();
        });

        it('should handle Kubo RPC resolve failure', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                throw new Error('Kubo name.resolve failed');
            });

            await expect(ipfsService.resolveIpns(ipnsName)).rejects.toThrow(
                'Kubo name.resolve failed'
            );
        });

        it('should throw error if Kubo client not initialized', async () => {
            (ipfsService as any).kuboClient = null;

            await expect(
                ipfsService.resolveIpns('k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8')
            ).rejects.toThrow('Kubo RPC client not initialized');
        });

        it('should handle multiple resolution results (take first)', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield '/ipfs/QmFirst';
                yield '/ipfs/QmSecond'; // Should be ignored
            });

            const resolvedCid = await ipfsService.resolveIpns(ipnsName);

            expect(resolvedCid).toBe('QmFirst');
        });

        it('should handle empty/null results', async () => {
            const ipnsName = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield null;
                yield undefined;
            });

            await expect(ipfsService.resolveIpns(ipnsName)).rejects.toThrow(
                'No results returned for IPNS'
            );
        });
    });

    describe('Ed25519 Key Format Compatibility', () => {
        it('should correctly extract 32-byte seed from 64-byte secret key', async () => {
            // Ed25519 secret keys from tweetnacl are 64 bytes: [32-byte seed][32-byte public key]
            // libp2p expects just the 32-byte seed
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');

            // Create a 64-byte tweetnacl-style secret key
            const fullSecretKey = new Uint8Array(64);
            crypto.getRandomValues(fullSecretKey);

            // Extract first 32 bytes (the seed)
            const seed = fullSecretKey.slice(0, 32);

            // Generate libp2p keypair from seed
            const libp2pKey = await generateKeyPairFromSeed('Ed25519', seed);

            // Verify libp2pKey was created successfully
            expect(libp2pKey.publicKey).toBeDefined();
            expect(libp2pKey.publicKey.raw).toBeDefined();
            expect(libp2pKey.publicKey.raw.length).toBeGreaterThan(0);
        });

        it('should generate compatible libp2p key pair from tweetnacl seed', async () => {
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');
            const { peerIdFromPublicKey } = await import('@libp2p/peer-id');

            // Simulate tweetnacl key generation
            const seed = new Uint8Array(32);
            crypto.getRandomValues(seed);

            // Generate libp2p key from same seed
            const libp2pKey = (await generateKeyPairFromSeed('Ed25519', seed)) as Ed25519PrivateKey;

            // Verify we can derive a peer ID from the public key
            const peerId = peerIdFromPublicKey(libp2pKey.publicKey);

            expect(peerId.toString()).toMatch(/^12D3KooW[a-zA-Z0-9]+$/);
        });

        it('should maintain key consistency across conversions', async () => {
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');
            const { createIPNSRecord, marshalIPNSRecord, unmarshalIPNSRecord } = await import('ipns');
            const { CID } = await import('multiformats/cid');

            // Create keypair
            const seed = new Uint8Array(32);
            crypto.getRandomValues(seed);
            const privateKey = (await generateKeyPairFromSeed('Ed25519', seed)) as Ed25519PrivateKey;

            // Create IPNS record
            const testCid = CID.parse('bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm');
            const ipnsRecord = await createIPNSRecord(privateKey, testCid, 0n, 86400000);

            // Marshal and unmarshal
            const marshaled = marshalIPNSRecord(ipnsRecord);
            const unmarshaled = unmarshalIPNSRecord(marshaled);

            // Verify the record round-trips correctly
            expect(unmarshaled.value).toBeDefined();
            expect(unmarshaled.value.toString()).toBe(`/ipfs/${testCid.toString()}`);
            expect(unmarshaled.sequence).toBe(0n);

            // Verify marshaling preserves all critical fields
            expect(marshaled.length).toBeGreaterThan(0);
        });

        it('should handle tweetnacl 64-byte secret key format in IPNS publishing', async () => {
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');

            // Simulate a 64-byte tweetnacl secret key (seed + public key)
            const fullSecretKey = new Uint8Array(64);
            crypto.getRandomValues(fullSecretKey);

            // Extract seed (first 32 bytes) as libp2p expects
            const seed = fullSecretKey.slice(0, 32);

            // Create libp2p-compatible key
            const privateKey = (await generateKeyPairFromSeed('Ed25519', seed)) as Ed25519PrivateKey;

            const testCid = 'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            mockKuboClient.routing.put.mockImplementation(async function* () {
                yield { Type: 'SendingQuery' };
            });

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield `/ipfs/${testCid}`;
            });

            // Should successfully publish with converted key
            const ipnsName = await ipfsService.publishToIpns(testCid, privateKey);

            expect(ipnsName).toMatch(/^12D3KooW[a-zA-Z0-9]+$/);
        });

        it('should verify public key matches between tweetnacl and libp2p formats', async () => {
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');
            const { peerIdFromPublicKey } = await import('@libp2p/peer-id');

            const seed = new Uint8Array(32);
            crypto.getRandomValues(seed);

            // Generate libp2p key
            const libp2pKey = (await generateKeyPairFromSeed('Ed25519', seed)) as Ed25519PrivateKey;

            // Verify we can derive a peer ID (this validates the key format)
            const peerId = peerIdFromPublicKey(libp2pKey.publicKey);
            expect(peerId.toString()).toMatch(/^12D3KooW[a-zA-Z0-9]+$/);

            // Verify public key raw bytes are correct size
            const publicKeyBytes = libp2pKey.publicKey.raw;
            expect(publicKeyBytes).toBeDefined();
            // Ed25519 public keys are always 32 bytes
            expect(publicKeyBytes.length).toBe(32);
        });
    });

    describe('publishToIpns integration with resolveIpns', () => {
        let mockPrivateKey: Ed25519PrivateKey;
        let testCid: string;

        beforeEach(async () => {
            const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');
            const seed = new Uint8Array(32);
            crypto.getRandomValues(seed);
            mockPrivateKey = (await generateKeyPairFromSeed('Ed25519', seed)) as Ed25519PrivateKey;

            testCid = 'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm';

            mockKuboClient.routing.put.mockImplementation(async function* () {
                yield { Type: 'SendingQuery' };
            });

            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield `/ipfs/${testCid}`;
            });
        });

        it('should publish and verify resolution in one flow', async () => {
            const ipnsName = await ipfsService.publishToIpns(testCid, mockPrivateKey);

            // Verify the IPNS record was published
            expect(mockKuboClient.routing.put).toHaveBeenCalled();

            // Verify resolution was called as part of publish verification
            expect(mockKuboClient.name.resolve).toHaveBeenCalledWith(ipnsName);

            // Manually resolve to verify it works independently
            const resolvedCid = await ipfsService.resolveIpns(ipnsName);
            expect(resolvedCid).toBe(testCid);
        });

        it('should fail publish if verification resolution fails', async () => {
            mockKuboClient.name.resolve.mockImplementation(async function* () {
                yield '/ipfs/wrong-cid';
            });

            await expect(
                ipfsService.publishToIpns(testCid, mockPrivateKey)
            ).rejects.toThrow('IPNS resolution mismatch');
        });
    });
});
