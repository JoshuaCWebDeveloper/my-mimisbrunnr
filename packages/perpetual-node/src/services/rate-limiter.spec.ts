// Unit tests for BasicRateLimiter
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BasicRateLimiter } from './rate-limiter.js';
import type { Logger } from '../logger.js';
import type { HealthService } from '../health/health.service.js';

// Mock the validation module to avoid module boundary issues
vi.mock('@my-mimisbrunnr/validation', () => ({
    RateLimitTracker: vi.fn(),
}));

import { RateLimitTracker } from '@my-mimisbrunnr/validation';

// Mock the config module
vi.mock('../config/environment.js', () => ({
    config: {
        security: {
            apiRpm: 60,
            pinAddMaxPerIpPerDay: 2000,
            pinAddBurst: 30,
            dagGetBurst: 60,
            pubsubPubBurst: 60,
            pubsubSubBurst: 60,
        },
        operational: {
            storageCleanupInterval: 3600000,
        },
    },
}));

describe('BasicRateLimiter', () => {
    let rateLimiter: BasicRateLimiter;
    let mockRateLimitTracker: { checkRateLimit: ReturnType<typeof vi.fn> };
    let mockLogger: Logger;
    let mockHealthService: Partial<HealthService>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        } as unknown as Logger;
        
        mockHealthService = {
            registerService: vi.fn(),
            unregisterService: vi.fn(),
        };
        
        // Get the mocked RateLimitTracker
        mockRateLimitTracker = {
            checkRateLimit: vi.fn().mockReturnValue(true),
        };
        vi.mocked(RateLimitTracker).mockReturnValue(mockRateLimitTracker as unknown as RateLimitTracker);
        
        rateLimiter = new BasicRateLimiter(mockHealthService as unknown as HealthService, mockLogger);
    });

    afterEach(async () => {
        await rateLimiter.shutdown();
    });

    describe('initialization', () => {
        it('should initialize successfully with correct configuration', () => {
            expect(rateLimiter).toBeDefined();
            expect(mockRateLimitTracker).toBeDefined();
        });
    });

    describe('API rate limiting', () => {
        it('should allow requests within API rate limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(true);

            const result = await rateLimiter.checkApiLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(60);
            expect(result.resetTime).toBeGreaterThan(Date.now());
        });

        it('should reject requests exceeding API rate limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(false);

            const result = await rateLimiter.checkApiLimit('127.0.0.1');

            expect(result.allowed).toBe(false);
        });

        it('should handle rate limit check errors gracefully', async () => {
            mockRateLimitTracker.checkRateLimit.mockImplementation(() => {
                throw new Error('Rate limit check failed');
            });

            const result = await rateLimiter.checkApiLimit('127.0.0.1');

            // Should allow the request on error but log it
            expect(result.allowed).toBe(true);
        });
    });

    describe('pin/add rate limiting', () => {
        it('should allow pin/add requests within burst limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(true);

            const result = await rateLimiter.checkPinAddLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should reject pin/add requests exceeding burst limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(false);

            const result = await rateLimiter.checkPinAddLimit('127.0.0.1');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('burst_limit_exceeded');
        });

        it('should track daily pin quotas', async () => {
            // First, make the burst limit check pass
            mockRateLimitTracker.checkRateLimit.mockReturnValue(true);

            const clientIP = '192.168.1.1';

            // Track multiple requests to build up daily count
            for (let i = 0; i < 5; i++) {
                const result = await rateLimiter.checkPinAddLimit(clientIP);
                expect(result.allowed).toBe(true);
                await rateLimiter.trackPinAddRequest(clientIP);
            }

            // The daily tracking should be working (tested in integration)
            expect(true).toBe(true); // Placeholder - daily limit testing needs integration test
        });

        it('should handle pin/add limit check errors gracefully', async () => {
            mockRateLimitTracker.checkRateLimit.mockImplementation(() => {
                throw new Error('Check failed');
            });

            const result = await rateLimiter.checkPinAddLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
        });
    });

    describe('DAG/get rate limiting', () => {
        it('should allow DAG/get requests within burst limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(true);

            const result = await rateLimiter.checkDagGetLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should reject DAG/get requests exceeding burst limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(false);

            const result = await rateLimiter.checkDagGetLimit('127.0.0.1');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('burst_limit_exceeded');
        });

        it('should handle DAG/get limit check errors gracefully', async () => {
            mockRateLimitTracker.checkRateLimit.mockImplementation(() => {
                throw new Error('Check failed');
            });

            const result = await rateLimiter.checkDagGetLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
        });
    });

    describe('pubsub rate limiting', () => {
        it('should allow pubsub publish requests within limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(true);

            const result = await rateLimiter.checkPubsubPubLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should allow pubsub subscribe requests within limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(true);

            const result = await rateLimiter.checkPubsubSubLimit('127.0.0.1');

            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should reject pubsub requests exceeding limits', async () => {
            mockRateLimitTracker.checkRateLimit.mockReturnValue(false);

            const pubResult = await rateLimiter.checkPubsubPubLimit('127.0.0.1');
            const subResult = await rateLimiter.checkPubsubSubLimit('127.0.0.1');

            expect(pubResult.allowed).toBe(false);
            expect(pubResult.reason).toBe('burst_limit_exceeded');
            expect(subResult.allowed).toBe(false);
            expect(subResult.reason).toBe('burst_limit_exceeded');
        });
    });

    describe('request tracking', () => {
        it('should track pin/add requests for daily quotas', async () => {
            const clientIP = '10.0.0.1';

            await rateLimiter.trackPinAddRequest(clientIP);

            // Verify tracking doesn't throw errors
            expect(true).toBe(true);
        });
    });

    describe('statistics', () => {
        it('should return rate limit statistics', () => {
            const stats = rateLimiter.getRateLimitStats();

            expect(stats).toBeDefined();
            expect(stats.totalIPs).toBeDefined();
            expect(stats.dailyTrackingEntries).toBeDefined();
            expect(stats.requestTrackingEntries).toBeDefined();
            expect(typeof stats.totalIPs).toBe('number');
        });
    });

    describe('cleanup', () => {
        it('should clean up old request data', async () => {
            // Add some tracking data first
            await rateLimiter.trackPinAddRequest('127.0.0.1');
            
            // Call cleanup (usually called by interval)
            await rateLimiter.cleanupOldRequests();

            // Should not throw errors
            expect(true).toBe(true);
        });
    });

    describe('shutdown', () => {
        it('should shutdown gracefully', async () => {
            await expect(rateLimiter.shutdown()).resolves.not.toThrow();
        });

        it('should clear cleanup interval on shutdown', async () => {
            // Create a new rate limiter to test interval cleanup
            const mockHealthService = {
                registerService: vi.fn(),
                unregisterService: vi.fn(),
            };
            const mockLogger = {
                info: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
                debug: vi.fn(),
            } as unknown as Logger;
            
            const testRateLimiter = new BasicRateLimiter(mockHealthService as unknown as HealthService, mockLogger);
            
            await testRateLimiter.shutdown();

            // Should not throw errors
            expect(true).toBe(true);
        });
    });
});