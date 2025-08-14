import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import { RateLimitConfig, VALIDATION_LIMITS } from '@my-mimisbrunnr/config';

/**
 * OrbitDB record validation used by both packages
 */
export function validateDiscoveryRecord(
    record: unknown
): record is DiscoveryRecord {
    if (!record || typeof record !== 'object') return false;
    const r = record as DiscoveryRecord;

    return (
        typeof r.lookupKey === 'string' &&
        r.lookupKey.match(/^[a-f0-9]{64}$/) !== null &&
        typeof r.handle === 'string' &&
        r.handle.match(/^@[a-zA-Z0-9_]{1,15}$/) !== null &&
        typeof r.ipnsKey === 'string' &&
        typeof r.did === 'string' &&
        r.did.startsWith('did:') &&
        typeof r.createdAt === 'number' &&
        r.createdAt > 0 &&
        typeof r.updatedAt === 'number' &&
        r.updatedAt > 0 &&
        r.updatedAt >= r.createdAt &&
        (r.sig === undefined || typeof r.sig === 'string')
    );
}

/**
 * Rate limiting tracker for request counting
 */
export class RateLimitTracker {
    private trackers = new Map<
        string,
        Array<{ timestamp: number; count: number }>
    >();

    /**
     * Check if a request is within rate limits
     */
    checkRateLimit(identifier: string, config: RateLimitConfig): boolean {
        const now = Date.now();
        const windowStart = now - config.windowMs;

        if (!this.trackers.has(identifier)) {
            this.trackers.set(identifier, []);
        }

        const tracker = this.trackers.get(identifier) || [];

        // Remove expired entries
        const validEntries = tracker.filter(
            entry => entry.timestamp > windowStart
        );

        // Count total requests in window
        const totalRequests = validEntries.reduce(
            (sum, entry) => sum + entry.count,
            0
        );

        if (totalRequests >= config.maxRequests) {
            return false;
        }

        // Add current request
        validEntries.push({ timestamp: now, count: 1 });
        this.trackers.set(identifier, validEntries);

        return true;
    }

    /**
     * Track a request without checking limits
     */
    trackRequest(identifier: string): void {
        const now = Date.now();

        if (!this.trackers.has(identifier)) {
            this.trackers.set(identifier, []);
        }

        const tracker = this.trackers.get(identifier) || [];
        tracker.push({ timestamp: now, count: 1 });
        this.trackers.set(identifier, tracker);
    }

    /**
     * Clean up old rate limiting data
     */
    cleanupOldData(maxAge = 3600000): void {
        const cutoff = Date.now() - maxAge;

        for (const [identifier, tracker] of this.trackers.entries()) {
            const validEntries = tracker.filter(
                entry => entry.timestamp > cutoff
            );
            if (validEntries.length === 0) {
                this.trackers.delete(identifier);
            } else {
                this.trackers.set(identifier, validEntries);
            }
        }
    }

    /**
     * Clear all tracking data
     */
    clear(): void {
        this.trackers.clear();
    }
}

/**
 * Basic content filtering used by perpetual node
 */
export function detectBinaryContent(content: Uint8Array): boolean {
    // Detect null bytes and high non-printable character ratio
    const nullBytes = content.indexOf(0) !== -1;
    if (nullBytes) return true;

    let nonPrintable = 0;
    const sampleSize = Math.min(content.length, 1024);
    for (let i = 0; i < sampleSize; i++) {
        const byte = content[i];
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintable++;
        }
    }
    return nonPrintable / sampleSize > 0.05;
}

/**
 * Handle validation used by both packages
 */
export function validateHandle(handle: string): boolean {
    return /^@[a-zA-Z0-9_]{1,15}$/.test(handle);
}

/**
 * Content size validation
 */
export function validateContentSize(size: number): boolean {
    return size > 0 && size <= VALIDATION_LIMITS.MAX_CONTENT_SIZE;
}

/**
 * Discovery record size validation
 */
export function validateDiscoveryRecordSize(recordJson: string): boolean {
    if (!recordJson || recordJson.trim().length === 0) {
        return false; // Reject empty records
    }
    const sizeBytes = new TextEncoder().encode(recordJson).length;
    return sizeBytes <= VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE;
}
