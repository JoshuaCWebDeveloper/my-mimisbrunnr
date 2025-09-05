// Basic rate limiter for DoS protection using shared validation utilities
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitTracker } from '@my-mimisbrunnr/validation';
import type { RateLimitConfig } from '@my-mimisbrunnr/config';
import { Logger } from '../logger/logger.js';
import { AppConfiguration } from '../config/configuration.js';
import {
    HealthService,
    HealthProvider,
    HealthStatus,
} from '../health/health.service.js';

interface RequestTracking {
    count: number;
    firstRequest: number;
    lastRequest: number;
}

interface DailyTracking {
    count: number;
    date: string;
}

@Injectable()
export class BasicRateLimiter implements OnModuleDestroy, HealthProvider {
    private rateLimitTracker: RateLimitTracker;
    private requestTracking = new Map<string, RequestTracking>();
    private dailyTracking = new Map<string, DailyTracking>();
    private cleanupInterval?: NodeJS.Timeout;

    private get config(): AppConfiguration {
        return this.configService.get('app') as AppConfiguration;
    }

    constructor(
        private readonly healthService: HealthService,
        private readonly logger: Logger,
        private readonly configService: ConfigService
    ) {
        this.rateLimitTracker = new RateLimitTracker();

        // Start cleanup interval
        this.startCleanupInterval();

        // Register with health service
        this.healthService.registerService('rate-limiter', this);

        this.logger.info('✅ Basic rate limiter created', {
            apiRpm: this.config.security.apiRpm,
            pinAddMaxPerDay: this.config.security.pinAddMaxPerIpPerDay,
            pinAddBurst: this.config.security.pinAddBurst,
        });
    }

    async onModuleDestroy() {
        this.healthService.unregisterService('rate-limiter');
        await this.shutdown();
    }

    /**
     * Check API rate limit (requests per minute)
     */
    async checkApiLimit(
        clientIP: string
    ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const rateLimitConfig: RateLimitConfig = {
            windowMs: 60 * 1000, // 1 minute
            maxRequests: this.config.security.apiRpm,
        };

        try {
            const isAllowed = this.rateLimitTracker.checkRateLimit(
                clientIP,
                rateLimitConfig
            );

            if (!isAllowed) {
                this.logger.warn(
                    `⚠️  API rate limit exceeded for IP: ${clientIP}`
                );
            }

            // Calculate remaining requests and reset time
            const tracking = this.requestTracking.get(clientIP);
            const remaining = Math.max(
                0,
                this.config.security.apiRpm - (tracking?.count || 0)
            );
            const resetTime = tracking
                ? tracking.firstRequest + rateLimitConfig.windowMs
                : Date.now() + rateLimitConfig.windowMs;

            return {
                allowed: isAllowed,
                remaining,
                resetTime,
            };
        } catch (error) {
            this.logger.error('Error checking API rate limit', {
                clientIP,
                error: error instanceof Error ? error.message : error,
            });
            // On error, allow the request but log it
            return {
                allowed: true,
                remaining: this.config.security.apiRpm,
                resetTime: Date.now() + rateLimitConfig.windowMs,
            };
        }
    }

    /**
     * Check pin/add specific limits (burst + daily quota)
     */
    async checkPinAddLimit(
        clientIP: string
    ): Promise<{ allowed: boolean; reason?: string }> {
        try {
            // Check burst limit (pins per minute)
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: this.config.security.pinAddBurst,
            };

            const burstAllowed = this.rateLimitTracker.checkRateLimit(
                `${clientIP}:pin`,
                burstConfig
            );

            if (!burstAllowed) {
                this.logger.warn(
                    `⚠️  Pin/add burst limit exceeded for IP: ${clientIP}`
                );
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            // Check daily quota
            const today = new Date().toISOString().split('T')[0];
            const dailyTracking = this.dailyTracking.get(clientIP);

            if (dailyTracking && dailyTracking.date === today) {
                if (
                    dailyTracking.count >=
                    this.config.security.pinAddMaxPerIpPerDay
                ) {
                    this.logger.warn(
                        `⚠️  Daily pin quota exceeded for IP: ${clientIP}`,
                        {
                            count: dailyTracking.count,
                            limit: this.config.security.pinAddMaxPerIpPerDay,
                        }
                    );
                    return { allowed: false, reason: 'daily_quota_exceeded' };
                }
            }

            return { allowed: true };
        } catch (error) {
            this.logger.error('Error checking pin/add rate limit', {
                clientIP,
                error: error instanceof Error ? error.message : error,
            });
            // On error, allow the request but log it
            return { allowed: true };
        }
    }

