// Perpetual Node Service - Main service orchestration class
import { logStartup, logShutdown, serviceLogger } from '../utils/logging.js';
import { IpfsNode } from './ipfs-client.js';
import { OrbitDBManager } from './orbitdb-manager.js';
import { ReplicationHandler } from './replication-handler.js';
import { BasicRateLimiter } from './rate-limiter.js';
import { HealthCheckSystem } from '../utils/health-check.js';

export class PerpetualNodeService {
    private ipfsClient?: IpfsNode;
    private orbitdbManager?: OrbitDBManager;
    private replicationHandler?: ReplicationHandler;
    private rateLimiter?: BasicRateLimiter;
    private healthCheckSystem?: HealthCheckSystem;
    private isShuttingDown = false;

    /**
     * Initialize and start the perpetual node service
     */
    async start(): Promise<void> {
        try {
            logStartup();

            // Initialize services in dependency order
            await this.initializeIPFS();
            await this.initializeOrbitDB();
            await this.initializeReplicationHandler();
            await this.initializeRateLimiter();
            await this.initializeHealthChecks();

            // Set up graceful shutdown handlers
            this.setupGracefulShutdown();

            serviceLogger.info(
                '🎉 Perpetual Node Service started successfully'
            );
            serviceLogger.info(
                '📡 Ready for OrbitDB replication and IPFS operations'
            );
        } catch (error) {
            serviceLogger.error('❌ Failed to start Perpetual Node Service', {
                error: error instanceof Error ? error.message : error,
            });
            await this.shutdown();
            process.exit(1);
        }
    }

    /**
     * Initialize IPFS client and verify connection
     */
    private async initializeIPFS(): Promise<void> {
        serviceLogger.info('🔄 Initializing IPFS client...');

        this.ipfsClient = new IpfsNode();
        await this.ipfsClient.initialize();

        const status = this.ipfsClient.getConnectionStatus();
        if (!status.connected) {
            throw new Error('IPFS client failed to connect');
        }

        serviceLogger.info('✅ IPFS client initialized and connected');
    }

    /**
     * Initialize OrbitDB manager and open discovery log
     */
    private async initializeOrbitDB(): Promise<void> {
        if (!this.ipfsClient) {
            throw new Error('IPFS client must be initialized first');
        }

        serviceLogger.info('🔄 Initializing OrbitDB manager...');

        this.orbitdbManager = new OrbitDBManager(this.ipfsClient);
        await this.orbitdbManager.initialize();
        await this.orbitdbManager.openDiscoveryLog();

        const stats = await this.orbitdbManager.getDiscoveryLogStats();
        if (!stats) {
            throw new Error('Discovery log failed to open');
        }

        serviceLogger.info('✅ OrbitDB manager initialized', {
            address: stats.address,
            entries: stats.entryCount,
        });
    }

    /**
     * Initialize replication handler
     */
    private async initializeReplicationHandler(): Promise<void> {
        if (!this.ipfsClient || !this.orbitdbManager) {
            throw new Error(
                'IPFS client and OrbitDB manager must be initialized first'
            );
        }

        serviceLogger.info('🔄 Initializing replication handler...');

        this.replicationHandler = new ReplicationHandler(this.ipfsClient);

        // Connect the replication handler to OrbitDB manager
        this.orbitdbManager.setReplicationHandler(this.replicationHandler);

        serviceLogger.info('✅ Replication handler initialized and connected');
    }

    /**
     * Initialize rate limiter for DoS protection
     */
    private async initializeRateLimiter(): Promise<void> {
        serviceLogger.info('🔄 Initializing rate limiter...');

        this.rateLimiter = new BasicRateLimiter();

        serviceLogger.info('✅ Rate limiter initialized');
    }

    /**
     * Initialize health check system
     */
    private async initializeHealthChecks(): Promise<void> {
        if (
            !this.ipfsClient ||
            !this.orbitdbManager ||
            !this.replicationHandler ||
            !this.rateLimiter
        ) {
            throw new Error(
                'All services must be initialized before health checks'
            );
        }

        serviceLogger.info('🔄 Initializing health check system...');

        this.healthCheckSystem = new HealthCheckSystem();
        this.healthCheckSystem.initialize({
            ipfsClient: this.ipfsClient,
            orbitdbManager: this.orbitdbManager,
            replicationHandler: this.replicationHandler,
            rateLimiter: this.rateLimiter,
        });

        await this.healthCheckSystem.start();

        serviceLogger.info('✅ Health check system initialized and running');
    }

    /**
     * Set up graceful shutdown handlers
     */
    private setupGracefulShutdown(): void {
        const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

        shutdownSignals.forEach(signal => {
            process.on(signal, () => {
                serviceLogger.info(
                    `🛑 Received ${signal}, initiating graceful shutdown...`
                );
                this.shutdown()
                    .then(() => {
                        process.exit(0);
                    })
                    .catch(error => {
                        serviceLogger.error('Error during shutdown', { error });
                        process.exit(1);
                    });
            });
        });

        // Handle uncaught exceptions and rejections
        process.on('uncaughtException', error => {
            serviceLogger.error('💥 Uncaught Exception', {
                error: error.message,
                stack: error.stack,
            });
            this.shutdown().finally(() => process.exit(1));
        });

        process.on('unhandledRejection', (reason, promise) => {
            serviceLogger.error('💥 Unhandled Rejection', {
                reason: reason instanceof Error ? reason.message : reason,
                promise: promise.toString(),
            });
        });
    }

    /**
     * Graceful shutdown of all services
     */
    async shutdown(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        logShutdown();

        const shutdownPromises: Promise<void>[] = [];

        // Shutdown services in reverse dependency order
        if (this.healthCheckSystem) {
            serviceLogger.info('🛑 Shutting down health check system...');
            shutdownPromises.push(this.healthCheckSystem.shutdown());
        }

        if (this.rateLimiter) {
            serviceLogger.info('🛑 Shutting down rate limiter...');
            shutdownPromises.push(this.rateLimiter.shutdown());
        }

        if (this.replicationHandler) {
            serviceLogger.info('🛑 Shutting down replication handler...');
            shutdownPromises.push(this.replicationHandler.shutdown());
        }

        if (this.orbitdbManager) {
            serviceLogger.info('🛑 Shutting down OrbitDB manager...');
            shutdownPromises.push(this.orbitdbManager.shutdown());
        }

        if (this.ipfsClient) {
            serviceLogger.info('🛑 Shutting down IPFS client...');
            shutdownPromises.push(this.ipfsClient.shutdown());
        }

        try {
            await Promise.all(shutdownPromises);
            serviceLogger.info('✅ All services shut down successfully');
        } catch (error) {
            serviceLogger.error('❌ Error during service shutdown', {
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    /**
     * Get service status (for external monitoring)
     */
    getServiceStatus(): {
        running: boolean;
        uptime: number;
        services: {
            ipfs: boolean;
            orbitdb: boolean;
            replication: boolean;
            rateLimiter: boolean;
            healthCheck: boolean;
        };
    } {
        return {
            running: !this.isShuttingDown,
            uptime: process.uptime(),
            services: {
                ipfs:
                    !!this.ipfsClient &&
                    this.ipfsClient.getConnectionStatus().connected,
                orbitdb:
                    !!this.orbitdbManager &&
                    this.orbitdbManager.getConnectionStatus().connected,
                replication: !!this.replicationHandler,
                rateLimiter: !!this.rateLimiter,
                healthCheck: !!this.healthCheckSystem,
            },
        };
    }
}
