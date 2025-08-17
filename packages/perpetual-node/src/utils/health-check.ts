// Health check endpoints and monitoring system
import express, { type Express, type Request, type Response } from 'express';
import { config } from '../config/environment.js';
import { healthLogger } from '../utils/logging.js';
import type { IpfsNode } from '../services/ipfs-client.js';
import type { OrbitDBManager } from '../services/orbitdb-manager.js';
import type { ReplicationHandler } from '../services/replication-handler.js';
import type { BasicRateLimiter } from '../services/rate-limiter.js';

interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: number;
    uptime: number;
    details?: any;
}

interface ServiceDependencies {
    ipfsClient: IpfsNode;
    orbitdbManager: OrbitDBManager;
    replicationHandler: ReplicationHandler;
    rateLimiter: BasicRateLimiter;
}

export class HealthCheckSystem {
    private app: Express;
    private server?: any;
    private dependencies?: ServiceDependencies;
    private startTime: number;
    private healthCheckInterval?: NodeJS.Timeout;

    constructor() {
        this.app = express();
        this.startTime = Date.now();
        this.setupRoutes();
    }

    /**
     * Initialize health check system with service dependencies
     */
    initialize(dependencies: ServiceDependencies): void {
        this.dependencies = dependencies;
        healthLogger.info(
            '✅ Health check system initialized with dependencies'
        );
    }

    /**
     * Start the health check HTTP server
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(config.service.port, () => {
                    healthLogger.info(
                        `🏥 Health check server started on port ${config.service.port}`
                    );
                    this.startHealthCheckInterval();
                    resolve();
                });
            } catch (error) {
                healthLogger.error('Failed to start health check server', {
                    error: error instanceof Error ? error.message : error,
                });
                reject(error);
            }
        });
    }

    /**
     * Set up health check routes
     */
    private setupRoutes(): void {
        // Overall service health
        this.app.get('/health', async (req: Request, res: Response) => {
            const health = await this.getOverallHealth();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });

        // IPFS connection status
        this.app.get('/health/ipfs', async (req: Request, res: Response) => {
            const health = await this.getIPFSHealth();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });

        // OrbitDB status
        this.app.get('/health/orbitdb', async (req: Request, res: Response) => {
            const health = await this.getOrbitDBHealth();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });

        // Discovery log statistics
        this.app.get(
            '/health/discovery',
            async (req: Request, res: Response) => {
                const health = await this.getDiscoveryHealth();
                res.status(health.status === 'healthy' ? 200 : 503).json(
                    health
                );
            }
        );

        // Pinning service status
        this.app.get('/health/pins', async (req: Request, res: Response) => {
            const health = await this.getPinningHealth();
            res.status(health.status === 'healthy' ? 200 : 503).json(health);
        });

        // Rate limiter status
        this.app.get(
            '/health/ratelimit',
            async (req: Request, res: Response) => {
                const health = await this.getRateLimitHealth();
                res.status(health.status === 'healthy' ? 200 : 503).json(
                    health
                );
            }
        );

        // Service metrics
        this.app.get('/metrics', async (req: Request, res: Response) => {
            const metrics = await this.getServiceMetrics();
            res.json(metrics);
        });

        healthLogger.debug('✅ Health check routes configured');
    }