    /**
     * Check DAG/get limits (burst)
     */
    async checkDagGetLimit(
        clientIP: string
    ): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: this.config.security.dagGetBurst,
            };

            const allowed = this.rateLimitTracker.checkRateLimit(
                `${clientIP}:dag`,
                burstConfig
            );

            if (!allowed) {
                this.logger.warn(
                    `⚠️  DAG/get burst limit exceeded for IP: ${clientIP}`
                );
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            return { allowed: true };
        } catch (error) {
            this.logger.error('Error checking DAG/get rate limit', {
                clientIP,
                error: error instanceof Error ? error.message : error,
            });
            return { allowed: true };
        }
    }

    /**
     * Check pubsub publish limits
     */
    async checkPubsubPubLimit(
        clientIP: string
    ): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: this.config.security.pubsubPubBurst,
            };

            const allowed = this.rateLimitTracker.checkRateLimit(
                `${clientIP}:pubsub:pub`,
                burstConfig
            );

            if (!allowed) {
                this.logger.warn(
                    `⚠️  Pubsub publish burst limit exceeded for IP: ${clientIP}`
                );
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            return { allowed: true };
        } catch (error) {
            this.logger.error('Error checking pubsub publish rate limit', {
                clientIP,
                error: error instanceof Error ? error.message : error,
            });
            return { allowed: true };
        }
    }

    /**
     * Check pubsub subscribe limits
     */
    async checkPubsubSubLimit(
        clientIP: string
    ): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: this.config.security.pubsubSubBurst,
            };

            const allowed = this.rateLimitTracker.checkRateLimit(
                `${clientIP}:pubsub:sub`,
                burstConfig
            );

            if (!allowed) {
                this.logger.warn(
                    `⚠️  Pubsub subscribe burst limit exceeded for IP: ${clientIP}`
                );
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            return { allowed: true };
        } catch (error) {
            this.logger.error('Error checking pubsub subscribe rate limit', {
                clientIP,
                error: error instanceof Error ? error.message : error,
            });
            return { allowed: true };
        }
    }

    /**
     * Track a successful pin/add request for daily quota
     */
    async trackPinAddRequest(clientIP: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];

        const existing = this.dailyTracking.get(clientIP);
        if (existing && existing.date === today) {
            existing.count += 1;
        } else {
            this.dailyTracking.set(clientIP, { count: 1, date: today });
        }

        this.logger.debug(`📊 Pin/add request tracked for ${clientIP}`, {
            dailyCount: this.dailyTracking.get(clientIP)?.count,
        });
    }

    /**
     * Get rate limit statistics
     */
    getRateLimitStats(): {
        totalIPs: number;
        dailyTrackingEntries: number;
        requestTrackingEntries: number;
    } {
        return {
            totalIPs: this.requestTracking.size,
            dailyTrackingEntries: this.dailyTracking.size,
            requestTrackingEntries: this.requestTracking.size,
        };
    }

    /**
     * Start cleanup interval to remove old tracking data
     */
    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldRequests();
        }, this.config.operational.storageCleanupInterval);
    }

    /**
     * Clean up old request tracking data
     */
    async cleanupOldRequests(): Promise<void> {
        const now = Date.now();
        const cutoff = now - 24 * 60 * 60 * 1000; // 24 hours ago
        let cleaned = 0;

        // Clean up old request tracking (older than 24 hours)
        for (const [ip, tracking] of this.requestTracking.entries()) {
            if (tracking.lastRequest < cutoff) {
                this.requestTracking.delete(ip);
                cleaned++;
            }
        }

        // Clean up old daily tracking (older than 2 days)
        const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
        for (const [ip, tracking] of this.dailyTracking.entries()) {
            if (tracking.date < twoDaysAgo) {
                this.dailyTracking.delete(ip);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(
                `🧹 Cleaned up ${cleaned} old rate limit tracking entries`
            );
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.logger.info('🛑 Rate limiter shut down');
    }

    /**
     * Get health status for health service registry
     */
    async getHealthStatus(): Promise<HealthStatus> {
        try {
            const stats = this.getRateLimitStats();

            return {
                status: 'healthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: {
                    ...stats,
                    config: {
                        apiRpm: this.config.security.apiRpm,
                        pinAddMaxPerDay:
                            this.config.security.pinAddMaxPerIpPerDay,
                        pinAddBurst: this.config.security.pinAddBurst,
                        dagGetBurst: this.config.security.dagGetBurst,
                        pubsubPubBurst: this.config.security.pubsubPubBurst,
                        pubsubSubBurst: this.config.security.pubsubSubBurst,
                    },
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: Date.now(),
                uptime: process.uptime() * 1000,
                details: {
                    error: error instanceof Error ? error.message : error,
                },
            };
        }
    }
}
