// Bootstrap logic for the Orbitdb Manager service using NestJS DI
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { Logger } from './logger/logger.js';
import { ROOT_LOGGER } from './logger/logger.module.js';

function setupGlobalErrorHandlers(logger: Logger): void {
    let isShuttingDown = false;

    const shutdownHandler = async (signal: string) => {
        if (isShuttingDown) {
            logger.warn('⚠️ Force shutdown requested');
            process.exit(1);
        }

        logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);
        isShuttingDown = true;

        try {
            logger.info('✅ Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('❌ Error during shutdown', error);
            process.exit(1);
        }
    };

    // Handle various shutdown signals
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGQUIT', () => shutdownHandler('SIGQUIT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async error => {
        logger.error('🚨 Uncaught exception', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
        logger.error('🚨 Unhandled promise rejection', {
            reason: reason instanceof Error ? reason.message : reason,
            promise: promise.toString(),
        });
        process.exit(1);
    });
}

export async function bootstrap(): Promise<void> {
    try {
        // Create HTTP application for health endpoints
        const app = await NestFactory.create(AppModule);

        // Get our custom logger and set it as the app logger
        const rootLogger = app.get(ROOT_LOGGER);
        app.useLogger(rootLogger.createChild('Nest'));

        const logger = rootLogger.createChild('Bootstrap');

        // Set up global error handlers
        setupGlobalErrorHandlers(logger);

        // Log startup information
        logger.info('🚀 Starting Orbitdb Manager Service...');
        logger.info('📋 Service Information', {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
        });

        // Get configuration service
        const configService = app.get(ConfigService);
        const appConfig = configService.get('app');

        // Start HTTP server for health endpoints
        await app.listen(appConfig.service.port);
        logger.info(`🌐 HTTP server started on port ${appConfig.service.port}`);

        // NestJS will automatically initialize all services via lifecycle hooks
        logger.info('🎉 Orbitdb Manager Service started successfully');
        logger.info('📡 Ready for OrbitDB replication and IPFS operations');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to bootstrap application:', error);
        process.exit(1);
    }
}
