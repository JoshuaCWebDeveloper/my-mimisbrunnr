// Bootstrap logic for the Perpetual Node service using NestJS DI
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ROOT_LOGGER, Logger } from './logger.js';
import { config } from './config/environment.js';

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
        const app = await NestFactory.create(AppModule, {
            logger: false, // Disable NestJS default logger
        });

        // Get our custom logger and set it as the app logger
        const logger = app.get(ROOT_LOGGER);
        app.useLogger(logger);

        // Set up global error handlers
        setupGlobalErrorHandlers(logger);

        // Log startup information
        logger.info('🚀 Starting Perpetual Node Service...');
        logger.info('📋 Service Information', {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
        });

        // Start HTTP server for health endpoints
        await app.listen(config.service.port);
        logger.info(`🌐 HTTP server started on port ${config.service.port}`);

        // NestJS will automatically initialize all services via lifecycle hooks
        logger.info('🎉 Perpetual Node Service started successfully');
        logger.info('📡 Ready for OrbitDB replication and IPFS operations');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to bootstrap application:', error);
        process.exit(1);
    }
}
