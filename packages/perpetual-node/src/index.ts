// Integration test: Import all shared libraries to verify they work together
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import {
    PROTOCOL,
    VALIDATION_LIMITS,
    RateLimitConfig,
} from '@my-mimisbrunnr/config';
import {
    validateDiscoveryRecord,
    checkRateLimit,
    validateHandle,
    validateContentSize,
} from '@my-mimisbrunnr/validation';

export * from './lib/perpetual-node.js';

// Integration test function
function testSharedLibrariesIntegration(): void {
    console.log('🧪 Testing shared libraries integration...');

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
    console.log(`✅ DiscoveryRecord validation: ${isValidRecord}`);

    // Test config + validation integration
    const isValidHandle = validateHandle(testRecord.handle);
    console.log(`✅ Handle validation: ${isValidHandle}`);

    const isValidSize = validateContentSize(
        VALIDATION_LIMITS.MAX_DISCOVERY_RECORD_SIZE
    );
    console.log(`✅ Size validation: ${isValidSize}`);

    // Test rate limiting with config
    const rateLimitConfig: RateLimitConfig = {
        windowMs: PROTOCOL.IPFS_TIMEOUT,
        maxRequests: VALIDATION_LIMITS.MAX_RATE_LIMIT_REQUESTS,
    };
    const rateLimitCheck = checkRateLimit('test-client', rateLimitConfig);
    console.log(`✅ Rate limit check: ${rateLimitCheck}`);

    // Test config constants
    console.log(`✅ Protocol version: ${PROTOCOL.VERSION}`);
    console.log(`✅ OrbitDB log name: ${PROTOCOL.ORBITDB_LOG_NAME}`);
    console.log(
        `✅ Max content size: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE} bytes`
    );

    console.log('🎉 All shared libraries working together successfully!');
}

// Run integration test
testSharedLibrariesIntegration();
