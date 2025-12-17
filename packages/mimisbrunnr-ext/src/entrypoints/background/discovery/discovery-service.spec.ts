import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryService } from './discovery-service.js';
import type { ExtensionOrbitDbManager } from './extension-orbitdb-manager.js';
import type { DiscoveryRecord } from './types.js';

describe('DiscoveryService', () => {
    let discoveryService: DiscoveryService;
    let mockExtensionOrbitDbManager: {
        isInitialized: ReturnType<typeof vi.fn>;
        getDatabase: ReturnType<typeof vi.fn>;
    };
    let mockDatabase: {
        add: ReturnType<typeof vi.fn>;
        all: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        // Create mock database
        mockDatabase = {
            add: vi.fn(),
            all: vi.fn(),
        };

        // Create mock OrbitDB service
        mockExtensionOrbitDbManager = {
            isInitialized: vi.fn().mockReturnValue(true),
            getDatabase: vi.fn().mockReturnValue(mockDatabase),
        };

        // Create discovery service with mocked dependencies
        discoveryService = new DiscoveryService(
            mockExtensionOrbitDbManager as unknown as ExtensionOrbitDbManager
        );
    });

    describe('publishDiscovery', () => {
        it('should publish discovery record successfully', async () => {
            const handle = '@alice';
            const ipnsKey = 'k51qzi5uqu5d...';
            const did = 'did:key:z6Mk...';

            mockDatabase.add.mockResolvedValue('QmHash123');

            await discoveryService.publishDiscovery(handle, ipnsKey, did);

            expect(mockDatabase.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    handle: '@alice', // Normalized
                    ipnsKey,
                    did,
                    lookupKey: expect.any(String), // SHA-256 hash
                    createdAt: expect.any(Number),
                    updatedAt: expect.any(Number),
                })
            );
        });

        it('should normalize handle before publishing', async () => {
            const handle = 'Alice'; // Without @, mixed case
            const ipnsKey = 'k51qzi5uqu5d...';
            const did = 'did:key:z6Mk...';

            mockDatabase.add.mockResolvedValue('QmHash123');

            await discoveryService.publishDiscovery(handle, ipnsKey, did);

            expect(mockDatabase.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    handle: '@alice', // Should be normalized to @alice
                })
            );
        });

        it('should throw error if OrbitDB not initialized', async () => {
            mockExtensionOrbitDbManager.isInitialized.mockReturnValue(false);

            await expect(
                discoveryService.publishDiscovery('@alice', 'ipns', 'did')
            ).rejects.toThrow('OrbitDB service not initialized');
        });

        it('should throw error for invalid handle format', async () => {
            await expect(
                discoveryService.publishDiscovery(
                    '@' + 'a'.repeat(16), // Too long
                    'ipns',
                    'did'
                )
            ).rejects.toThrow('Invalid handle format');
        });
    });

    describe('discoverByHandle', () => {
        it('should discover user by handle', async () => {
            const handle = '@alice';
            const record: DiscoveryRecord = {
                lookupKey: 'abc123...',
                handle: '@alice',
                ipnsKey: 'k51qzi5uqu5d...',
                did: 'did:key:z6Mk...',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            mockDatabase.all.mockResolvedValue([{ value: record }]);

            const result = await discoveryService.discoverByHandle(handle);

            expect(result).toEqual(record);
            expect(mockDatabase.all).toHaveBeenCalled();
        });

        it('should return null if handle not found', async () => {
            mockDatabase.all.mockResolvedValue([]);

            const result = await discoveryService.discoverByHandle('@nobody');

            expect(result).toBeNull();
        });

        it('should apply Last-Write-Wins for multiple records', async () => {
            const older: DiscoveryRecord = {
                lookupKey: 'abc123...',
                handle: '@alice',
                ipnsKey: 'k51qzi5uqu5d...old',
                did: 'did:key:z6Mk...old',
                createdAt: Date.now() - 10000,
                updatedAt: Date.now() - 10000,
            };

            const newer: DiscoveryRecord = {
                lookupKey: 'abc123...',
                handle: '@alice',
                ipnsKey: 'k51qzi5uqu5d...new',
                did: 'did:key:z6Mk...new',
                createdAt: Date.now() - 5000,
                updatedAt: Date.now(), // Most recent
            };

            mockDatabase.all.mockResolvedValue([
                { value: older },
                { value: newer },
            ]);

            const result = await discoveryService.discoverByHandle('@alice');

            // Should return the newer record (LWW)
            expect(result).toEqual(newer);
        });

        it('should normalize handle before querying', async () => {
            const record: DiscoveryRecord = {
                lookupKey: 'abc123...',
                handle: '@alice',
                ipnsKey: 'k51qzi5uqu5d...',
                did: 'did:key:z6Mk...',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            mockDatabase.all.mockResolvedValue([{ value: record }]);

            // Query with different case and no @
            const result = await discoveryService.discoverByHandle('Alice');

            expect(result).toEqual(record);
        });

        it('should throw error if OrbitDB not initialized', async () => {
            mockExtensionOrbitDbManager.isInitialized.mockReturnValue(false);

            await expect(
                discoveryService.discoverByHandle('@alice')
            ).rejects.toThrow('OrbitDB service not initialized');
        });
    });

    describe('updateDiscovery', () => {
        it('should update discovery record with newer timestamp', async () => {
            const handle = '@alice';
            const ipnsKey = 'k51qzi5uqu5d...';
            const did = 'did:key:z6Mk...';

            mockDatabase.add.mockResolvedValue('QmHash456');

            await discoveryService.updateDiscovery(handle, ipnsKey, did);

            // Update is same as publish (adds new record with newer timestamp)
            expect(mockDatabase.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    handle: '@alice',
                    ipnsKey,
                    did,
                    updatedAt: expect.any(Number),
                })
            );
        });
    });

    describe('getAllRecords', () => {
        it('should return all discovery records', async () => {
            const records: DiscoveryRecord[] = [
                {
                    lookupKey: 'abc123...',
                    handle: '@alice',
                    ipnsKey: 'k51qzi5uqu5d...1',
                    did: 'did:key:z6Mk...1',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    lookupKey: 'def456...',
                    handle: '@bob',
                    ipnsKey: 'k51qzi5uqu5d...2',
                    did: 'did:key:z6Mk...2',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            mockDatabase.all.mockResolvedValue(
                records.map(r => ({ value: r }))
            );

            const result = await discoveryService.getAllRecords();

            expect(result).toEqual(records);
            expect(result).toHaveLength(2);
        });

        it('should handle empty database', async () => {
            mockDatabase.all.mockResolvedValue([]);

            const result = await discoveryService.getAllRecords();

            expect(result).toEqual([]);
        });
    });
});
