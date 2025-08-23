import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrbitDBManager } from './orbitdb-manager.js';
import { Logger } from '../logger.js';
import { createOrbitDB, type OrbitDBInstance, type OrbitDBDatabase } from '@orbitdb/core';
import { validateDiscoveryRecord } from '@my-mimisbrunnr/validation';
import type { IpfsClient } from './ipfs-client.js';
import type { ReplicationHandler } from './replication-handler.js';
import type { HealthService } from '../health/health.service.js';

// Mock external dependencies
vi.mock('@orbitdb/core', () => ({
    createOrbitDB: vi.fn(),
}));

vi.mock('@my-mimisbrunnr/validation', () => ({
    validateDiscoveryRecord: vi.fn(),
}));

describe('OrbitDBManager', () => {
    let orbitdbManager: OrbitDBManager;
    let mockIpfsClient: Partial<IpfsClient>;
    let mockReplicationHandler: Partial<ReplicationHandler>;
    let mockHealthService: Partial<HealthService>;
    let mockLogger: Logger;
    let mockOrbitDB: OrbitDBInstance;
    let mockDiscoveryLog: OrbitDBDatabase;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        } as unknown as Logger;
        
        // Mock IPFS client
        mockIpfsClient = {
            getConnectionStatus: vi.fn().mockReturnValue({ 
                connected: true, 
                lastCheck: Date.now() 
            }),
            getRawClient: vi.fn().mockReturnValue({ id: 'mock-ipfs-client' }),
        };
        
        // Mock replication handler
        mockReplicationHandler = {
            handleNewEntry: vi.fn().mockResolvedValue(undefined),
        };
        
        // Mock health service
        mockHealthService = {
            registerService: vi.fn(),
            unregisterService: vi.fn(),
        };
        
        // Mock OrbitDB database - use partial to allow mock functions
        mockDiscoveryLog = {
            add: vi.fn().mockResolvedValue('mock-hash'),
            events: {
                on: vi.fn(),
                off: vi.fn(),
            },
            address: 'mock-address',
            all: vi.fn().mockResolvedValue([]),
            close: vi.fn().mockResolvedValue(undefined),
        } as unknown as OrbitDBDatabase;
        
        // Mock OrbitDB instance - use partial to allow mock functions
        mockOrbitDB = {
            id: 'mock-orbitdb-id',
            open: vi.fn().mockResolvedValue(mockDiscoveryLog),
            stop: vi.fn().mockResolvedValue(undefined),
        } as unknown as OrbitDBInstance;
        
        orbitdbManager = new OrbitDBManager(
            mockIpfsClient as unknown as IpfsClient,
            mockReplicationHandler as unknown as ReplicationHandler,
            mockHealthService as unknown as HealthService,
            mockLogger
        );
    });

    afterEach(async () => {
        await orbitdbManager.shutdown();
    });

    describe('constructor', () => {
        it('should create OrbitDBManager instance successfully', () => {
            expect(orbitdbManager).toBeInstanceOf(OrbitDBManager);
            expect(mockLogger.info).toHaveBeenCalledWith('OrbitDB Manager created');
        });
    });

    describe('initialization', () => {
        it('should require IPFS client to be connected before initializing', async () => {
            // Mock IPFS client as disconnected
            (mockIpfsClient.getConnectionStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ connected: false });
            
            await expect(orbitdbManager.initialize()).rejects.toThrow(
                'IPFS client must be connected before initializing OrbitDB'
            );
        });

        it('should require IPFS raw client to be available', async () => {
            (mockIpfsClient.getRawClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
            
            await expect(orbitdbManager.initialize()).rejects.toThrow(
                'IPFS client not initialized'
            );
        });

        it('should create OrbitDB instance with IPFS client', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            
            await orbitdbManager.initialize();
            
            expect(createOrbitDB).toHaveBeenCalledWith({ 
                ipfs: { id: 'mock-ipfs-client' } 
            });
            expect(mockLogger.info).toHaveBeenCalledWith('✅ OrbitDB instance created', {
                id: 'mock-orbitdb-id',
                directory: expect.any(String),
            });
        });

        it('should handle initialization errors gracefully', async () => {
            const error = new Error('OrbitDB creation failed');
            vi.mocked(createOrbitDB).mockRejectedValue(error);
            
            await expect(orbitdbManager.initialize()).rejects.toThrow(error);
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize OrbitDB', {
                error: 'OrbitDB creation failed',
            });
        });
    });

    describe('discovery log operations', () => {
        beforeEach(async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            await orbitdbManager.initialize();
        });

        it('should open discovery log with correct name', async () => {
            await orbitdbManager.openDiscoveryLog();
            
            expect(mockOrbitDB.open).toHaveBeenCalledWith(
                expect.any(String) // config.orbitdb.logName
            );
            expect(mockDiscoveryLog.all).toHaveBeenCalled();
        });

        it('should add discovery record to log', async () => {
            vi.mocked(validateDiscoveryRecord).mockReturnValue(true);
            
            await orbitdbManager.openDiscoveryLog();
            
            const mockRecord = {
                did: 'did:test:123',
                handle: 'test.handle',
                lookupKey: 'lookup-key',
                ipnsKey: 'k2k4r8n9w3t2mock',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                signature: 'mock-signature',
            };
            
            const result = await orbitdbManager.addDiscoveryRecord(mockRecord);
            
            expect(validateDiscoveryRecord).toHaveBeenCalledWith(mockRecord);
            expect(mockDiscoveryLog.add).toHaveBeenCalledWith(mockRecord);
            expect(result).toBe('mock-hash');
        });

        it('should validate discovery record before adding', async () => {
            vi.mocked(validateDiscoveryRecord).mockReturnValue(false);
            
            await orbitdbManager.openDiscoveryLog();
            
            const invalidRecord = {
                did: 'invalid',
                handle: '',
                lookupKey: '',
                ipnsKey: '',
                createdAt: 0,
                updatedAt: 0,
                signature: '',
            };
            
            await expect(orbitdbManager.addDiscoveryRecord(invalidRecord))
                .rejects.toThrow('Invalid discovery record');
            expect(mockDiscoveryLog.add).not.toHaveBeenCalled();
        });


        it('should get discovery log statistics', async () => {
            await orbitdbManager.openDiscoveryLog();
            vi.mocked(mockDiscoveryLog.all).mockResolvedValue(['entry1', 'entry2', 'entry3']);
            
            const stats = await orbitdbManager.getDiscoveryLogStats();
            
            expect(stats).toEqual({
                address: 'mock-address',
                entryCount: 3,
                pinnedEntries: 0,
                lastEntry: 'entry3',
                replicationProgress: 100,
                peers: 0,
            });
        });
    });

    describe('replication handler integration', () => {
        beforeEach(async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            await orbitdbManager.initialize();
            await orbitdbManager.openDiscoveryLog();
        });

        it('should set up replication handler with event listeners', () => {
            orbitdbManager.setReplicationHandler(mockReplicationHandler as ReplicationHandler);
            
            expect(mockDiscoveryLog.events.on).toHaveBeenCalledWith(
                'update', expect.any(Function)
            );
        });

        it('should handle new update entries', async () => {
            orbitdbManager.setReplicationHandler(mockReplicationHandler as ReplicationHandler);
            
            // Mock the discovery log all method to return a matching entry
            const mockEntry = {
                hash: 'update-hash',
                payload: { value: { did: 'did:test:456' } },
                identity: { id: 'peer-id' },
            };
            vi.mocked(mockDiscoveryLog.all).mockResolvedValue([mockEntry]);
            
            // Get the update event handler
            const mockOn = vi.mocked(mockDiscoveryLog.events.on);
            const updateHandler = mockOn.mock.calls
                .find((call: unknown[]) => call[0] === 'update')?.[1] as (...args: unknown[]) => void;
            
            expect(updateHandler).toBeDefined();
            
            // Simulate an update entry event
            const updateArgs = { hash: 'update-hash' };
            
            await updateHandler(updateArgs);
            
            expect(mockReplicationHandler.handleNewEntry).toHaveBeenCalledWith(mockEntry);
        });
    });

    describe('health provider implementation', () => {
        it('should report unhealthy when not connected', async () => {
            const health = await orbitdbManager.getHealthStatus();
            
            expect(health.status).toBe('unhealthy');
            expect(health.details).toMatchObject({
                connected: false,
            });
        });

        it('should report healthy when properly initialized', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            
            await orbitdbManager.initialize();
            await orbitdbManager.openDiscoveryLog();
            vi.mocked(mockDiscoveryLog.all).mockResolvedValue(['entry1', 'entry2']);
            
            const health = await orbitdbManager.getHealthStatus();
            
            expect(health.status).toBe('healthy');
            expect(health.details).toMatchObject({
                connected: true,
                id: 'mock-orbitdb-id',
                discoveryLog: {
                    address: 'mock-address',
                    entryCount: 2,
                },
            });
        });
    });

    describe('lifecycle management', () => {
        it('should register with health service on module init', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            
            await orbitdbManager.onModuleInit();
            
            expect(mockHealthService.registerService).toHaveBeenCalledWith('orbitdb', orbitdbManager);
        });

        it('should throw if discovery log fails to open during init', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            
            // Mock the open method to return null, which will cause a null pointer error
            // when trying to call .all() on it in getDiscoveryLogStats()
            const nullLog = null;
            vi.mocked(mockOrbitDB.open).mockResolvedValue(nullLog as never);
            
            await expect(orbitdbManager.onModuleInit()).rejects.toThrow();
        });

        it('should unregister from health service and shutdown on module destroy', async () => {
            await orbitdbManager.onModuleDestroy();
            
            expect(mockHealthService.unregisterService).toHaveBeenCalledWith('orbitdb');
        });

        it('should properly shutdown OrbitDB instance', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            await orbitdbManager.initialize();
            
            await orbitdbManager.shutdown();
            
            expect(mockOrbitDB.stop).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('✅ OrbitDB manager shut down successfully');
        });

        it('should handle shutdown gracefully when OrbitDB not initialized', async () => {
            await orbitdbManager.shutdown();
            
            expect(mockOrbitDB.stop).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('✅ OrbitDB manager shut down successfully');
        });
    });

    describe('error handling', () => {
        it('should handle discovery log opening errors', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            await orbitdbManager.initialize();
            
            const error = new Error('Failed to open log');
            vi.mocked(mockOrbitDB.open).mockRejectedValue(error);
            
            await expect(orbitdbManager.openDiscoveryLog()).rejects.toThrow(error);
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to open discovery log', {
                error: 'Failed to open log',
            });
        });

        it('should handle record addition errors', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            vi.mocked(validateDiscoveryRecord).mockReturnValue(true);
            
            await orbitdbManager.initialize();
            await orbitdbManager.openDiscoveryLog();
            
            const error = new Error('Add failed');
            vi.mocked(mockDiscoveryLog.add).mockRejectedValue(error);
            
            const record = {
                did: 'did:test:123',
                handle: 'test.handle',
                lookupKey: 'lookup-key',
                ipnsKey: 'k2k4r8n9w3t2mock',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                signature: 'mock-signature',
            };
            
            await expect(orbitdbManager.addDiscoveryRecord(record)).rejects.toThrow(error);
        });

        it('should handle shutdown errors gracefully', async () => {
            vi.mocked(createOrbitDB).mockResolvedValue(mockOrbitDB);
            await orbitdbManager.initialize();
            
            const shutdownError = new Error('Shutdown failed');
            vi.mocked(mockOrbitDB.stop).mockRejectedValue(shutdownError);
            
            // Should not throw, but should log the error
            await orbitdbManager.shutdown();
            
            expect(mockLogger.error).toHaveBeenCalledWith('Error during OrbitDB shutdown', {
                error: 'Shutdown failed',
            });
        });
    });
});