// Basic rate limiter for DoS protection using shared validation utilities
import { RateLimitTracker } from '@my-mimisbrunnr/validation';
import type { RateLimitConfig } from '@my-mimisbrunnr/config';
import { config } from '../config/environment.js';
import { rateLimiterLogger } from '../utils/logging.js';

interface RequestTracking {
    count: number;
    firstRequest: number;
    lastRequest: number;
}

interface DailyTracking {
    count: number;
    date: string;
}

export class BasicRateLimiter {
    private rateLimitTracker: RateLimitTracker;
    private requestTracking = new Map<string, RequestTracking>();
    private dailyTracking = new Map<string, DailyTracking>();
    private cleanupInterval?: NodeJS.Timeout;

    constructor() {
        this.rateLimitTracker = new RateLimitTracker();
        
        // Start cleanup interval
        this.startCleanupInterval();
        
        rateLimiterLogger.info('✅ Basic rate limiter initialized', {
            apiRpm: config.security.apiRpm,
            pinAddMaxPerDay: config.security.pinAddMaxPerIpPerDay,
            pinAddBurst: config.security.pinAddBurst
        });
    }

    /**
     * Check API rate limit (requests per minute)
     */
    async checkAPILimit(clientIP: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const rateLimitConfig: RateLimitConfig = {
            windowMs: 60 * 1000, // 1 minute
            maxRequests: config.security.apiRpm,
        };

        try {
            const isAllowed = this.rateLimitTracker.checkRateLimit(clientIP, rateLimitConfig);
            
            if (!isAllowed) {
                rateLimiterLogger.warn(`⚠️  API rate limit exceeded for IP: ${clientIP}`);
            }

            // Calculate remaining requests and reset time
            const tracking = this.requestTracking.get(clientIP);
            const remaining = Math.max(0, config.security.apiRpm - (tracking?.count || 0));
            const resetTime = tracking ? tracking.firstRequest + rateLimitConfig.windowMs : Date.now() + rateLimitConfig.windowMs;

            return {
                allowed: isAllowed,
                remaining,
                resetTime,
            };

        } catch (error) {
            rateLimiterLogger.error('Error checking API rate limit', { 
                clientIP, 
                error: error instanceof Error ? error.message : error 
            });
            // On error, allow the request but log it
            return {
                allowed: true,
                remaining: config.security.apiRpm,
                resetTime: Date.now() + rateLimitConfig.windowMs,
            };
        }
    }

    /**
     * Check pin/add specific limits (burst + daily quota)
     */
    async checkPinAddLimit(clientIP: string): Promise<{ allowed: boolean; reason?: string }> {
        try {
            // Check burst limit (pins per minute)
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: config.security.pinAddBurst,
            };

            const burstAllowed = this.rateLimitTracker.checkRateLimit(`${clientIP}:pin`, burstConfig);
            
            if (!burstAllowed) {
                rateLimiterLogger.warn(`⚠️  Pin/add burst limit exceeded for IP: ${clientIP}`);
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            // Check daily quota
            const today = new Date().toISOString().split('T')[0];
            const dailyTracking = this.dailyTracking.get(clientIP);
            
            if (dailyTracking && dailyTracking.date === today) {
                if (dailyTracking.count >= config.security.pinAddMaxPerIpPerDay) {
                    rateLimiterLogger.warn(`⚠️  Daily pin quota exceeded for IP: ${clientIP}`, { 
                        count: dailyTracking.count, 
                        limit: config.security.pinAddMaxPerIpPerDay 
                    });
                    return { allowed: false, reason: 'daily_quota_exceeded' };
                }
            }

            return { allowed: true };

        } catch (error) {
            rateLimiterLogger.error('Error checking pin/add rate limit', { 
                clientIP, 
                error: error instanceof Error ? error.message : error 
            });
            // On error, allow the request but log it
            return { allowed: true };
        }
    }

    /**
     * Check DAG/get limits (burst)
     */
    async checkDAGGetLimit(clientIP: string): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: config.security.dagGetBurst,
            };

            const allowed = this.rateLimitTracker.checkRateLimit(`${clientIP}:dag`, burstConfig);
            
            if (!allowed) {
                rateLimiterLogger.warn(`⚠️  DAG/get burst limit exceeded for IP: ${clientIP}`);
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            return { allowed: true };

        } catch (error) {
            rateLimiterLogger.error('Error checking DAG/get rate limit', { 
                clientIP, 
                error: error instanceof Error ? error.message : error 
            });
            return { allowed: true };
        }
    }

    /**
     * Check pubsub publish limits
     */
    async checkPubsubPubLimit(clientIP: string): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: config.security.pubsubPubBurst,
            };

            const allowed = this.rateLimitTracker.checkRateLimit(`${clientIP}:pubsub:pub`, burstConfig);
            
            if (!allowed) {
                rateLimiterLogger.warn(`⚠️  Pubsub publish burst limit exceeded for IP: ${clientIP}`);
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            return { allowed: true };

        } catch (error) {
            rateLimiterLogger.error('Error checking pubsub publish rate limit', { 
                clientIP, 
                error: error instanceof Error ? error.message : error 
            });
            return { allowed: true };
        }
    }

    /**
     * Check pubsub subscribe limits
     */
    async checkPubsubSubLimit(clientIP: string): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const burstConfig: RateLimitConfig = {
                windowMs: 60 * 1000, // 1 minute
                maxRequests: config.security.pubsubSubBurst,
            };

            const allowed = this.rateLimitTracker.checkRateLimit(`${clientIP}:pubsub:sub`, burstConfig);
            
            if (!allowed) {
                rateLimiterLogger.warn(`⚠️  Pubsub subscribe burst limit exceeded for IP: ${clientIP}`);
                return { allowed: false, reason: 'burst_limit_exceeded' };
            }

            return { allowed: true };

        } catch (error) {
            rateLimiterLogger.error('Error checking pubsub subscribe rate limit', { 
                clientIP, 
                error: error instanceof Error ? error.message : error 
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

        rateLimiterLogger.debug(`📊 Pin/add request tracked for ${clientIP}`, { 
            dailyCount: this.dailyTracking.get(clientIP)?.count 
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
        }, config.operational.storageCleanupInterval);
    }

    /**
     * Clean up old request tracking data
     */
    async cleanupOldRequests(): Promise<void> {
        const now = Date.now();
        const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours ago
        let cleaned = 0;

        // Clean up old request tracking (older than 24 hours)
        for (const [ip, tracking] of this.requestTracking.entries()) {
            if (tracking.lastRequest < cutoff) {
                this.requestTracking.delete(ip);
                cleaned++;
            }
        }

        // Clean up old daily tracking (older than 2 days)
        const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        for (const [ip, tracking] of this.dailyTracking.entries()) {
            if (tracking.date < twoDaysAgo) {
                this.dailyTracking.delete(ip);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            rateLimiterLogger.debug(`🧹 Cleaned up ${cleaned} old rate limit tracking entries`);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        rateLimiterLogger.info('🛑 Rate limiter shut down');
    }
}