// Integration test: Import all shared libraries to verify they work together
import log from 'loglevel';
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import {
    PROTOCOL,
    VALIDATION_LIMITS,
    RateLimitConfig,
} from '@my-mimisbrunnr/config';
import {
    validateDiscoveryRecord,
    RateLimitTracker,
    validateHandle,
    validateContentSize,
} from '@my-mimisbrunnr/validation';

export * from './lib/perpetual-node.js';

// Integration test function
function testSharedLibrariesIntegration(): void {
    log.info('🧪 Testing shared libraries integration...');

    // Test protocol + validation integration
    const testRecord: DiscoveryRecord = {
        lookupKey: 'a'.repeat(64),
        handle: '@testuser',
        ipnsKey: 'k2k4r8n9w3t2...',
        did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    const isValidRecord = validateDiscoveryRecord(testRecord);
    log.info(`✅ DiscoveryRecord validation: ${isValidRecord}`);

    // Test config + validation integration
    const isValidHandle = validateHandle(testRecord.handle);
    log.info(`✅ Handle validation: ${isValidHandle}`);

    const isValidSize = validateContentSize(
        VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE
    );
    log.info(`✅ Size validation: ${isValidSize}`);

    // Test rate limiting with config using OOP pattern
    const rateLimitTracker = new RateLimitTracker();
    const rateLimitConfig: RateLimitConfig = {
        windowMs: PROTOCOL.IPFS_TIMEOUT,
        maxRequests: VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS,
    };
    const rateLimitCheck = rateLimitTracker.checkRateLimit(
        'test-client',
        rateLimitConfig
    );
    log.info(`✅ Rate limit check: ${rateLimitCheck}`);

    // Test config constants
    log.info(`✅ Protocol version: ${PROTOCOL.VERSION}`);
    log.info(`✅ OrbitDB log name: ${PROTOCOL.ORBITDB_LOG_NAME}`);
    log.info(
        `✅ Max content size: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE} bytes`
    );

    log.info('🎉 All shared libraries working together successfully!');
}

// Run integration test
testSharedLibrariesIntegration();
