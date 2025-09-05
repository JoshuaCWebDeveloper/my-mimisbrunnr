// Unit tests for IpfsClient
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IpfsClient } from './ipfs-client.js';
import type { Logger } from '../logger/logger.js';
import type { HealthService } from '../health/health.service.js';
import { create } from 'kubo-rpc-client';

// Mock kubo-rpc-client
vi.mock('kubo-rpc-client', () => ({
    create: vi.fn(() => ({
        id: vi.fn().mockResolvedValue({ id: 'test-peer-id' }),
        version: vi.fn().mockResolvedValue({ version: '0.60.0' }),
        pin: {
            add: vi.fn().mockResolvedValue({ toString: () => 'test-cid' }),
            rm: vi.fn().mockResolvedValue({}),
        },
        dag: {
            get: vi.fn().mockResolvedValue({ value: { test: 'data' } }),
        },
        pubsub: {
            publish: vi.fn().mockResolvedValue({}),
            subscribe: vi.fn().mockResolvedValue([]),
        },
        repo: {
            stat: vi.fn().mockResolvedValue({
                numObjects: 100,
                repoSize: 1024 * 1024,
                storageMax: 10 * 1024 * 1024,
                repoPath: '/tmp/ipfs',
                version: '12',
            }),
        },
    })),
    CID: {
        parse: vi.fn().mockReturnValue({ toString: () => 'test-cid' }),
    },
}));

