import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrbitDbServiceManager } from './orbitdb-service-manager.js';
import { Logger } from '../logger/logger.js';
import type { BaseDatabase } from '@my-mimisbrunnr/orbitdb';
import { OrbitDbManager } from '@my-mimisbrunnr/orbitdb';
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import type { HeliaNode } from './helia-node.js';
import type { ReplicationHandler } from './replication-handler.js';
import type { HealthService } from '../health/health.service.js';

// Mock the base OrbitDbManager
vi.mock('@my-mimisbrunnr/orbitdb', async importOriginal => {
    const original = await importOriginal<
        typeof import('@my-mimisbrunnr/orbitdb')
    >();

    // Create a mock class that extends the real OrbitDbManager
    class MockOrbitDbManager {
        protected discoveryLog: BaseDatabase | null = null;

        constructor(_config: unknown) {
            // Mock constructor
        }

        async start(_heliaConnection: Promise<unknown>): Promise<void> {
            // Mock start - will be spied on
        }

        async stop(): Promise<void> {
            // Mock stop - will be spied on
        }

        getId(): string | null {
            return 'mock-orbitdb-id';
        }

        getAddress(): string | null {
            return 'mock-address';
        }

        getDatabase(): BaseDatabase | null {
            return this.discoveryLog;
        }

        isInitialized(): boolean {
            return this.discoveryLog !== null;
        }

        protected addEventListener(
            _event: string,
            listener: (...args: unknown[]) => void
        ): void {
            // Mock addEventListener - delegate to the actual discoveryLog if it exists
            if (this.discoveryLog?.events?.on) {
                (
                    this.discoveryLog.events.on as (
                        event: string,
                        listener: (...args: unknown[]) => void
                    ) => void
                )(_event, listener);
            }
        }

        protected log(
            _level: string,
            _message: string,
            _context?: Record<string, unknown>
        ): void {
            // Mock log - subclass will override
        }

        protected async setupEventListeners(): Promise<void> {
            // Mock setupEventListeners - subclass will override
        }
    }

    return {
        ...original,
        OrbitDbManager: MockOrbitDbManager as unknown as typeof OrbitDbManager,
    };
});

vi.mock('@my-mimisbrunnr/validation', () => ({
    validateDiscoveryRecord: vi.fn(),
}));

