import { Controller, Get } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service.js';

@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get()
    async getOverallHealth(): Promise<HealthStatus> {
        return this.healthService.getOverallHealth();
    }

    @Get('ipfs')
    async getIpfsHealth(): Promise<HealthStatus> {
        const health = await this.healthService.getServiceHealth('ipfs');
        if (!health) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: { error: 'Service not registered' },
            };
        }
        return health;
    }

    @Get('orbitdb')
    async getOrbitDBHealth(): Promise<HealthStatus> {
        const health = await this.healthService.getServiceHealth('orbitdb');
        if (!health) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: { error: 'Service not registered' },
            };
        }
        return health;
    }

    @Get('replication')
    async getReplicationHealth(): Promise<HealthStatus> {
        const health = await this.healthService.getServiceHealth('replication');
        if (!health) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: { error: 'Service not registered' },
            };
        }
        return health;
    }

    @Get('rate-limiter')
    async getRateLimitHealth(): Promise<HealthStatus> {
        const health = await this.healthService.getServiceHealth(
            'rate-limiter'
        );
        if (!health) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: { error: 'Service not registered' },
            };
        }
        return health;
    }

    @Get('services')
    async getRegisteredServices(): Promise<{ services: string[] }> {
        return {
            services: this.healthService.getRegisteredServices(),
        };
    }

    @Get('system')
    async getSystemMetrics() {
        return this.healthService.getSystemMetrics();
    }

    @Get('metrics')
    async getServiceMetrics(): Promise<Record<string, unknown>> {
        return this.healthService.getServiceMetrics();
    }
}
