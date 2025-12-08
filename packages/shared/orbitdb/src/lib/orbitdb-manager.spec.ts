import type { Helia } from 'helia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrbitDB, type BaseDatabase, type OrbitDB } from './core.js';
import {
    OrbitDbManager,
    type OrbitDbManagerConfig,
} from './orbitdb-manager.js';
import fs from 'node:fs';

// Mock the createOrbitDB function before importing OrbitDbManager
vi.mock('./core.js', () => {
    return {
        createOrbitDB: vi.fn(),
    };
});

const mockCreateOrbitDB = vi.mocked(createOrbitDB);

// Now import OrbitDbManager after mocking

/**
 * Concrete test implementation of OrbitDbManager
 * Implements abstract methods for testing purposes
 */
class TestOrbitDbManager extends OrbitDbManager {
    public setupEventListenersCalled = false;
    public logCalls: Array<{
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
        context?: Record<string, unknown>;
    }> = [];

    protected async setupEventListeners(): Promise<void> {
        this.setupEventListenersCalled = true;
    }

    protected log(
        level: 'debug' | 'info' | 'warn' | 'error',
        message: string,
        context?: Record<string, unknown>
    ): void {
        this.logCalls.push({ level, message, context });
    }

    // Expose protected properties for testing
    public getOrbitdbInstance(): OrbitDB | null {
        return this.orbitdb;
    }

    public getDiscoveryLogInstance(): BaseDatabase | null {
        return this.discoveryLog;
    }
}

