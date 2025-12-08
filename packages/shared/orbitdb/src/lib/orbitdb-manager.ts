import type { Helia } from 'helia';
import {
    createOrbitDB,
    DatabaseEvents,
    type BaseDatabase,
    type OrbitDB,
} from './core.js';

/**
 * Configuration options for OrbitDbManager
 */
export interface OrbitDbManagerConfig {
    /** Name of the discovery log database */
    logName: string;
    /** Directory for OrbitDB data storage (optional) */
    dataDir?: string;
}

/**
 * Base OrbitDB Manager
 *
 * Provides common OrbitDB initialization and management logic
 * that can be shared between the browser extension and perpetual node.
 *
 * Key responsibilities:
 * - Initialize OrbitDB instance with Helia
 * - Open discovery log database with proper configuration
 * - Manage database lifecycle (open/close)
 * - Provide access to OrbitDB and database instances
 *
 * Subclasses should implement:
 * - Event listener setup specific to their environment
 * - Logging specific to their platform
 * - Additional database operations as needed
 */
export abstract class OrbitDbManager {
    protected orbitdb: OrbitDB | null = null;
    protected discoveryLog: BaseDatabase | null = null;
    protected config: OrbitDbManagerConfig;
    protected eventListeners: Map<
        keyof DatabaseEvents,
        (...args: unknown[]) => void
    > = new Map();

    constructor(config: OrbitDbManagerConfig) {
        this.config = config;
    }

    /**
     * Initialize OrbitDB instance with Helia
     *
     * @param helia - Helia IPFS instance with libp2p connection
     *
     * @remarks
     * This method creates the OrbitDB instance using the provided Helia instance.
     * The Helia instance must have an active libp2p connection for pubsub replication.
     */
    private async initialize(helia: Helia): Promise<void> {
        if (!helia) {
            throw new Error('Helia instance is required');
        }

        try {
            this.log('info', 'Initializing OrbitDB...', {
                heliaPeerId: helia.libp2p.peerId.toString(),
            });

            // Create OrbitDB instance with Helia
            const options: { ipfs: Helia; directory?: string } = {
                ipfs: helia,
            };

            if (this.config.dataDir) {
                options.directory = this.config.dataDir;
            }

            this.orbitdb = await createOrbitDB(options);

            this.log('info', 'OrbitDB instance created', {
                id: this.orbitdb.id,
                directory: this.config.dataDir || './orbitdb',
            });
        } catch (error) {
            this.log('error', 'Failed to initialize OrbitDB', { error });
            throw error;
        }

        await this.openDiscoveryLog();
    }

    /**
     * Open or create the discovery log database
     *
     * @remarks
     * Opens an OrbitDB events database (append-only log) with public write access.
     * The access controller allows all peers to write to enable decentralized discovery.
     *
     * Per MM-30 technical spec:
     * - Database type: 'events' (append-only log)
     * - Access control: Public write ('*')
     * - Replication: Automatic via libp2p pubsub
     */
    private async openDiscoveryLog(): Promise<void> {
        if (!this.orbitdb) {
            throw new Error(
                'OrbitDB not initialized. Call initialize() first.'
            );
        }

        try {
            this.log('info', `Opening discovery log: ${this.config.logName}`);

            // Open the discovery log with public write access
            // OrbitDB v3 uses the 'events' type for append-only logs
            this.discoveryLog = await this.orbitdb.open(this.config.logName);

            // Set up event listeners (implemented by subclasses)
            await this.setupEventListeners();

            // Get entry count
            const entries = (await this.discoveryLog.all()) as unknown[];
            this.log('info', 'Discovery log opened', {
                address: this.discoveryLog.address,
                type: this.discoveryLog.type,
                entries: entries.length,
            });
        } catch (error) {
            this.log('error', 'Failed to open discovery log', { error });
            throw error;
        }
    }

    async start(heliaConnection: Promise<Helia>): Promise<void> {
        const helia = await heliaConnection;
        await this.initialize(helia);
    }

    /**
     * Close discovery log and stop OrbitDB instance
     */
    async stop(): Promise<void> {
        try {
            this.log('info', 'Stopping OrbitDB manager...');

            // Clean up event listeners
            await this.cleanupEventListeners();

            // Close discovery log
            if (this.discoveryLog) {
                await this.discoveryLog.close();
                this.log('debug', 'Discovery log closed');
                this.discoveryLog = null;
            }

            // Stop OrbitDB instance
            if (this.orbitdb) {
                await this.orbitdb.stop();
                this.log('debug', 'OrbitDB stopped');
                this.orbitdb = null;
            }

            this.log('info', 'OrbitDB manager stopped successfully');
        } catch (error) {
            this.log('error', 'Error stopping OrbitDB manager', { error });
            throw error;
        }
    }

    /**
     * Check if OrbitDB is initialized and discovery log is open
     */
    isInitialized(): boolean {
        return this.orbitdb !== null && this.discoveryLog !== null;
    }

    /**
     * Get OrbitDB instance ID
     */
    getId(): string | null {
        return this.orbitdb?.id ?? null;
    }

    /**
     * Get discovery log address
     */
    getAddress(): string | null {
        return this.discoveryLog?.address ?? null;
    }

    /**
     * Get the discovery log database instance
     */
    getDatabase(): BaseDatabase | null {
        return this.discoveryLog;
    }

    /**
     * Get OrbitDB instance (for advanced use cases)
     */
    getOrbitDB(): OrbitDB | null {
        return this.orbitdb;
    }

    protected addEventListener(
        event: keyof DatabaseEvents,
        listener: (...args: unknown[]) => void
    ): void {
        this.discoveryLog?.events.on(event, listener);
        this.eventListeners.set(event, listener);
    }

    protected removeEventListener(
        event: keyof DatabaseEvents,
        listener: (...args: unknown[]) => void
    ): void {
        this.discoveryLog?.events.off(event, listener);
        this.eventListeners.delete(event);
    }

    /**
     * Setup event listeners for OrbitDB events
     *
     * Subclasses should implement this to handle database events
     * specific to their environment (e.g., 'update', 'join', 'leave')
     */
    protected abstract setupEventListeners(): Promise<void>;

    /**
     * Cleanup event listeners
     */
    protected async cleanupEventListeners(): Promise<void> {
        if (!this.discoveryLog) {
            return;
        }

        for (const [event, listener] of this.eventListeners) {
            this.removeEventListener(event, listener);
        }

        this.log('debug', '🧹 OrbitDB event listeners cleaned up');
    }

    /**
     * Logging abstraction
     *
     * Subclasses should implement this to use their platform-specific logger
     * (e.g., loglevel for browser, winston/nestjs for server)
     */
    protected abstract log(
        level: 'debug' | 'info' | 'warn' | 'error',
        message: string,
        context?: Record<string, unknown>
    ): void;
}