    /**
     * Get overall service health
     */
    private async getOverallHealth(): Promise<HealthStatus> {
        if (!this.dependencies) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: { error: 'Service dependencies not initialized' },
            };
        }

        try {
            const [ipfsHealth, orbitdbHealth, discoveryHealth, pinningHealth] =
                await Promise.all([
                    this.getIPFSHealth(),
                    this.getOrbitDBHealth(),
                    this.getDiscoveryHealth(),
                    this.getPinningHealth(),
                ]);

            const unhealthyServices = [
                ipfsHealth,
                orbitdbHealth,
                discoveryHealth,
                pinningHealth,
            ].filter(h => h.status === 'unhealthy');

            const degradedServices = [
                ipfsHealth,
                orbitdbHealth,
                discoveryHealth,
                pinningHealth,
            ].filter(h => h.status === 'degraded');

            let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

            if (unhealthyServices.length > 0) {
                status = 'unhealthy';
            } else if (degradedServices.length > 0) {
                status = 'degraded';
            }

            return {
                status,
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    services: {
                        ipfs: ipfsHealth.status,
                        orbitdb: orbitdbHealth.status,
                        discovery: discoveryHealth.status,
                        pinning: pinningHealth.status,
                    },
                    unhealthyCount: unhealthyServices.length,
                    degradedCount: degradedServices.length,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    error: 'Failed to check service health',
                    message: error instanceof Error ? error.message : error,
                },
            };
        }
    }

    /**
     * Get IPFS connection health
     */
    private async getIPFSHealth(): Promise<HealthStatus> {
        if (!this.dependencies) {
            return { status: 'unhealthy', timestamp: Date.now(), uptime: 0 };
        }

        try {
            const connectionStatus =
                this.dependencies.ipfsClient.getConnectionStatus();

            if (!connectionStatus.connected) {
                return {
                    status: 'unhealthy',
                    timestamp: Date.now(),
                    uptime: Date.now() - this.startTime,
                    details: {
                        connected: false,
                        error: connectionStatus.error,
                        lastCheck: connectionStatus.lastCheck,
                    },
                };
            }

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    connected: true,
                    peerId: connectionStatus.peerId,
                    version: connectionStatus.version,
                    lastCheck: connectionStatus.lastCheck,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }

    /**
     * Get OrbitDB health
     */
    private async getOrbitDBHealth(): Promise<HealthStatus> {
        if (!this.dependencies) {
            return { status: 'unhealthy', timestamp: Date.now(), uptime: 0 };
        }

        try {
            const connectionStatus =
                this.dependencies.orbitdbManager.getConnectionStatus();

            if (!connectionStatus.connected) {
                return {
                    status: 'unhealthy',
                    timestamp: Date.now(),
                    uptime: Date.now() - this.startTime,
                    details: {
                        connected: false,
                        error: connectionStatus.error,
                    },
                };
            }

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    connected: true,
                    id: connectionStatus.id,
                    peers: connectionStatus.peers,
                    lastUpdate: connectionStatus.lastUpdate,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }

    /**
     * Get discovery log health
     */
    private async getDiscoveryHealth(): Promise<HealthStatus> {
        if (!this.dependencies) {
            return { status: 'unhealthy', timestamp: Date.now(), uptime: 0 };
        }

        try {
            const stats =
                await this.dependencies.orbitdbManager.getDiscoveryLogStats();

            if (!stats) {
                return {
                    status: 'unhealthy',
                    timestamp: Date.now(),
                    uptime: Date.now() - this.startTime,
                    details: { error: 'Discovery log not available' },
                };
            }

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: stats,
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }

    /**
     * Get pinning service health
     */
    private async getPinningHealth(): Promise<HealthStatus> {
        if (!this.dependencies) {
            return { status: 'unhealthy', timestamp: Date.now(), uptime: 0 };
        }

        try {
            const stats =
                this.dependencies.replicationHandler.getReplicationStats();

            // Consider the service degraded if rejection rate is high
            const rejectionRate =
                stats.totalProcessed > 0
                    ? stats.totalRejected / stats.totalProcessed
                    : 0;

            const status = rejectionRate > 0.5 ? 'degraded' : 'healthy';

            return {
                status,
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    ...stats,
                    rejectionRate: Math.round(rejectionRate * 100) / 100,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }

    /**
     * Get rate limiter health
     */
    private async getRateLimitHealth(): Promise<HealthStatus> {
        if (!this.dependencies) {
            return { status: 'unhealthy', timestamp: Date.now(), uptime: 0 };
        }

        try {
            const stats = this.dependencies.rateLimiter.getRateLimitStats();

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: stats,
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }

    /**
     * Get comprehensive service metrics
     */
    private async getServiceMetrics(): Promise<any> {
        if (!this.dependencies) {
            return { error: 'Service dependencies not initialized' };
        }

        try {
            const [ipfsHealth, replicationStats, rateLimitStats] =
                await Promise.all([
                    this.getIPFSHealth(),
                    Promise.resolve(
                        this.dependencies.replicationHandler.getReplicationStats()
                    ),
                    Promise.resolve(
                        this.dependencies.rateLimiter.getRateLimitStats()
                    ),
                ]);

            return {
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                service: {
                    version: process.env.npm_package_version || 'unknown',
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch,
                },
                ipfs: ipfsHealth.details,
                replication: replicationStats,
                rateLimit: rateLimitStats,
                memory: process.memoryUsage(),
                config: {
                    port: config.service.port,
                    logLevel: config.service.logLevel,
                    orbitdbLogName: config.orbitdb.logName,
                },
            };
        } catch (error) {
            return {
                error: 'Failed to collect metrics',
                message: error instanceof Error ? error.message : error,
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Start periodic health check logging
     */
    private startHealthCheckInterval(): void {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const health = await this.getOverallHealth();

                if (health.status === 'unhealthy') {
                    healthLogger.warn(
                        '⚠️  Service health check: UNHEALTHY',
                        health.details
                    );
                } else if (health.status === 'degraded') {
                    healthLogger.warn(
                        '🟡 Service health check: DEGRADED',
                        health.details
                    );
                } else {
                    healthLogger.debug('✅ Service health check: HEALTHY', {
                        uptime: Math.round(health.uptime / 1000 / 60), // minutes
                        services: health.details?.services,
                    });
                }
            } catch (error) {
                healthLogger.error('Error during periodic health check', {
                    error: error instanceof Error ? error.message : error,
                });
            }
        }, config.service.healthCheckInterval);
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        if (this.server) {
            return new Promise(resolve => {
                this.server.close(() => {
                    healthLogger.info('🛑 Health check server shut down');
                    resolve();
                });
            });
        }
    }
}
