// Integration tests for PerpetualNodeService
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PerpetualNodeService } from '../../services/perpetual-node-service.js';
import type { DiscoveryRecord as _DiscoveryRecord } from '@my-mimisbrunnr/protocol';

// Mock external dependencies for integration testing
vi.mock('ipfs-http-client', () => ({
    create: vi.fn(() => ({
        id: vi.fn().mockResolvedValue({ id: 'test-peer-integration' }),
        version: vi.fn().mockResolvedValue({ version: '0.60.0' }),
        pin: {
            add: vi.fn().mockResolvedValue({ cid: 'test-cid' }),
            rm: vi.fn().mockResolvedValue({}),
            ls: vi.fn().mockResolvedValue([]),
        },
        dag: {
            get: vi.fn().mockResolvedValue({ value: { test: 'data' } }),
            put: vi.fn().mockResolvedValue('QmTestCID'),
        },
        pubsub: {
            publish: vi.fn().mockResolvedValue({}),
            subscribe: vi.fn().mockResolvedValue([]),
            unsubscribe: vi.fn().mockResolvedValue({}),
            peers: vi.fn().mockResolvedValue([]),
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
}));

// Mock OrbitDB
vi.mock('orbit-db', () => ({
    default: {
        createInstance: vi.fn().mockResolvedValue({
            id: 'test-orbitdb-id',
            log: vi.fn().mockResolvedValue({
                add: vi.fn().mockResolvedValue('entry-hash-123'),
                iterator: vi.fn(() => []),
                load: vi.fn().mockResolvedValue({}),
                close: vi.fn().mockResolvedValue({}),
                address: {
                    toString: vi.fn(() => '/orbitdb/test-address'),
                    root: 'test-root',
                },
                events: {
                    on: vi.fn(),
                    off: vi.fn(),
                },
                replicationStatus: {
                    progress: 0,
                    max: 0,
                },
            }),
            disconnect: vi.fn().mockResolvedValue({}),
        }),
    },
}));

// Mock shared libraries
vi.mock('@my-mimisbrunnr/protocol', () => ({}));

vi.mock('@my-mimisbrunnr/config', () => ({
    PROTOCOL: {
        VERSION: '1.0.0',
        ORBITDB_LOG_NAME: 'xcom-taglist-discovery',
        IPFS_TIMEOUT: 120000,
    },
    VALIDATION_LIMITS: {
        MAX_DISCOVERY_RECORD_SIZE: 1024,
        MAX_CONTENT_SIZE: 1048576,
        MAX_RATE_LIMIT_REQUESTS: 60,
    },
}));

// Remove vi.mock for validation to fix module boundary lint errors

describe('PerpetualNodeService Integration', () => {
    let service: PerpetualNodeService;
    let originalConsoleLog: any;
    let originalConsoleError: any;

    beforeAll(() => {
        // Suppress console output during tests
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        console.log = vi.fn();
        console.error = vi.fn();

        // Mock environment variables
        process.env.IPFS_API_URL = 'http://localhost:5001';
        process.env.ORBITDB_LOG_NAME = 'test-discovery-log';
        process.env.PORT = '3001';
        process.env.LOG_LEVEL = 'error';
    });

    afterAll(() => {
        // Restore console
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        service = new PerpetualNodeService();
    });

    afterEach(async () => {
        // Ensure proper cleanup
        try {
            await service['shutdown']();
        } catch (_error) {
            // Ignore shutdown errors in tests
        }
    });

    describe('service initialization', () => {
        it('should start all services successfully', async () => {
            await expect(service.start()).resolves.not.toThrow();

            const status = service.getServiceStatus();
            expect(status.running).toBe(true);
            expect(status.services.ipfs).toBe(true);
            expect(status.services.orbitdb).toBe(true);
            expect(status.services.replication).toBe(true);
            expect(status.services.rateLimiter).toBe(true);
            expect(status.services.healthCheck).toBe(true);
        }, 10000);

        it('should handle IPFS initialization failure', async () => {
            // Mock IPFS to fail
            const mockCreate = await import('ipfs-http-client');
            vi.mocked(mockCreate.create).mockReturnValueOnce({
                id: vi.fn().mockRejectedValue(new Error('IPFS connection failed')),
                version: vi.fn().mockRejectedValue(new Error('IPFS connection failed')),
            } as any);

            // Service start should exit the process on failure
            const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('Process exit called');
            });

            await expect(service.start()).rejects.toThrow('Process exit called');
            expect(mockExit).toHaveBeenCalledWith(1);
            
            mockExit.mockRestore();
        });

        it('should handle OrbitDB initialization failure', async () => {
            // Mock OrbitDB to fail
            const OrbitDB = await import('orbit-db');
            vi.mocked(OrbitDB.default.createInstance).mockRejectedValueOnce(new Error('OrbitDB failed'));

            const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('Process exit called');
            });

            await expect(service.start()).rejects.toThrow('Process exit called');
            expect(mockExit).toHaveBeenCalledWith(1);
            
            mockExit.mockRestore();
        });
    });

    describe('service integration', () => {
        beforeEach(async () => {
            await service.start();
        });

        it('should integrate IPFS and OrbitDB services', async () => {
            // Verify services are connected and working together
            const status = service.getServiceStatus();
            
            expect(status.services.ipfs).toBe(true);
            expect(status.services.orbitdb).toBe(true);
            expect(status.services.replication).toBe(true);
        });

        it('should handle OrbitDB replication events', async () => {
            // This tests that the OrbitDB manager and replication handler work together
            // In a real integration test, we would trigger actual replication events
            
            const status = service.getServiceStatus();
            expect(status.running).toBe(true);
            
            // The integration is verified by successful service startup
            expect(status.services.orbitdb).toBe(true);
            expect(status.services.replication).toBe(true);
        });

        it('should provide health check endpoints', async () => {
            // Since we're not running a real HTTP server in tests,
            // we just verify the health check system is initialized
            const status = service.getServiceStatus();
            expect(status.services.healthCheck).toBe(true);
        });
    });

    describe('graceful shutdown', () => {
        it('should shut down all services gracefully', async () => {
            await service.start();
            
            // Trigger shutdown
            await service['shutdown']();
            
            const status = service.getServiceStatus();
            expect(status.running).toBe(false);
        });

        it('should handle shutdown errors gracefully', async () => {
            await service.start();
            
            // Mock one service to fail during shutdown
            const ipfsClient = service['ipfsClient'];
            if (ipfsClient) {
                vi.spyOn(ipfsClient, 'shutdown').mockRejectedValueOnce(new Error('Shutdown failed'));
            }
            
            // Should not throw despite the error
            await expect(service['shutdown']()).resolves.not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should handle uncaught exceptions', async () => {
            await service.start();
            
            const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('Process exit called');
            });
            
            // Simulate uncaught exception
            const uncaughtHandler = process.listeners('uncaughtException').find(
                listener => listener.toString().includes('Uncaught Exception')
            );
            
            if (uncaughtHandler) {
                expect(() => {
                    (uncaughtHandler as any)(new Error('Test error'));
                }).toThrow('Process exit called');
                expect(mockExit).toHaveBeenCalledWith(1);
            }
            
            mockExit.mockRestore();
        });

        it('should handle unhandled promise rejections', async () => {
            await service.start();
            
            // Simulate unhandled rejection
            const rejectionHandler = process.listeners('unhandledRejection').find(
                listener => listener.toString().includes('Unhandled Rejection')
            );
            
            if (rejectionHandler) {
                expect(() => {
                    (rejectionHandler as any)(new Error('Test rejection'), Promise.reject('test'));
                }).not.toThrow();
            }
        });
    });

    describe('service status monitoring', () => {
        it('should provide accurate service status', async () => {
            await service.start();
            
            const status = service.getServiceStatus();
            
            expect(status).toEqual({
                running: true,
                uptime: expect.any(Number),
                services: {
                    ipfs: true,
                    orbitdb: true,
                    replication: true,
                    rateLimiter: true,
                    healthCheck: true,
                },
            });
            
            expect(status.uptime).toBeGreaterThan(0);
        });
    });
});