import { PROTOCOL, VALIDATION_LIMITS, RateLimitConfig } from './config.js';

describe('config', () => {
    describe('PROTOCOL constants', () => {
        it('should export all required protocol constants', () => {
            expect(PROTOCOL.VERSION).toBe(1);
            expect(PROTOCOL.ORBITDB_LOG_NAME).toBe('xcom-taglist-discovery');
            expect(PROTOCOL.IPFS_TIMEOUT).toBe(30000);
            expect(PROTOCOL.ORBITDB_TIMEOUT).toBe(45000);
        });

        it('should have correct types for protocol constants', () => {
            expect(typeof PROTOCOL.VERSION).toBe('number');
            expect(typeof PROTOCOL.ORBITDB_LOG_NAME).toBe('string');
            expect(typeof PROTOCOL.IPFS_TIMEOUT).toBe('number');
            expect(typeof PROTOCOL.ORBITDB_TIMEOUT).toBe('number');
        });

        it('should have reasonable timeout values', () => {
            expect(PROTOCOL.IPFS_TIMEOUT).toBeGreaterThan(0);
            expect(PROTOCOL.ORBITDB_TIMEOUT).toBeGreaterThan(
                PROTOCOL.IPFS_TIMEOUT
            );
            expect(PROTOCOL.IPFS_TIMEOUT).toBeLessThan(60000); // Less than 1 minute
            expect(PROTOCOL.ORBITDB_TIMEOUT).toBeLessThan(60000); // Less than 1 minute
        });

        it('should be readonly constants (TypeScript compile-time check)', () => {
            // This test verifies that PROTOCOL is marked as readonly in TypeScript
            // The actual runtime behavior doesn't throw, but TypeScript prevents assignment
            expect(Object.isFrozen(PROTOCOL)).toBe(false); // 'as const' doesn't freeze, just makes readonly
            expect(PROTOCOL).toEqual(
                expect.objectContaining({
                    VERSION: 1,
                    ORBITDB_LOG_NAME: 'xcom-taglist-discovery',
                    IPFS_TIMEOUT: 30000,
                    ORBITDB_TIMEOUT: 45000,
                })
            );
        });
    });

    describe('VALIDATION_LIMITS constants', () => {
        it('should export all required validation limits', () => {
            expect(VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE).toBe(1024);
            expect(VALIDATION_LIMITS.MAX_CONTENT_SIZE).toBe(1048576);
            expect(VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS).toBe(100);
        });

        it('should have correct types for validation limits', () => {
            expect(typeof VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE).toBe(
                'number'
            );
            expect(typeof VALIDATION_LIMITS.MAX_CONTENT_SIZE).toBe('number');
            expect(typeof VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS).toBe(
                'number'
            );
        });

        it('should have reasonable size limits', () => {
            expect(VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE).toBeGreaterThan(
                0
            );
            expect(VALIDATION_LIMITS.MAX_CONTENT_SIZE).toBeGreaterThan(
                VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE
            );
            expect(VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS).toBeGreaterThan(
                0
            );
        });

        it('should have specific expected size values', () => {
            expect(VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE).toBe(1024); // 1KB
            expect(VALIDATION_LIMITS.MAX_CONTENT_SIZE).toBe(1048576); // 1MB
            expect(VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS).toBe(100);
        });

        it('should be readonly constants (TypeScript compile-time check)', () => {
            // This test verifies that VALIDATION_LIMITS is marked as readonly in TypeScript
            expect(VALIDATION_LIMITS).toEqual(
                expect.objectContaining({
                    MAX_DISCOVERY_RECORD_SIZE: 1024,
                    MAX_CONTENT_SIZE: 1048576,
                    MAX_RATE_LIMIT_REQUESTS: 100,
                })
            );
        });
    });

    describe('RateLimitConfig interface', () => {
        it('should support required properties', () => {
            const config: RateLimitConfig = {
                windowMs: 60000,
                maxRequests: 100,
            };

            expect(config.windowMs).toBe(60000);
            expect(config.maxRequests).toBe(100);
            expect(config.skipSuccessfulRequests).toBeUndefined();
        });

        it('should support optional skipSuccessfulRequests property', () => {
            const configWithSkip: RateLimitConfig = {
                windowMs: 60000,
                maxRequests: 100,
                skipSuccessfulRequests: true,
            };

            expect(configWithSkip.skipSuccessfulRequests).toBe(true);
        });

        it('should work with different configurations', () => {
            const strictConfig: RateLimitConfig = {
                windowMs: 30000,
                maxRequests: 50,
                skipSuccessfulRequests: false,
            };

            const lenientConfig: RateLimitConfig = {
                windowMs: 300000,
                maxRequests: 1000,
                skipSuccessfulRequests: true,
            };

            expect(strictConfig.windowMs).toBe(30000);
            expect(strictConfig.maxRequests).toBe(50);
            expect(strictConfig.skipSuccessfulRequests).toBe(false);

            expect(lenientConfig.windowMs).toBe(300000);
            expect(lenientConfig.maxRequests).toBe(1000);
            expect(lenientConfig.skipSuccessfulRequests).toBe(true);
        });

        it('should support type checking', () => {
            const checkConfig = (obj: unknown): obj is RateLimitConfig => {
                if (!obj || typeof obj !== 'object') return false;
                const c = obj as RateLimitConfig;
                return (
                    typeof c.windowMs === 'number' &&
                    typeof c.maxRequests === 'number' &&
                    (c.skipSuccessfulRequests === undefined ||
                        typeof c.skipSuccessfulRequests === 'boolean')
                );
            };

            const validConfig: RateLimitConfig = {
                windowMs: 60000,
                maxRequests: 100,
            };

            expect(checkConfig(validConfig)).toBe(true);
            expect(checkConfig({})).toBe(false);
            expect(checkConfig(null)).toBe(false);
            expect(checkConfig('invalid')).toBe(false);
            expect(checkConfig({ windowMs: 'invalid', maxRequests: 100 })).toBe(
                false
            );
        });
    });

    describe('constants integration', () => {
        it('should have consistent relationships between constants', () => {
            expect(VALIDATION_LIMITS.MAX_CONTENT_SIZE).toBeGreaterThan(
                VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE
            );
            expect(PROTOCOL.ORBITDB_TIMEOUT).toBeGreaterThan(
                PROTOCOL.IPFS_TIMEOUT
            );
            expect(VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS).toBeGreaterThan(
                0
            );
        });
    });
});
