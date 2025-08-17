// Logging configuration using Winston
import winston from 'winston';
import { config } from '../config/environment.js';

// Log levels: error, warn, info, http, verbose, debug, silly
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
};

// Colors for different log levels
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    verbose: 'grey',
    debug: 'white',
    silly: 'grey',
};

winston.addColors(logColors);

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// Define transports
const transports = [
    new winston.transports.Console(),
];

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
    transports.push(
        new winston.transports.File({
            filename: '/app/logs/error.log',
            level: 'error',
        }) as any,
        new winston.transports.File({
            filename: '/app/logs/combined.log',
        }) as any
    );
}

// Create the logger
const logger = winston.createLogger({
    level: config.service.logLevel,
    levels: logLevels,
    format: logFormat,
    transports,
    exitOnError: false,
});

// Create specialized loggers for different components
export const createComponentLogger = (component: string) => {
    return {
        error: (message: string, meta?: any) => {
            logger.error(`[${component}] ${message}`, meta);
        },
        warn: (message: string, meta?: any) => {
            logger.warn(`[${component}] ${message}`, meta);
        },
        info: (message: string, meta?: any) => {
            logger.info(`[${component}] ${message}`, meta);
        },
        debug: (message: string, meta?: any) => {
            logger.debug(`[${component}] ${message}`, meta);
        },
        verbose: (message: string, meta?: any) => {
            logger.verbose(`[${component}] ${message}`, meta);
        },
    };
};

// Export the main logger
export default logger;

// Component-specific loggers
export const ipfsLogger = createComponentLogger('IPFS');
export const orbitdbLogger = createComponentLogger('OrbitDB');
export const replicationLogger = createComponentLogger('Replication');
export const rateLimiterLogger = createComponentLogger('RateLimit');
export const healthLogger = createComponentLogger('Health');
export const serviceLogger = createComponentLogger('Service');

// Log startup information
export const logStartup = () => {
    serviceLogger.info('🚀 Perpetual Node Service Starting');
    serviceLogger.info(`📊 Log Level: ${config.service.logLevel}`);
    serviceLogger.info(`🌐 IPFS API: ${config.ipfs.apiUrl}`);
    serviceLogger.info(`🗄️  OrbitDB Log: ${config.orbitdb.logName}`);
    serviceLogger.info(`🚪 Port: ${config.service.port}`);
    serviceLogger.info(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
};

// Log shutdown information
export const logShutdown = () => {
    serviceLogger.info('🛑 Perpetual Node Service Shutting Down');
};