import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config/environment.js';
import { Logger } from '../logger.js';

export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: number;
    uptime: number;
    details?: Record<string, unknown>;
}

export interface HealthProvider {
    getHealthStatus(): Promise<HealthStatus>;
}

export interface ServiceHealthInfo {
    name: string;
    provider: HealthProvider;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
    private startTime: number;
    private healthCheckInterval?: NodeJS.Timeout;
    private services = new Map<string, HealthProvider>();

    constructor(private readonly logger: Logger) {
        this.startTime = Date.now();
        this.startHealthCheckInterval();
    }

    /**
     * Register a service for health monitoring
     */
    registerService(name: string, provider: HealthProvider): void {
        this.services.set(name, provider);
        this.logger.debug(`🏥 Health service registered: ${name}`);
    }

    /**
     * Unregister a service from health monitoring
     */
    unregisterService(name: string): void {
        this.services.delete(name);
        this.logger.debug(`🏥 Health service unregistered: ${name}`);
    }

    /**
     * Get overall service health
     */
    async getOverallHealth(): Promise<HealthStatus> {
        try {
            const serviceStatuses = await Promise.all(
                Array.from(this.services.entries()).map(async ([name, provider]) => {
                    try {
                        const status = await provider.getHealthStatus();
                        return { name, status };
                    } catch (error) {
                        return {
                            name,
                            status: {
                                status: 'unhealthy' as const,
                                timestamp: Date.now(),
                                uptime: Date.now() - this.startTime,
                                details: {
                                    error: error instanceof Error ? error.message : error,
                                },
                            },
                        };
                    }
                })
            );

            const unhealthyServices = serviceStatuses.filter(s => s.status.status === 'unhealthy');
            const degradedServices = serviceStatuses.filter(s => s.status.status === 'degraded');

            let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

            if (unhealthyServices.length > 0) {
                status = 'unhealthy';
            } else if (degradedServices.length > 0) {
                status = 'degraded';
            }

            const servicesMap = serviceStatuses.reduce((acc, { name, status }) => {
                acc[name] = status.status;
                return acc;
            }, {} as Record<string, string>);

            return {
                status,
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                details: {
                    services: servicesMap,
                    unhealthyCount: unhealthyServices.length,
                    degradedCount: degradedServices.length,
                    totalServices: serviceStatuses.length,
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
     * Get health status for a specific service
     */
    async getServiceHealth(serviceName: string): Promise<HealthStatus | null> {
        const provider = this.services.get(serviceName);
        if (!provider) {
            return null;
        }

        try {
            return await provider.getHealthStatus();
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
     * Get list of registered services
     */
    getRegisteredServices(): string[] {
        return Array.from(this.services.keys());
    }

    /**
     * Get comprehensive system and service metrics
     * Provides system info, health status, service registry, memory usage, and configuration
     */
    async getSystemMetrics(): Promise<{
        timestamp: number;
        uptime: number;
        system: {
            version: string;
            nodeVersion: string;
            platform: string;
            arch: string;
        };
        health: HealthStatus;
        services: {
            registered: string[];
            count: number;
        };
        memory: NodeJS.MemoryUsage;
        config: {
            port: number;
            logLevel: string;
            orbitdbLogName: string;
        };
    }> {
        const timestamp = Date.now();
        const uptime = timestamp - this.startTime;
        const overallHealth = await this.getOverallHealth();
        const registeredServices = this.getRegisteredServices();

        return {
            timestamp,
            uptime,
            system: {
                version: process.env.npm_package_version || 'unknown',
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
            },
            health: overallHealth,
            services: {
                registered: registeredServices,
                count: registeredServices.length,
            },
            memory: process.memoryUsage(),
            config: {
                port: config.service.port,
                logLevel: config.service.logLevel,
                orbitdbLogName: config.orbitdb.logName,
            },
        };
    }

    /**
     * @deprecated Use getSystemMetrics() instead for better type safety and structure
     */
    async getServiceMetrics(): Promise<Record<string, unknown>> {
        try {
            const metrics = await this.getSystemMetrics();
            return {
                timestamp: metrics.timestamp,
                uptime: metrics.uptime,
                service: metrics.system,
                healthSummary: metrics.health,
                registeredServices: metrics.services.registered,
                memory: metrics.memory,
                config: metrics.config,
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
                    this.logger.warn(
                        '⚠️  Service health check: UNHEALTHY',
                        health.details
                    );
                } else if (health.status === 'degraded') {
                    this.logger.warn(
                        '🟡 Service health check: DEGRADED',
                        health.details
                    );
                } else {
                    this.logger.debug('✅ Service health check: HEALTHY', {
                        uptime: Math.round(health.uptime / 1000 / 60), // minutes
                        services: health.details?.services,
                    });
                }
            } catch (error) {
                this.logger.error(
                    'Error during periodic health check',
                    {
                        error: error instanceof Error ? error.message : error,
                    }
                );
            }
        }, config.service.healthCheckInterval);
    }

    /**
     * Cleanup resources
     */
    onModuleDestroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.logger.info('🧹 Health check interval cleared');
        }
    }
}