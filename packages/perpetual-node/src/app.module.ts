import { Module } from '@nestjs/common';
import { IpfsClient } from './services/ipfs-client.js';
import { OrbitDBManager } from './services/orbitdb-manager.js';
import { ReplicationHandler } from './services/replication-handler.js';
import { BasicRateLimiter } from './services/rate-limiter.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from './logger/logger.module.js';
import { ConfigModule } from './config/config.module.js';

@Module({
    imports: [ConfigModule, LoggerModule, HealthModule],
    providers: [
        IpfsClient,
        OrbitDBManager,
        ReplicationHandler,
        BasicRateLimiter,
    ],
})
export class AppModule {}