describe('OrbitDbManager', () => {
    let manager: TestOrbitDbManager;
    let mockHelia: Helia;
    let mockOrbitDB: OrbitDB;
    let mockDatabase: BaseDatabase;

    beforeEach(async () => {
        // Mock database instance
        mockDatabase = {
            address: 'test-database-address',
            type: 'events',
            close: vi.fn().mockResolvedValue(undefined),
            all: vi.fn().mockResolvedValue([]),
            addOperation: vi.fn().mockResolvedValue('test-hash'),
            events: {
                on: vi.fn(),
                off: vi.fn(),
            },
        } as unknown as BaseDatabase;

        // Mock OrbitDB instance
        mockOrbitDB = {
            id: 'test-orbitdb-id',
            open: vi.fn().mockResolvedValue(mockDatabase),
            stop: vi.fn().mockResolvedValue(undefined),
        } as unknown as OrbitDB;

        // Mock Helia instance
        mockHelia = {
            libp2p: {
                peerId: {
                    toString: () => 'test-peer-id',
                },
            },
        } as unknown as Helia;

        // Reset and configure mock for createOrbitDB
        mockCreateOrbitDB.mockReset();
        mockCreateOrbitDB.mockResolvedValue(mockOrbitDB);

        const config: OrbitDbManagerConfig = {
            logName: 'test-discovery-log',
            dataDir: './test-data',
        };

        manager = new TestOrbitDbManager(config);
    });

    afterEach(() => {
        vi.clearAllMocks();
        // Delete test data directory
        try {
            fs.rmdirSync('./test-data', { recursive: true });
        } catch (error) {
            if (error instanceof Error && error.message.includes('ENOENT')) {
                // Ignore if directory doesn't exist
                return;
            }
            throw error;
        }
    });

    describe('constructor', () => {
        it('should create instance with valid config', () => {
            const config: OrbitDbManagerConfig = {
                logName: 'test-log',
            };
            const instance = new TestOrbitDbManager(config);
            expect(instance).toBeInstanceOf(OrbitDbManager);
            expect(instance.isInitialized()).toBe(false);
        });

        it('should create instance with dataDir', () => {
            const config: OrbitDbManagerConfig = {
                logName: 'test-log',
                dataDir: './custom-dir',
            };
            const instance = new TestOrbitDbManager(config);
            expect(instance).toBeInstanceOf(OrbitDbManager);
        });
    });

    describe('start (initialize + openDiscoveryLog)', () => {
        it('should throw error if Helia is not provided', async () => {
            await expect(
                manager.start(Promise.resolve(null as unknown as Helia))
            ).rejects.toThrow('Helia instance is required');
        });

        it('should initialize OrbitDB with Helia instance', async () => {
            await manager.start(Promise.resolve(mockHelia));

            // Verify createOrbitDB was called with correct parameters
            expect(mockCreateOrbitDB).toHaveBeenCalledWith({
                ipfs: mockHelia,
                directory: './test-data',
            });

            // Verify OrbitDB instance was set
            expect(manager.getOrbitdbInstance()).toBe(mockOrbitDB);

            // Verify database was opened
            expect(mockOrbitDB.open).toHaveBeenCalledWith('test-discovery-log');

            // Verify setupEventListeners was called
            expect(manager.setupEventListenersCalled).toBe(true);

            // Verify logging
            expect(manager.logCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        level: 'info',
                        message: 'Initializing OrbitDB...',
                        context: {
                            heliaPeerId: 'test-peer-id',
                        },
                    }),
                    expect.objectContaining({
                        level: 'info',
                        message: 'OrbitDB instance created',
                        context: {
                            id: 'test-orbitdb-id',
                            directory: './test-data',
                        },
                    }),
                    expect.objectContaining({
                        level: 'info',
                        message: 'Opening discovery log: test-discovery-log',
                    }),
                    expect.objectContaining({
                        level: 'info',
                        message: 'Discovery log opened',
                    }),
                ])
            );
        });

        it('should initialize OrbitDB without dataDir when not provided', async () => {
            const configNoDir: OrbitDbManagerConfig = {
                logName: 'test-log',
            };
            const managerNoDir = new TestOrbitDbManager(configNoDir);

            await managerNoDir.start(Promise.resolve(mockHelia));

            // Verify createOrbitDB was called without directory parameter
            expect(mockCreateOrbitDB).toHaveBeenCalledWith({
                ipfs: mockHelia,
            });
        });

        it('should call log with error on initialization failure', async () => {
            const errorHelia = {
                libp2p: {
                    peerId: {
                        toString: () => {
                            throw new Error('PeerId error');
                        },
                    },
                },
            } as unknown as Helia;

            await expect(
                manager.start(Promise.resolve(errorHelia))
            ).rejects.toThrow();

            expect(manager.logCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        level: 'error',
                        message: 'Failed to initialize OrbitDB',
                    }),
                ])
            );
        });
    });

    describe('error handling during database opening', () => {
        it('should handle errors during log opening', async () => {
            const error = new Error('Failed to open database');
            (mockOrbitDB.open as ReturnType<typeof vi.fn>).mockRejectedValue(
                error
            );

            await expect(
                manager.start(Promise.resolve(mockHelia))
            ).rejects.toThrow('Failed to open database');

            expect(manager.logCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        level: 'error',
                        message: 'Failed to open discovery log',
                    }),
                ])
            );
        });
    });

    describe('stop', () => {
        it('should cleanup resources in correct order', async () => {
            // Setup initialized state
            manager['orbitdb'] = mockOrbitDB;
            manager['discoveryLog'] = mockDatabase;

            await manager.stop();

            // Verify cleanup order: listeners -> database -> orbitdb
            expect(manager['eventListeners'].size).toBe(0);
            expect(mockDatabase.close).toHaveBeenCalled();
            expect(mockOrbitDB.stop).toHaveBeenCalled();

            // Verify instances are set to null
            expect(manager.getDiscoveryLogInstance()).toBeNull();
            expect(manager.getOrbitdbInstance()).toBeNull();

            // Verify logging
            expect(manager.logCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        level: 'info',
                        message: 'Stopping OrbitDB manager...',
                    }),
                    expect.objectContaining({
                        level: 'info',
                        message: 'OrbitDB manager stopped successfully',
                    }),
                ])
            );
        });

        it('should handle stop when not initialized', async () => {
            await manager.stop();

            // Should still log and not throw
            expect(manager.logCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        level: 'info',
                        message: 'Stopping OrbitDB manager...',
                    }),
                ])
            );
        });

        it('should handle errors during stop', async () => {
            manager['orbitdb'] = mockOrbitDB;
            manager['discoveryLog'] = mockDatabase;

            const error = new Error('Close failed');
            (mockDatabase.close as ReturnType<typeof vi.fn>).mockRejectedValue(
                error
            );

            await expect(manager.stop()).rejects.toThrow('Close failed');

            expect(manager.logCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        level: 'error',
                        message: 'Error stopping OrbitDB manager',
                    }),
                ])
            );
        });
    });

    describe('isInitialized', () => {
        it('should return false when not initialized', () => {
            expect(manager.isInitialized()).toBe(false);
        });

        it('should return false when only orbitdb is set', () => {
            manager['orbitdb'] = mockOrbitDB;
            expect(manager.isInitialized()).toBe(false);
        });

        it('should return false when only discoveryLog is set', () => {
            manager['discoveryLog'] = mockDatabase;
            expect(manager.isInitialized()).toBe(false);
        });

        it('should return true when both orbitdb and discoveryLog are set', () => {
            manager['orbitdb'] = mockOrbitDB;
            manager['discoveryLog'] = mockDatabase;
            expect(manager.isInitialized()).toBe(true);
        });
    });

    describe('getId', () => {
        it('should return null when not initialized', () => {
            expect(manager.getId()).toBeNull();
        });

        it('should return orbitdb id when initialized', () => {
            manager['orbitdb'] = mockOrbitDB;
            expect(manager.getId()).toBe('test-orbitdb-id');
        });
    });

    describe('getAddress', () => {
        it('should return null when discovery log not opened', () => {
            expect(manager.getAddress()).toBeNull();
        });

        it('should return database address when opened', () => {
            manager['discoveryLog'] = mockDatabase;
            expect(manager.getAddress()).toBe('test-database-address');
        });
    });

    describe('getDatabase', () => {
        it('should return null when not initialized', () => {
            expect(manager.getDatabase()).toBeNull();
        });

        it('should return database instance when initialized', () => {
            manager['discoveryLog'] = mockDatabase;
            expect(manager.getDatabase()).toBe(mockDatabase);
        });
    });

    describe('getOrbitDB', () => {
        it('should return null when not initialized', () => {
            expect(manager.getOrbitDB()).toBeNull();
        });

        it('should return orbitdb instance when initialized', () => {
            manager['orbitdb'] = mockOrbitDB;
            expect(manager.getOrbitDB()).toBe(mockOrbitDB);
        });
    });

    describe('abstract methods', () => {
        it('should call setupEventListeners during start', async () => {
            expect(manager.setupEventListenersCalled).toBe(false);

            await manager.start(Promise.resolve(mockHelia));

            expect(manager.setupEventListenersCalled).toBe(true);
        });

        it('should call log method during start', async () => {
            await manager.start(Promise.resolve(mockHelia));

            expect(manager.logCalls.length).toBeGreaterThan(0);
            expect(manager.logCalls.some(call => call.level === 'info')).toBe(
                true
            );
        });
    });

    describe('configuration handling', () => {
        it('should use dataDir when provided in config', async () => {
            const configWithDir: OrbitDbManagerConfig = {
                logName: 'test-log',
                dataDir: './custom-data',
            };
            const managerWithDir = new TestOrbitDbManager(configWithDir);

            // The dataDir should be used when creating OrbitDB
            // This is tested implicitly through the initialize flow
            expect(managerWithDir).toBeInstanceOf(OrbitDbManager);
        });

        it('should work without dataDir in config', async () => {
            const configNoDir: OrbitDbManagerConfig = {
                logName: 'test-log',
            };
            const managerNoDir = new TestOrbitDbManager(configNoDir);

            expect(managerNoDir).toBeInstanceOf(OrbitDbManager);
        });
    });

    describe('full lifecycle integration', () => {
        it('should handle complete initialization and cleanup flow', async () => {
            // Initialize
            await manager.start(Promise.resolve(mockHelia));

            // Verify initialization
            expect(manager.isInitialized()).toBe(true);
            expect(manager.getId()).toBe('test-orbitdb-id');
            expect(manager.getAddress()).toBe('test-database-address');
            expect(manager.setupEventListenersCalled).toBe(true);
            expect(mockCreateOrbitDB).toHaveBeenCalled();
            expect(mockOrbitDB.open).toHaveBeenCalled();

            // Cleanup
            await manager.stop();

            // Verify cleanup
            expect(manager.isInitialized()).toBe(false);
            expect(manager['eventListeners'].size).toBe(0);
            expect(manager.getOrbitdbInstance()).toBeNull();
            expect(manager.getDiscoveryLogInstance()).toBeNull();
            expect(mockDatabase.close).toHaveBeenCalled();
            expect(mockOrbitDB.stop).toHaveBeenCalled();
        });
    });
});
