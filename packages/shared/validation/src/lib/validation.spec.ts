import { vi } from 'vitest';
import {
    validateDiscoveryRecord,
    detectBinaryContent,
    validateHandle,
    validateContentSize,
    validateDiscoveryRecordSize,
    RateLimitTracker,
} from './validation.js';
import { DiscoveryRecord } from '@my-mimisbrunnr/protocol';
import { RateLimitConfig } from '@my-mimisbrunnr/config';

describe('validation', () => {
    describe('validateDiscoveryRecord', () => {
        const validRecord: DiscoveryRecord = {
            lookupKey: 'a'.repeat(64),
            handle: '@validhandle',
            ipnsKey: 'k2k4r8n9w3t2...',
            did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            createdAt: 1640995200000,
            updatedAt: 1640995200000,
        };

        it('should validate a correct DiscoveryRecord', () => {
            expect(validateDiscoveryRecord(validRecord)).toBe(true);
        });

        it('should validate a record with optional sig', () => {
            const recordWithSig = { ...validRecord, sig: 'signature123' };
            expect(validateDiscoveryRecord(recordWithSig)).toBe(true);
        });

        it('should reject null or undefined', () => {
            expect(validateDiscoveryRecord(null)).toBe(false);
            expect(validateDiscoveryRecord(undefined)).toBe(false);
        });

        it('should reject non-objects', () => {
            expect(validateDiscoveryRecord('string')).toBe(false);
            expect(validateDiscoveryRecord(123)).toBe(false);
            expect(validateDiscoveryRecord([])).toBe(false);
        });

        it('should reject records with invalid lookupKey', () => {
            expect(
                validateDiscoveryRecord({ ...validRecord, lookupKey: 'short' })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({
                    ...validRecord,
                    lookupKey: 'g'.repeat(64),
                })
            ).toBe(false); // invalid hex
            expect(
                validateDiscoveryRecord({ ...validRecord, lookupKey: 123 })
            ).toBe(false);
        });

        it('should reject records with invalid handle', () => {
            expect(
                validateDiscoveryRecord({ ...validRecord, handle: 'noatsign' })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({ ...validRecord, handle: '@' })
            ).toBe(false); // too short
            expect(
                validateDiscoveryRecord({
                    ...validRecord,
                    handle: '@toolonghandlename123',
                })
            ).toBe(false); // too long
            expect(
                validateDiscoveryRecord({
                    ...validRecord,
                    handle: '@invalid-char',
                })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({ ...validRecord, handle: 123 })
            ).toBe(false);
        });

        it('should reject records with invalid ipnsKey', () => {
            expect(
                validateDiscoveryRecord({ ...validRecord, ipnsKey: 123 })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({ ...validRecord, ipnsKey: null })
            ).toBe(false);
        });

        it('should reject records with invalid did', () => {
            expect(
                validateDiscoveryRecord({ ...validRecord, did: 'notadid' })
            ).toBe(false);
            expect(validateDiscoveryRecord({ ...validRecord, did: 123 })).toBe(
                false
            );
            expect(validateDiscoveryRecord({ ...validRecord, did: null })).toBe(
                false
            );
        });

        it('should reject records with invalid timestamps', () => {
            expect(
                validateDiscoveryRecord({ ...validRecord, createdAt: 0 })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({ ...validRecord, createdAt: -1 })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({
                    ...validRecord,
                    createdAt: 'invalid',
                })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({ ...validRecord, updatedAt: 0 })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({ ...validRecord, updatedAt: -1 })
            ).toBe(false);
            expect(
                validateDiscoveryRecord({
                    ...validRecord,
                    updatedAt: 'invalid',
                })
            ).toBe(false);
        });

        it('should reject records where updatedAt is before createdAt', () => {
            expect(
                validateDiscoveryRecord({
                    ...validRecord,
                    createdAt: 1640995300000,
                    updatedAt: 1640995200000,
                })
            ).toBe(false);
        });

        it('should reject records with invalid sig type', () => {
            expect(validateDiscoveryRecord({ ...validRecord, sig: 123 })).toBe(
                false
            );
            expect(validateDiscoveryRecord({ ...validRecord, sig: null })).toBe(
                false
            );
            expect(validateDiscoveryRecord({ ...validRecord, sig: [] })).toBe(
                false
            );
        });

        it('should work as type guard', () => {
            const unknownRecord: unknown = validRecord;
            if (validateDiscoveryRecord(unknownRecord)) {
                // Should have proper typing now
                expect(typeof unknownRecord.lookupKey).toBe('string');
                expect(typeof unknownRecord.handle).toBe('string');
                expect(typeof unknownRecord.ipnsKey).toBe('string');
                expect(typeof unknownRecord.did).toBe('string');
                expect(typeof unknownRecord.createdAt).toBe('number');
                expect(typeof unknownRecord.updatedAt).toBe('number');
            }
        });
    });

    describe('RateLimitTracker class', () => {
        const config: RateLimitConfig = {
            windowMs: 60000, // 1 minute
            maxRequests: 5,
        };

        let tracker: RateLimitTracker;

        beforeEach(() => {
            tracker = new RateLimitTracker();
        });

        describe('checkRateLimit', () => {
            it('should allow requests within limit', () => {
                expect(tracker.checkRateLimit('user1', config)).toBe(true);
                expect(tracker.checkRateLimit('user1', config)).toBe(true);
                expect(tracker.checkRateLimit('user1', config)).toBe(true);
            });

            it('should reject requests over limit', () => {
                // Fill up the limit
                for (let i = 0; i < 5; i++) {
                    expect(tracker.checkRateLimit('user1', config)).toBe(true);
                }
                // Next request should be rejected
                expect(tracker.checkRateLimit('user1', config)).toBe(false);
            });

            it('should track different identifiers separately', () => {
                // Fill up limit for user1
                for (let i = 0; i < 5; i++) {
                    expect(tracker.checkRateLimit('user1', config)).toBe(true);
                }
                expect(tracker.checkRateLimit('user1', config)).toBe(false);

                // user2 should still be allowed
                expect(tracker.checkRateLimit('user2', config)).toBe(true);
            });

            it('should reset after time window', () => {
                // Use fake timers to control time precisely
                vi.useFakeTimers();

                const shortConfig: RateLimitConfig = {
                    windowMs: 100, // 100ms
                    maxRequests: 2,
                };

                // Fill up the limit
                expect(tracker.checkRateLimit('user1', shortConfig)).toBe(true);
                expect(tracker.checkRateLimit('user1', shortConfig)).toBe(true);
                expect(tracker.checkRateLimit('user1', shortConfig)).toBe(
                    false
                );

                // Advance time beyond the window
                vi.advanceTimersByTime(150);

                // Should now allow requests again
                expect(tracker.checkRateLimit('user1', shortConfig)).toBe(true);

                vi.useRealTimers();
            });
        });

        describe('trackRequest', () => {
            it('should track requests without checking limits', () => {
                tracker.trackRequest('user1');
                tracker.trackRequest('user1');
                tracker.trackRequest('user1');
                expect(
                    tracker.checkRateLimit('user1', {
                        ...config,
                        maxRequests: 2,
                    })
                ).toBe(false);
            });
        });

        describe('cleanupOldData', () => {
            it('should clean up old data', () => {
                tracker.trackRequest('user1');
                tracker.trackRequest('user2');

                // Clean up everything older than 0ms (everything)
                tracker.cleanupOldData(0);

                // Should be able to make full limit of requests again
                for (let i = 0; i < 5; i++) {
                    expect(tracker.checkRateLimit('user1', config)).toBe(true);
                }
            });
        });

        describe('clear', () => {
            it('should clear all tracking data', () => {
                // Add some data
                tracker.trackRequest('user1');
                tracker.trackRequest('user2');

                // Clear all data
                tracker.clear();

                // Should be able to make full limit of requests again
                for (let i = 0; i < 5; i++) {
                    expect(tracker.checkRateLimit('user1', config)).toBe(true);
                }
            });
        });

        describe('isolation', () => {
            it('should maintain separate state per instance', () => {
                const tracker1 = new RateLimitTracker();
                const tracker2 = new RateLimitTracker();

                // Fill up limit in tracker1
                for (let i = 0; i < 5; i++) {
                    expect(tracker1.checkRateLimit('user1', config)).toBe(true);
                }
                expect(tracker1.checkRateLimit('user1', config)).toBe(false);

                // tracker2 should be unaffected
                expect(tracker2.checkRateLimit('user1', config)).toBe(true);
            });
        });
    });

    describe('detectBinaryContent', () => {
        it('should detect null bytes as binary', () => {
            const contentWithNull = new Uint8Array([65, 66, 0, 67]); // ABC with null
            expect(detectBinaryContent(contentWithNull)).toBe(true);
        });

        it('should allow clean text content', () => {
            const textContent = new TextEncoder().encode(
                'Hello, world! This is clean text.'
            );
            expect(detectBinaryContent(textContent)).toBe(false);
        });

        it('should allow text with common whitespace', () => {
            const textWithWhitespace = new TextEncoder().encode(
                'Line 1\nLine 2\tTabbed\r\nCRLF'
            );
            expect(detectBinaryContent(textWithWhitespace)).toBe(false);
        });

        it('should detect high ratio of non-printable characters', () => {
            const binaryContent = new Uint8Array(100);
            for (let i = 0; i < 100; i++) {
                binaryContent[i] = i % 256; // Mix of binary values
            }
            expect(detectBinaryContent(binaryContent)).toBe(true);
        });

        it('should handle empty content', () => {
            const emptyContent = new Uint8Array(0);
            expect(detectBinaryContent(emptyContent)).toBe(false);
        });

        it('should sample large content', () => {
            // Large content but clean in the first 1KB
            const largeCleanContent = new Uint8Array(2048);
            largeCleanContent.fill(65); // Fill with 'A'
            expect(detectBinaryContent(largeCleanContent)).toBe(false);
        });
    });

    describe('validateHandle', () => {
        it('should validate correct handles', () => {
            expect(validateHandle('@user')).toBe(true);
            expect(validateHandle('@user123')).toBe(true);
            expect(validateHandle('@user_name')).toBe(true);
            expect(validateHandle('@User_Name123')).toBe(true);
            expect(validateHandle('@a')).toBe(true);
            expect(validateHandle('@123456789012345')).toBe(true); // 15 chars
        });

        it('should reject invalid handles', () => {
            expect(validateHandle('user')).toBe(false); // no @
            expect(validateHandle('@')).toBe(false); // too short
            expect(validateHandle('@1234567890123456')).toBe(false); // too long (16 chars)
            expect(validateHandle('@user-name')).toBe(false); // hyphen not allowed
            expect(validateHandle('@user name')).toBe(false); // space not allowed
            expect(validateHandle('@user.name')).toBe(false); // dot not allowed
            expect(validateHandle('')).toBe(false); // empty
        });
    });

    describe('validateContentSize', () => {
        it('should validate sizes within limit', () => {
            expect(validateContentSize(1024)).toBe(true);
            expect(validateContentSize(1048576)).toBe(true); // exactly 1MB
            expect(validateContentSize(1)).toBe(true);
        });

        it('should reject sizes over limit', () => {
            expect(validateContentSize(1048577)).toBe(false); // over 1MB
            expect(validateContentSize(2097152)).toBe(false); // 2MB
        });

        it('should reject zero or negative sizes', () => {
            expect(validateContentSize(0)).toBe(false);
            expect(validateContentSize(-1)).toBe(false);
        });
    });

    describe('validateDiscoveryRecordSize', () => {
        it('should validate small records', () => {
            const smallRecord = '{"handle":"@user","key":"value"}';
            expect(validateDiscoveryRecordSize(smallRecord)).toBe(true);
        });

        it('should validate exactly at limit', () => {
            const exactSizeRecord = 'x'.repeat(1024);
            expect(validateDiscoveryRecordSize(exactSizeRecord)).toBe(true);
        });

        it('should reject oversized records', () => {
            const oversizeRecord = 'x'.repeat(1025);
            expect(validateDiscoveryRecordSize(oversizeRecord)).toBe(false);
        });

        it('should handle Unicode characters correctly', () => {
            const unicodeRecord = '{"emoji":"🚀","text":"Hello"}';
            const expectedSize = new TextEncoder().encode(unicodeRecord).length;
            expect(expectedSize).toBeGreaterThan(unicodeRecord.length); // Unicode takes more bytes
            expect(validateDiscoveryRecordSize(unicodeRecord)).toBe(true);
        });

        it('should reject empty records', () => {
            expect(validateDiscoveryRecordSize('')).toBe(false); // Empty records should be rejected
            expect(validateDiscoveryRecordSize('   ')).toBe(false); // Whitespace-only records should be rejected
        });
    });

    describe('integration tests', () => {
        it('should work together for full validation pipeline', () => {
            const record: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@testuser',
                ipnsKey: 'k2k4r8n9w3t2...',
                did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                createdAt: 1640995200000,
                updatedAt: 1640995200000,
            };

            // Validate record structure
            expect(validateDiscoveryRecord(record)).toBe(true);

            // Validate handle specifically
            expect(validateHandle(record.handle)).toBe(true);

            // Validate record size
            const recordJson = JSON.stringify(record);
            expect(validateDiscoveryRecordSize(recordJson)).toBe(true);

            // Check rate limiting with OOP pattern
            const tracker = new RateLimitTracker();
            const rateLimitConfig: RateLimitConfig = {
                windowMs: 60000,
                maxRequests: 10,
            };
            expect(tracker.checkRateLimit('testuser', rateLimitConfig)).toBe(
                true
            );
        });

        it('should work together with OOP pattern', () => {
            const tracker = new RateLimitTracker();

            const record: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@testuser2',
                ipnsKey: 'k2k4r8n9w3t2...',
                did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                createdAt: 1640995200000,
                updatedAt: 1640995200000,
            };

            // Validate record structure
            expect(validateDiscoveryRecord(record)).toBe(true);

            // Validate handle specifically
            expect(validateHandle(record.handle)).toBe(true);

            // Validate record size
            const recordJson = JSON.stringify(record);
            expect(validateDiscoveryRecordSize(recordJson)).toBe(true);

            // Check rate limiting with OOP pattern
            const rateLimitConfig: RateLimitConfig = {
                windowMs: 60000,
                maxRequests: 10,
            };
            expect(tracker.checkRateLimit('testuser2', rateLimitConfig)).toBe(
                true
            );
        });

        it('should properly reject invalid data through full pipeline', () => {
            const invalidRecord = {
                lookupKey: 'invalid',
                handle: 'invalid',
                ipnsKey: 123,
                did: 'invalid',
                createdAt: 'invalid',
                updatedAt: 'invalid',
            };

            expect(validateDiscoveryRecord(invalidRecord)).toBe(false);
            expect(validateHandle('invalid')).toBe(false);
        });
    });
});
