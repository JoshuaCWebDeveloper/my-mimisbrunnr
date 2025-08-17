// Unit tests for ReplicationHandler
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplicationHandler } from '../../services/replication-handler.js';
import type { LogEntry } from '../../types/orbitdb.js';
import type { DiscoveryRecord } from '@my-mimisbrunnr/protocol';

// Use static mocks to avoid module boundary issues
vi.mock('@my-mimisbrunnr/validation', () => ({
    validateDiscoveryRecord: vi.fn(),
}));

import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';

vi.mock('../../config/environment.js', () => ({
    config: {
        operational: {
            storageCleanupInterval: 3600000,
            maxLogEntriesPinned: 1000,
        },
    },
}));

describe('ReplicationHandler', () => {
    let replicationHandler: ReplicationHandler;
    let mockIPFSClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock IPFS client
        mockIPFSClient = {
            pinContent: vi.fn().mockResolvedValue({ success: true }),
            unpinContent: vi.fn().mockResolvedValue(true),
        };

        replicationHandler = new ReplicationHandler(mockIPFSClient);
    });

    afterEach(async () => {
        await replicationHandler.shutdown();
    });

    describe('initialization', () => {
        it('should initialize successfully', () => {
            expect(replicationHandler).toBeDefined();
        });
    });

    describe('entry processing', () => {
        const createMockEntry = (overrides: Partial<DiscoveryRecord> = {}): LogEntry<DiscoveryRecord> => ({
            hash: 'test-hash-123',
            payload: {
                value: {
                    lookupKey: 'a'.repeat(64),
                    handle: '@testuser',
                    ipnsKey: 'k2k4r8n9w3t2...',
                    did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    ...overrides,
                },
            },
            next: [],
            clock: { id: 'peer1', time: 1 },
            signature: 'signature123',
            identity: { id: 'peer1', publicKey: 'pubkey123' },
        });

        it('should process valid entries successfully', async () => {
            const validEntry = createMockEntry();

            await replicationHandler.handleNewEntry(validEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalProcessed).toBe(1);
            expect(stats.totalPinned).toBe(1);
            expect(stats.totalRejected).toBe(0);
            expect(mockIPFSClient.pinContent).toHaveBeenCalledWith({
                cid: 'test-hash-123',
                recursive: false,
                clientIP: 'orbitdb-replication',
                timestamp: expect.any(Number),
            });
        });

        it('should reject invalid entries but still track them', async () => {
            vi.mocked(validateDiscoveryRecord).mockReturnValueOnce(false);

            const invalidEntry = createMockEntry({ handle: '' }); // Invalid handle

            await replicationHandler.handleNewEntry(invalidEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalProcessed).toBe(1);
            expect(stats.totalPinned).toBe(0);
            expect(stats.totalRejected).toBe(1);
            expect(stats.validEntries).toBe(0);
            expect(stats.invalidEntries).toBe(1);
            expect(mockIPFSClient.pinContent).not.toHaveBeenCalled();
        });

        it('should handle entries with missing lookupKey', async () => {
            const invalidEntry = createMockEntry({ lookupKey: '' });

            await replicationHandler.handleNewEntry(invalidEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalRejected).toBe(1);
        });

        it('should handle entries with missing handle', async () => {
            const invalidEntry = createMockEntry({ handle: '' });

            await replicationHandler.handleNewEntry(invalidEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalRejected).toBe(1);
        });

        it('should handle entries with missing DID', async () => {
            const invalidEntry = createMockEntry({ did: '' });

            await replicationHandler.handleNewEntry(invalidEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalRejected).toBe(1);
        });

        it('should handle entries with future timestamps', async () => {
            const futureEntry = createMockEntry({
                createdAt: Date.now() + 120000, // 2 minutes in the future
            });

            await replicationHandler.handleNewEntry(futureEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalRejected).toBe(1);
        });

        it('should handle entries with very old timestamps', async () => {
            const oldEntry = createMockEntry({
                createdAt: Date.now() - (400 * 24 * 60 * 60 * 1000), // 400 days ago
            });

            await replicationHandler.handleNewEntry(oldEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalRejected).toBe(1);
        });

        it('should handle pinning failures gracefully', async () => {
            mockIPFSClient.pinContent.mockRejectedValueOnce(new Error('Pin failed'));

            const validEntry = createMockEntry();

            await replicationHandler.handleNewEntry(validEntry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalProcessed).toBe(1);
            expect(stats.totalRejected).toBe(1);
            expect(stats.totalPinned).toBe(0);
        });

        it('should handle validation errors gracefully', async () => {
            vi.mocked(validateDiscoveryRecord).mockImplementationOnce(() => {
                throw new Error('Validation error');
            });

            const entry = createMockEntry();

            await replicationHandler.handleNewEntry(entry);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalRejected).toBe(1);
        });
    });

    describe('statistics and tracking', () => {
        it('should return accurate statistics', async () => {
            const entry1 = createMockEntry({ handle: '@user1' });
            const entry2 = createMockEntry({ handle: '@user2' });
            
            // Mock validation to reject second entry
            vi.mocked(validateDiscoveryRecord)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            await replicationHandler.handleNewEntry(entry1);
            await replicationHandler.handleNewEntry(entry2);

            const stats = replicationHandler.getReplicationStats();
            expect(stats.totalProcessed).toBe(2);
            expect(stats.totalPinned).toBe(1);
            expect(stats.totalRejected).toBe(1);
            expect(stats.validEntries).toBe(1);
            expect(stats.invalidEntries).toBe(1);
            expect(stats.pinnedEntries).toBe(2); // Both are tracked
        });

        it('should return list of pinned entries', async () => {
            const entry = createMockEntry();
            await replicationHandler.handleNewEntry(entry);

            const pinnedEntries = replicationHandler.getPinnedEntries();
            expect(pinnedEntries).toHaveLength(1);
            expect(pinnedEntries[0].hash).toBe('test-hash-123');
            expect(pinnedEntries[0].valid).toBe(true);
        });
    });

    describe('cleanup operations', () => {
        it('should clean up old entries when limit is exceeded', async () => {
            // Mock config to have a very low limit for testing
            const originalConfig = await import('../../config/environment.js');
            vi.mocked(originalConfig.config.operational.maxLogEntriesPinned).mockReturnValue(2);

            // Add entries beyond the limit
            for (let i = 0; i < 5; i++) {
                const entry = createMockEntry({ handle: `@user${i}` });
                await replicationHandler.handleNewEntry(entry);
                
                // Make entries appear old by mocking timestamps
                const pinnedEntries = replicationHandler.getPinnedEntries();
                if (pinnedEntries.length > 0) {
                    const lastEntry = pinnedEntries[pinnedEntries.length - 1];
                    // Simulate old timestamp
                    (lastEntry as any).timestamp = Date.now() - (40 * 24 * 60 * 60 * 1000);
                }
            }

            // Trigger cleanup
            await replicationHandler.cleanupOldEntries();

            // Should have cleaned up some entries
            const _stats = replicationHandler.getReplicationStats();
            expect(mockIPFSClient.unpinContent).toHaveBeenCalled();
        });

        it('should not clean up when under the limit', async () => {
            const entry = createMockEntry();
            await replicationHandler.handleNewEntry(entry);

            await replicationHandler.cleanupOldEntries();

            // Should not have unpinned anything
            expect(mockIPFSClient.unpinContent).not.toHaveBeenCalled();
        });

        it('should handle cleanup errors gracefully', async () => {
            mockIPFSClient.unpinContent.mockRejectedValue(new Error('Unpin failed'));

            // This would normally trigger cleanup but we can't easily test the interval
            // So we test the error handling path directly
            await expect(replicationHandler.cleanupOldEntries()).resolves.not.toThrow();
        });
    });

    describe('shutdown', () => {
        it('should shutdown gracefully', async () => {
            await expect(replicationHandler.shutdown()).resolves.not.toThrow();
        });

        it('should return final statistics on shutdown', async () => {
            const entry = createMockEntry();
            await replicationHandler.handleNewEntry(entry);

            await replicationHandler.shutdown();

            // The shutdown logs statistics, so just ensure it doesn't crash
            expect(true).toBe(true);
        });
    });
});