describe('OrbitDbServiceManager', () => {
    let serviceManager: OrbitDbServiceManager;
    let mockHeliaNode: HeliaNode;
    let mockReplicationHandler: Partial<ReplicationHandler>;
    let mockHealthService: Partial<HealthService>;
    let mockLogger: Logger;
    let mockConfigService: Partial<import('@nestjs/config').ConfigService>;
    let mockDiscoveryLog: BaseDatabase;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        } as unknown as Logger;

        // Mock Helia node
        mockHeliaNode = {
            awaitConnection: vi.fn().mockResolvedValue(undefined),
            getHeliaInstance: vi.fn().mockReturnValue({
                libp2p: {
                    peerId: { toString: () => 'mock-helia-peer-id' },
                },
            }),
        } as unknown as HeliaNode;

        // Mock replication handler
        mockReplicationHandler = {
            handleNewEntry: vi.fn().mockResolvedValue(undefined),
        };

        // Mock health service
        mockHealthService = {
            registerService: vi.fn(),
            unregisterService: vi.fn(),
        };

        // Mock ConfigService
        mockConfigService = {
            get: vi.fn().mockReturnValue({
                orbitdb: {
                    logName: 'test-discovery-log',
                    dataDir: '/tmp/test-orbitdb',
                },
            }),
        };

        // Mock discovery log
        mockDiscoveryLog = {
            address: 'mock-address',
            all: vi.fn().mockResolvedValue([]),
            addOperation: vi.fn().mockResolvedValue('mock-hash'),
            events: {
                on: vi.fn(),
                off: vi.fn(),
            },
        } as unknown as BaseDatabase;

        serviceManager = new OrbitDbServiceManager(
            mockHeliaNode,
            mockReplicationHandler as ReplicationHandler,
            mockHealthService as HealthService,
            mockLogger,
            mockConfigService as import('@nestjs/config').ConfigService
        );

        // Set up the mock discovery log
        serviceManager['discoveryLog'] = mockDiscoveryLog;
    });

    afterEach(async () => {
        // Don't call stop in afterEach - let tests manage their own cleanup
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create OrbitDbServiceManager instance', () => {
            expect(serviceManager).toBeInstanceOf(OrbitDbServiceManager);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'OrbitDB Manager created'
            );
        });

        it('should extract config from ConfigService', () => {
            expect(mockConfigService.get).toHaveBeenCalledWith('app');
        });
    });

    describe('onModuleInit', () => {
        it('should initialize OrbitDB with Helia connection', async () => {
            const startSpy = vi
                .spyOn(serviceManager, 'start')
                .mockResolvedValue(undefined);
            vi.spyOn(serviceManager, 'getId').mockReturnValue('test-id');
            vi.spyOn(serviceManager, 'getDiscoveryLogStats').mockResolvedValue({
                address: 'mock-address',
                entryCount: 0,
                pinnedEntries: 0,
                replicationProgress: 100,
                peers: 0,
            });

            await serviceManager.onModuleInit();

            expect(mockHeliaNode.awaitConnection).toHaveBeenCalled();
            expect(mockHeliaNode.getHeliaInstance).toHaveBeenCalled();
            expect(startSpy).toHaveBeenCalledWith(expect.any(Promise));
            expect(mockHealthService.registerService).toHaveBeenCalledWith(
                'orbitdb',
                serviceManager
            );
        });

        it('should throw if Helia instance is not available', async () => {
            (
                mockHeliaNode.getHeliaInstance as ReturnType<typeof vi.fn>
            ).mockReturnValue(null);

            await expect(serviceManager.onModuleInit()).rejects.toThrow(
                'Helia node not initialized'
            );
        });

        it('should throw if discovery log fails to open', async () => {
            vi.spyOn(serviceManager, 'start').mockResolvedValue(undefined);
            vi.spyOn(serviceManager, 'getDiscoveryLogStats').mockResolvedValue(
                null
            );

            await expect(serviceManager.onModuleInit()).rejects.toThrow(
                'Discovery log failed to open'
            );
        });

        it('should set up replication handler', async () => {
            vi.spyOn(serviceManager, 'start').mockResolvedValue(undefined);
            vi.spyOn(serviceManager, 'getDiscoveryLogStats').mockResolvedValue({
                address: 'mock-address',
                entryCount: 0,
                pinnedEntries: 0,
                replicationProgress: 100,
                peers: 0,
            });

            await serviceManager.onModuleInit();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Replication handler set'
            );
        });

        it('should update connection status after initialization', async () => {
            vi.spyOn(serviceManager, 'start').mockResolvedValue(undefined);
            vi.spyOn(serviceManager, 'getId').mockReturnValue('test-id');
            vi.spyOn(serviceManager, 'getDiscoveryLogStats').mockResolvedValue({
                address: 'mock-address',
                entryCount: 5,
                pinnedEntries: 0,
                replicationProgress: 100,
                peers: 0,
            });

            await serviceManager.onModuleInit();

            const status = serviceManager.getConnectionStatus();
            expect(status.connected).toBe(true);
            expect(status.id).toBe('test-id');
        });
    });

    describe('onModuleDestroy', () => {
        it('should unregister from health service and stop', async () => {
            const stopSpy = vi
                .spyOn(serviceManager, 'stop')
                .mockResolvedValue(undefined);

            await serviceManager.onModuleDestroy();

            expect(mockHealthService.unregisterService).toHaveBeenCalledWith(
                'orbitdb'
            );
            expect(stopSpy).toHaveBeenCalled();
        });
    });

    describe('setReplicationHandler', () => {
        it('should set replication handler and log', () => {
            const handler = mockReplicationHandler as ReplicationHandler;

            serviceManager.setReplicationHandler(handler);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Replication handler set'
            );
        });
    });

    describe('handleReplication', () => {
        beforeEach(() => {
            serviceManager['replicationHandlerInstance'] =
                mockReplicationHandler as ReplicationHandler;
        });

        it('should handle replication events', async () => {
            const mockEntry = {
                hash: 'test-hash',
                payload: { value: { did: 'did:test:123' } },
                identity: { id: 'peer-id' },
            };

            vi.mocked(mockDiscoveryLog.all).mockResolvedValue([mockEntry]);

            await serviceManager.handleReplication('mock-address', 'test-hash');

            expect(mockReplicationHandler.handleNewEntry).toHaveBeenCalledWith(
                mockEntry
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '✅ Replication event handled successfully',
                { hash: 'test-hash' }
            );
        });

        it('should warn if discovery log is not available', async () => {
            serviceManager['discoveryLog'] = null;

            await serviceManager.handleReplication('mock-address', 'test-hash');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Discovery log or replication handler not available for replication event'
            );
            expect(
                mockReplicationHandler.handleNewEntry
            ).not.toHaveBeenCalled();
        });

        it('should warn if replication handler is not set', async () => {
            serviceManager['replicationHandlerInstance'] = undefined;

            await serviceManager.handleReplication('mock-address', 'test-hash');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Discovery log or replication handler not available for replication event'
            );
        });

        it('should warn if entry is not found', async () => {
            vi.mocked(mockDiscoveryLog.all).mockResolvedValue([]);

            await serviceManager.handleReplication('mock-address', 'test-hash');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Entry not found for hash: test-hash'
            );
            expect(
                mockReplicationHandler.handleNewEntry
            ).not.toHaveBeenCalled();
        });

        it('should handle errors during replication', async () => {
            const error = new Error('Replication failed');
            vi.mocked(mockDiscoveryLog.all).mockRejectedValue(error);

            await serviceManager.handleReplication('mock-address', 'test-hash');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error handling replication',
                expect.objectContaining({
                    address: 'mock-address',
                    hash: 'test-hash',
                    error: 'Replication failed',
                })
            );
        });
    });

    describe('addDiscoveryRecord', () => {
        it('should add valid discovery record', async () => {
            vi.mocked(validateDiscoveryRecord).mockReturnValue(true);

            const record = {
                did: 'did:test:123',
                handle: 'test.handle',
                lookupKey: 'lookup-key',
                ipnsKey: 'k2k4r8n9w3t2mock',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                signature: 'mock-signature',
            };

            const hash = await serviceManager.addDiscoveryRecord(record);

            expect(validateDiscoveryRecord).toHaveBeenCalledWith(record);
            expect(mockDiscoveryLog.addOperation).toHaveBeenCalledWith(record);
            expect(hash).toBe('mock-hash');
            expect(mockLogger.info).toHaveBeenCalledWith(
                '➕ Discovery record added',
                expect.objectContaining({ hash: 'mock-hash' })
            );
        });

        it('should reject invalid discovery record', async () => {
            vi.mocked(validateDiscoveryRecord).mockReturnValue(false);

            const invalidRecord = {
                did: 'invalid',
                handle: '',
                lookupKey: '',
                ipnsKey: '',
                createdAt: 0,
                updatedAt: 0,
                signature: '',
            };

            await expect(
                serviceManager.addDiscoveryRecord(invalidRecord)
            ).rejects.toThrow('Invalid discovery record');

            expect(mockDiscoveryLog.addOperation).not.toHaveBeenCalled();
        });

        it('should throw if discovery log is not available', async () => {
            serviceManager['discoveryLog'] = null;

            const record = {
                did: 'did:test:123',
                handle: 'test.handle',
                lookupKey: 'lookup-key',
                ipnsKey: 'k2k4r8n9w3t2mock',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                signature: 'mock-signature',
            };

            await expect(
                serviceManager.addDiscoveryRecord(record)
            ).rejects.toThrow('Discovery log not opened');
        });

        it('should handle errors and log them', async () => {
            vi.mocked(validateDiscoveryRecord).mockReturnValue(true);
            const error = new Error('Add failed');
            vi.mocked(mockDiscoveryLog.addOperation).mockRejectedValue(error);

            const record = {
                did: 'did:test:123',
                handle: 'test.handle',
                lookupKey: 'lookup-key',
                ipnsKey: 'k2k4r8n9w3t2mock',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                signature: 'mock-signature',
            };

            await expect(
                serviceManager.addDiscoveryRecord(record)
            ).rejects.toThrow(error);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to add discovery record',
                expect.objectContaining({ error: 'Add failed' })
            );
        });
    });

    describe('getDiscoveryLogStats', () => {
        it('should return discovery log statistics', async () => {
            const mockEntries = ['entry1', 'entry2', 'entry3'];
            vi.mocked(mockDiscoveryLog.all).mockResolvedValue(mockEntries);

            const stats = await serviceManager.getDiscoveryLogStats();

            expect(stats).toEqual({
                address: 'mock-address',
                entryCount: 3,
                pinnedEntries: 0,
                lastEntry: 'entry3',
                replicationProgress: 100,
                peers: 0,
            });
        });

        it('should return null if discovery log is not available', async () => {
            serviceManager['discoveryLog'] = null;

            const stats = await serviceManager.getDiscoveryLogStats();

            expect(stats).toBeNull();
        });

        it('should handle errors and return null', async () => {
            const error = new Error('Stats failed');
            vi.mocked(mockDiscoveryLog.all).mockRejectedValue(error);

            const stats = await serviceManager.getDiscoveryLogStats();

            expect(stats).toBeNull();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error getting discovery log stats',
                expect.objectContaining({ error: 'Stats failed' })
            );
        });
    });

    describe('getConnectionStatus', () => {
        it('should return connection status', () => {
            const status = serviceManager.getConnectionStatus();

            expect(status).toEqual({
                connected: false,
                peers: 0,
                lastUpdate: 0,
            });
        });

        it('should return updated status after initialization', async () => {
            vi.spyOn(serviceManager, 'start').mockResolvedValue(undefined);
            vi.spyOn(serviceManager, 'getId').mockReturnValue('test-id');
            vi.spyOn(serviceManager, 'getDiscoveryLogStats').mockResolvedValue({
                address: 'mock-address',
                entryCount: 0,
                pinnedEntries: 0,
                replicationProgress: 100,
                peers: 0,
            });

            await serviceManager.onModuleInit();

            const status = serviceManager.getConnectionStatus();
            expect(status.connected).toBe(true);
            expect(status.id).toBe('test-id');
        });
    });

    describe('getHealthStatus', () => {
        it('should report unhealthy when not connected', async () => {
            const health = await serviceManager.getHealthStatus();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toMatchObject({
                connected: false,
            });
        });

        it('should report healthy when connected', async () => {
            vi.spyOn(serviceManager, 'start').mockResolvedValue(undefined);
            vi.spyOn(serviceManager, 'getId').mockReturnValue('test-id');
            vi.spyOn(serviceManager, 'getDiscoveryLogStats')
                .mockResolvedValueOnce({
                    address: 'mock-address',
                    entryCount: 0,
                    pinnedEntries: 0,
                    replicationProgress: 100,
                    peers: 0,
                })
                .mockResolvedValueOnce({
                    address: 'mock-address',
                    entryCount: 5,
                    pinnedEntries: 0,
                    replicationProgress: 100,
                    peers: 2,
                });

            await serviceManager.onModuleInit();

            const health = await serviceManager.getHealthStatus();

            expect(health.status).toBe('healthy');
            expect(health.details).toMatchObject({
                connected: true,
                id: 'test-id',
                discoveryLog: {
                    address: 'mock-address',
                    entryCount: 5,
                },
            });
        });

        it('should handle errors and return unhealthy', async () => {
            vi.spyOn(serviceManager, 'getConnectionStatus').mockImplementation(
                () => {
                    throw new Error('Status error');
                }
            );

            const health = await serviceManager.getHealthStatus();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toMatchObject({
                error: 'Status error',
            });
        });
    });

    describe('setupEventListeners', () => {
        it('should set up event listeners with replication handler', async () => {
            serviceManager['replicationHandlerInstance'] =
                mockReplicationHandler as ReplicationHandler;

            await serviceManager['setupEventListeners']();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '✅ OrbitDB event listeners set up'
            );
        });

        it('should handle update events', async () => {
            const handleReplicationSpy = vi
                .spyOn(serviceManager, 'handleReplication')
                .mockResolvedValue(undefined);

            await serviceManager['setupEventListeners']();

            // Get the event listener that was registered
            const onCalls = vi.mocked(mockDiscoveryLog.events.on).mock.calls;
            const updateListener = onCalls.find(
                (call: unknown[]) => call[0] === 'update'
            )?.[1] as (entry: { hash: string }) => void;

            expect(updateListener).toBeDefined();

            // Simulate an update event
            if (updateListener) {
                await updateListener({ hash: 'test-hash' });

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    '📡 Database updated',
                    { hash: 'test-hash' }
                );
                expect(handleReplicationSpy).toHaveBeenCalledWith(
                    'mock-address',
                    'test-hash'
                );
            }
        });

        it('should not set up listeners if discovery log is not available', async () => {
            serviceManager['discoveryLog'] = null;

            await serviceManager['setupEventListeners']();

            expect(mockDiscoveryLog.events.on).not.toHaveBeenCalled();
        });
    });

    describe('log implementation', () => {
        it('should delegate debug logs to logger service', () => {
            serviceManager['log']('debug', 'test message', { foo: 'bar' });

            expect(mockLogger.debug).toHaveBeenCalledWith('test message', {
                foo: 'bar',
            });
        });

        it('should delegate info logs to logger service', () => {
            serviceManager['log']('info', 'test message');

            expect(mockLogger.info).toHaveBeenCalledWith(
                'test message',
                undefined
            );
        });

        it('should delegate warn logs to logger service', () => {
            serviceManager['log']('warn', 'test message');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'test message',
                undefined
            );
        });

        it('should delegate error logs to logger service', () => {
            serviceManager['log']('error', 'test message', { error: 'failed' });

            expect(mockLogger.error).toHaveBeenCalledWith('test message', {
                error: 'failed',
            });
        });
    });
});
