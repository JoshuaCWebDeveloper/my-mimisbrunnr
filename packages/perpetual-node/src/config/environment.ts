// Environment configuration for the perpetual node service
export interface ServiceConfig {
    ipfs: {
        apiUrl: string;
        gatewayUrl?: string;
    };
    orbitdb: {
        logName: string;
        dataDir: string;
    };
    service: {
        port: number;
        logLevel: string;
        healthCheckInterval: number;
    };
    security: {
        apiRpm: number;
        pinAddMaxPerIpPerDay: number;
        pinAddBurst: number;
        dagGetBurst: number;
        pubsubPubBurst: number;
        pubsubSubBurst: number;
    };
    operational: {
        storageCleanupInterval: number;
        maxLogEntriesPinned: number;
        ipnsRepublishPeriod: number;
    };
    extension?: {
        id?: string;
    };
}

export const config: ServiceConfig = {
    ipfs: {
        apiUrl: process.env.IPFS_API_URL || 'http://kubo:5001',
        gatewayUrl: process.env.IPFS_GATEWAY_URL || undefined, // Gateway disabled for security
    },
    orbitdb: {
        logName: process.env.ORBITDB_LOG_NAME || 'xcom-taglist-discovery',
        dataDir: process.env.ORBITDB_DATA_DIR || '/app/data/orbitdb',
    },
    service: {
        port: parseInt(process.env.PORT || '3000'),
        logLevel: process.env.LOG_LEVEL || 'info',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
    },
    security: {
        apiRpm: parseInt(process.env.API_RPM || '60'),
        pinAddMaxPerIpPerDay: parseInt(process.env.PIN_ADD_MAX_PER_IP_PER_DAY || '2000'),
        pinAddBurst: parseInt(process.env.PIN_ADD_BURST || '30'),
        dagGetBurst: parseInt(process.env.DAG_GET_BURST || '60'),
        pubsubPubBurst: parseInt(process.env.PUBSUB_PUB_BURST || '60'),
        pubsubSubBurst: parseInt(process.env.PUBSUB_SUB_BURST || '60'),
    },
    operational: {
        storageCleanupInterval: parseInt(process.env.STORAGE_CLEANUP_INTERVAL || '3600000'), // 1 hour
        maxLogEntriesPinned: parseInt(process.env.MAX_LOG_ENTRIES_PINNED || '1000'),
        ipnsRepublishPeriod: parseInt(process.env.IPNS_REPUBLISH_PERIOD || '14400'), // 4 hours
    },
    extension: {
        id: process.env.EXT_ID || undefined,
    },
};

// Validation function to ensure required config is present
export function validateConfig(cfg: ServiceConfig): void {
    if (!cfg.ipfs.apiUrl) {
        throw new Error('IPFS_API_URL is required');
    }

    if (!cfg.orbitdb.logName) {
        throw new Error('ORBITDB_LOG_NAME is required');
    }

    if (!cfg.orbitdb.dataDir) {
        throw new Error('ORBITDB_DATA_DIR is required');
    }

    if (cfg.service.port <= 0 || cfg.service.port > 65535) {
        throw new Error('PORT must be between 1 and 65535');
    }

    // Validate security settings
    if (cfg.security.apiRpm <= 0) {
        throw new Error('API_RPM must be greater than 0');
    }

    if (cfg.security.pinAddMaxPerIpPerDay <= 0) {
        throw new Error('PIN_ADD_MAX_PER_IP_PER_DAY must be greater than 0');
    }
}

// Initialize and validate configuration on import
validateConfig(config);