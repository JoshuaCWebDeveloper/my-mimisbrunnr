/**
 * Protocol configuration used by both packages for interoperability
 */
export const PROTOCOL = {
    VERSION: 1,
    ORBITDB_LOG_NAME: 'xcom-taglist-discovery',
    IPFS_TIMEOUT: 30000, // 30 seconds
    ORBITDB_TIMEOUT: 45000, // 45 seconds
} as const;

/**
 * Validation limits used by both packages
 */
export const VALIDATION_LIMITS = {
    MAX_DISCOVERY_RECORD_SIZE: 1024, // 1KB max per OrbitDB record
    MAX_CONTENT_SIZE: 1048576, // 1MB max for IPFS content
    MAX_RATE_LIMIT_REQUESTS: 100, // Rate limiting default
} as const;

/**
 * Rate limiting configuration interface
 */
export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests?: boolean;
}
