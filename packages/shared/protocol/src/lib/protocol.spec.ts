import { DiscoveryRecord, version } from './protocol.js';

describe('protocol', () => {
    describe('DiscoveryRecord interface', () => {
        it('should have all required properties', () => {
            const validRecord: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@validhandle',
                ipnsKey: 'k2k4r8...',
                did: 'did:key:z6Mk...',
                createdAt: 1640995200000,
                updatedAt: 1640995200000,
            };

            expect(validRecord.lookupKey).toBeDefined();
            expect(validRecord.handle).toBeDefined();
            expect(validRecord.ipnsKey).toBeDefined();
            expect(validRecord.did).toBeDefined();
            expect(validRecord.createdAt).toBeDefined();
            expect(validRecord.updatedAt).toBeDefined();
        });

        it('should allow optional sig property', () => {
            const recordWithSig: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@validhandle',
                ipnsKey: 'k2k4r8...',
                did: 'did:key:z6Mk...',
                createdAt: 1640995200000,
                updatedAt: 1640995200000,
                sig: 'signature123',
            };

            expect(recordWithSig.sig).toBe('signature123');
        });

        it('should allow undefined sig property', () => {
            const recordWithoutSig: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@validhandle',
                ipnsKey: 'k2k4r8...',
                did: 'did:key:z6Mk...',
                createdAt: 1640995200000,
                updatedAt: 1640995200000,
            };

            expect(recordWithoutSig.sig).toBeUndefined();
        });

        it('should support type checking for all properties', () => {
            const record: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@test123',
                ipnsKey: 'k2k4r8n9w3t2...',
                did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                createdAt: 1640995200000,
                updatedAt: 1640995300000,
                sig: 'optional_signature',
            };

            expect(typeof record.lookupKey).toBe('string');
            expect(typeof record.handle).toBe('string');
            expect(typeof record.ipnsKey).toBe('string');
            expect(typeof record.did).toBe('string');
            expect(typeof record.createdAt).toBe('number');
            expect(typeof record.updatedAt).toBe('number');
            expect(typeof record.sig).toBe('string');
        });
    });

    describe('version', () => {
        it('should export the current version', () => {
            expect(version).toBe('1.0.11');
            expect(typeof version).toBe('string');
        });
    });

    describe('type guards', () => {
        it('should properly type-check DiscoveryRecord objects', () => {
            const checkRecord = (obj: unknown): obj is DiscoveryRecord => {
                if (!obj || typeof obj !== 'object') return false;
                const r = obj as DiscoveryRecord;
                return (
                    typeof r.lookupKey === 'string' &&
                    typeof r.handle === 'string' &&
                    typeof r.ipnsKey === 'string' &&
                    typeof r.did === 'string' &&
                    typeof r.createdAt === 'number' &&
                    typeof r.updatedAt === 'number' &&
                    (r.sig === undefined || typeof r.sig === 'string')
                );
            };

            const validRecord: DiscoveryRecord = {
                lookupKey: 'a'.repeat(64),
                handle: '@validhandle',
                ipnsKey: 'k2k4r8...',
                did: 'did:key:z6Mk...',
                createdAt: 1640995200000,
                updatedAt: 1640995200000,
            };

            expect(checkRecord(validRecord)).toBe(true);
            expect(checkRecord({})).toBe(false);
            expect(checkRecord(null)).toBe(false);
            expect(checkRecord('invalid')).toBe(false);
        });
    });
});
