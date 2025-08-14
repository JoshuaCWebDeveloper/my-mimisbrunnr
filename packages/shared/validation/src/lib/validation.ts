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
const rateLimitTrackers = new Map<
    string,
    Array<{ timestamp: number; count: number }>
>();

/**
 * Rate limiting used by perpetual node
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): boolean {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    if (!rateLimitTrackers.has(identifier)) {
        rateLimitTrackers.set(identifier, []);
    }

    const tracker = rateLimitTrackers.get(identifier) || [];

    // Remove expired entries
    const validEntries = tracker.filter(entry => entry.timestamp > windowStart);

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
    rateLimitTrackers.set(identifier, validEntries);

    return true;
}

/**
 * Track a request for rate limiting
 */
export function trackRequest(identifier: string): void {
    const now = Date.now();

    if (!rateLimitTrackers.has(identifier)) {
        rateLimitTrackers.set(identifier, []);
    }

    const tracker = rateLimitTrackers.get(identifier) || [];
    tracker.push({ timestamp: now, count: 1 });
    rateLimitTrackers.set(identifier, tracker);
}

/**
 * Clean up old rate limiting data
 */
export function cleanupRateLimitData(maxAge = 3600000): void {
    const cutoff = Date.now() - maxAge;

    for (const [identifier, tracker] of rateLimitTrackers.entries()) {
        const validEntries = tracker.filter(entry => entry.timestamp > cutoff);
        if (validEntries.length === 0) {
            rateLimitTrackers.delete(identifier);
        } else {
            rateLimitTrackers.set(identifier, validEntries);
        }
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
    const sizeBytes = new TextEncoder().encode(recordJson).length;
    return sizeBytes <= VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE;
}