describe('IpfsClient', () => {
    let ipfsClient: IpfsClient;
    let mockLogger: Logger;
    let mockHealthService: Partial<HealthService>;
    let mockConfigService: Partial<import('@nestjs/config').ConfigService>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        } as unknown as Logger;
        mockHealthService = {
            registerService: vi.fn(),
            unregisterService: vi.fn(),
        };
        mockConfigService = {
            get: vi.fn().mockReturnValue({
                ipfs: {
                    apiUrl: 'http://127.0.0.1:5001',
                },
            }),
        };
        ipfsClient = new IpfsClient(
            mockLogger,
            mockHealthService as unknown as HealthService,
            mockConfigService as unknown as import('@nestjs/config').ConfigService
        );
    });

    afterEach(async () => {
        await ipfsClient.shutdown();
    });

    describe('initialization', () => {
        it('should initialize successfully and connect to IPFS', async () => {
            await ipfsClient.initialize();

            const status = ipfsClient.getConnectionStatus();
            expect(status.connected).toBe(true);
            expect(status.peerId).toBe('test-peer-id');
            expect(status.version).toBe('0.60.0');
        });

        it('should handle initialization failure gracefully', async () => {
            // Mock IPFS client to fail by creating a new instance that will use the failing mock
            vi.mocked(create).mockReturnValueOnce({
                id: vi.fn().mockRejectedValue(new Error('Connection failed')),
                version: vi
                    .fn()
                    .mockRejectedValue(new Error('Connection failed')),
                pin: { add: vi.fn() },
                dag: { get: vi.fn() },
                block: { get: vi.fn() },
            } as unknown as ReturnType<typeof create>);

            const failingClient = new IpfsClient(
                mockLogger,
                {
                    registerService: vi.fn(),
                    unregisterService: vi.fn(),
                } as unknown as HealthService,
                mockConfigService as unknown as import('@nestjs/config').ConfigService
            );

            // The initialize method retries indefinitely, so we test with a timeout
            // After attempting to initialize, the connection should still be false
            failingClient.initialize();

            // Wait a short time to let it try once
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that the connection status reflects the failure
            const status = failingClient.getConnectionStatus();
            expect(status.connected).toBe(false);
            expect(status.error).toContain('Connection failed');

            await failingClient.shutdown(); // Stop the retry loop
        });
    });

    describe('connection management', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should return current connection status', () => {
            const status = ipfsClient.getConnectionStatus();

            expect(status.connected).toBe(true);
            expect(status.peerId).toBe('test-peer-id');
            expect(status.version).toBe('0.60.0');
            expect(status.lastCheck).toBeGreaterThan(0);
        });

        it('should handle connection check failures', async () => {
            // Test that a successful connection can report errors on subsequent method calls
            // First let the client initialize successfully
            await ipfsClient.initialize();

            // Now mock the raw client to fail on specific operations
            const rawClient = ipfsClient.getRawClient() as unknown as {
                pin: { add: ReturnType<typeof vi.fn> };
            };
            const originalPin = rawClient.pin.add;
            rawClient.pin.add = vi
                .fn()
                .mockRejectedValue(new Error('Network error'));

            // Try to pin content, which will trigger internal connection check
            const result = await ipfsClient.pinContent({
                cid: 'test-cid',
                recursive: false,
                clientIP: '127.0.0.1',
                timestamp: Date.now(),
            });

            // The pinContent call should fail but return a result with error
            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');

            // Restore original method
            rawClient.pin.add = originalPin;
        });
    });

    describe('content pinning', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should pin content successfully', async () => {
            const request = {
                cid: 'QmTestCID123',
                recursive: false,
                clientIP: '127.0.0.1',
                timestamp: Date.now(),
            };

            const result = await ipfsClient.pinContent(request);

            expect(result.success).toBe(true);
            expect(result.cid).toBe('test-cid');
            expect(result.error).toBeUndefined();
        });

        it('should handle invalid CID format', async () => {
            const rawClient = ipfsClient.getRawClient() as unknown;
            vi.mocked(
                (rawClient as { pin: { add: () => void } }).pin.add
            ).mockRejectedValueOnce(new Error('Invalid CID format'));

            const request = {
                cid: 'invalid',
                recursive: false,
                clientIP: '127.0.0.1',
                timestamp: Date.now(),
            };

            const result = await ipfsClient.pinContent(request);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid CID format');
        });

        it('should handle pinning failures', async () => {
            const rawClient = ipfsClient.getRawClient() as unknown;
            vi.mocked(
                (rawClient as { pin: { add: () => void } }).pin.add
            ).mockRejectedValueOnce(new Error('Pin failed'));

            const request = {
                cid: 'QmTestCID123',
                recursive: false,
                clientIP: '127.0.0.1',
                timestamp: Date.now(),
            };

            const result = await ipfsClient.pinContent(request);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Pin failed');
        });

        it('should use the recursive setting from the request', async () => {
            const rawClient = ipfsClient.getRawClient() as unknown;
            const mockPinAdd = vi.mocked(
                (rawClient as { pin: { add: () => void } }).pin.add
            );

            const request = {
                cid: 'QmTestCID123',
                recursive: true,
                clientIP: '127.0.0.1',
                timestamp: Date.now(),
            };

            await ipfsClient.pinContent(request);

            // Should be called with the same recursive setting as the request
            expect(mockPinAdd).toHaveBeenCalledWith('QmTestCID123', {
                recursive: true,
            });
        });
    });

    describe('content unpinning', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should unpin content successfully', async () => {
            const result = await ipfsClient.unpinContent('QmTestCID123');

            expect(result).toBe(true);
        });

        it('should handle unpinning failures gracefully', async () => {
            const rawClient = ipfsClient.getRawClient() as unknown;
            vi.mocked(
                (rawClient as { pin: { rm: () => void } }).pin.rm
            ).mockRejectedValueOnce(new Error('Unpin failed'));

            const result = await ipfsClient.unpinContent('QmTestCID123');

            expect(result).toBe(false);
        });
    });

    describe('DAG operations', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should get DAG content successfully', async () => {
            const content = await ipfsClient.getDagContent('QmTestCID123');

            expect(content).toEqual({ test: 'data' });
        });

        it('should handle DAG retrieval failures', async () => {
            const rawClient = ipfsClient.getRawClient() as unknown;
            vi.mocked(
                (rawClient as { dag: { get: () => void } }).dag.get
            ).mockRejectedValueOnce(new Error('DAG not found'));

            await expect(
                ipfsClient.getDagContent('QmInvalidCID')
            ).rejects.toThrow('DAG not found');
        });
    });

    describe('pubsub operations', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should publish messages to topics', async () => {
            const topic = 'test-topic';
            const data = new Uint8Array([1, 2, 3]);

            await expect(
                ipfsClient.publishMessage(topic, data)
            ).resolves.not.toThrow();
        });

        it('should subscribe to topics', async () => {
            const topic = 'test-topic';

            const subscription = await ipfsClient.subscribeToTopic(topic);

            expect(subscription).toBeDefined();
        });
    });

    describe('repository statistics', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should get repository statistics', async () => {
            const stats = await ipfsClient.getRepositoryStats();

            expect(stats).toEqual({
                numObjects: 100,
                repoSize: 1024 * 1024,
                storageMax: 10 * 1024 * 1024,
                repoPath: '/tmp/ipfs',
                version: '12',
            });
        });

        it('should handle repository stats failures', async () => {
            const rawClient = ipfsClient.getRawClient() as unknown;
            vi.mocked(
                (rawClient as { repo: { stat: () => void } }).repo.stat
            ).mockRejectedValueOnce(new Error('Stats unavailable'));

            await expect(ipfsClient.getRepositoryStats()).rejects.toThrow(
                'Stats unavailable'
            );
        });
    });

    describe('raw client access', () => {
        beforeEach(async () => {
            await ipfsClient.initialize();
        });

        it('should provide access to raw IPFS client', () => {
            const rawClient = ipfsClient.getRawClient();

            expect(rawClient).toBeDefined();
            expect(
                (rawClient as unknown as { id: unknown; pin: unknown }).id
            ).toBeDefined();
            expect(
                (rawClient as unknown as { id: unknown; pin: unknown }).pin
            ).toBeDefined();
        });
    });

    describe('shutdown', () => {
        it('should shutdown gracefully', async () => {
            await ipfsClient.initialize();

            await expect(ipfsClient.shutdown()).resolves.not.toThrow();
        });
    });
});
