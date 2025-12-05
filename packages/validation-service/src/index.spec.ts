import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from './index.js';
import { Server } from 'http';

// Type definitions for validation errors
interface ValidationError {
    instancePath: string;
    schemaPath: string;
    keyword: string;
    params: Record<string, unknown>;
    message: string;
    schema: unknown;
    parentSchema: Record<string, unknown>;
    data: unknown;
}

describe('Validation Service', () => {
    let server: Server;
    const port = 3001; // Use different port for tests

    beforeAll(async () => {
        await new Promise<void>(resolve => {
            server = app.listen(port, () => {
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise<void>(resolve => {
            server.close(() => {
                resolve();
            });
        });
    });

    describe('Health Endpoints', () => {
        it('should return healthy status', async () => {
            const response = await request(app).get('/health').expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                service: 'ajv-validation-sidecar',
                schemas: ['data/write/v1', 'pubsub/head/v1'],
            });
            expect(response.body.timestamp).toBeTypeOf('number');
        });

        it('should return schemas list', async () => {
            const response = await request(app).get('/schemas').expect(200);

            expect(response.body).toHaveProperty('schemas');
            expect(response.body.schemas).toContain('data/write/v1');
            expect(response.body.schemas).toContain('pubsub/head/v1');
            expect(response.body).toHaveProperty('definitions');
        });
    });

    describe('Schema Validation', () => {
        describe('data/write/v1 schema', () => {
            it('should validate correct encrypted taglist data', async () => {
                const validEncryptedTaglist = {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: true,
                    data: 'base64encodedencrypteddata==',
                    nonce: 'base64nonce==',
                    contentSalt: 'base64salt==',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'data/write/v1',
                        json: validEncryptedTaglist,
                    })
                    .expect(200);

                expect(response.body).toMatchObject({
                    valid: true,
                    schema: 'data/write/v1',
                });
                expect(response.body.validationTime).toMatch(/^\d+(\.\d+)?ms$/);
            });

            it('should reject taglist with invalid version', async () => {
                const invalidTaglist = {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 2, // Invalid version
                    encrypted: true,
                    data: 'base64encodedencrypteddata==',
                    nonce: 'base64nonce==',
                    contentSalt: 'base64salt==',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'data/write/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body).toMatchObject({
                    valid: false,
                    schema: 'data/write/v1',
                });
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors[0]).toMatchObject({
                    instancePath: '/version',
                    keyword: 'const',
                    message: 'must be equal to constant',
                });
            });

            it('should reject taglist with missing encrypted flag', async () => {
                const invalidTaglist = {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    // Missing encrypted: true
                    data: 'base64encodedencrypteddata==',
                    nonce: 'base64nonce==',
                    contentSalt: 'base64salt==',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'data/write/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors.length).toBeGreaterThan(0);
            });

            it('should reject taglist with missing data field', async () => {
                const invalidTaglist = {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: true,
                    // Missing data field
                    nonce: 'base64nonce==',
                    contentSalt: 'base64salt==',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'data/write/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors.length).toBeGreaterThan(0);
            });

            it('should reject taglist with missing nonce field', async () => {
                const invalidTaglist = {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: true,
                    data: 'base64encodedencrypteddata==',
                    // Missing nonce field
                    contentSalt: 'base64salt==',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'data/write/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors.length).toBeGreaterThan(0);
            });

            it('should reject taglist with missing contentSalt field', async () => {
                const invalidTaglist = {
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    encrypted: true,
                    data: 'base64encodedencrypteddata==',
                    nonce: 'base64nonce==',
                    // Missing contentSalt field
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'data/write/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors.length).toBeGreaterThan(0);
            });
        });

        describe('pubsub/head/v1 schema', () => {
            it('should validate correct pubsub head data', async () => {
                const validHead = {
                    type: 'head',
                    cid: 'QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o',
                    ts: Date.now(),
                    author: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'pubsub/head/v1',
                        json: validHead,
                    })
                    .expect(200);

                expect(response.body).toMatchObject({
                    valid: true,
                    schema: 'pubsub/head/v1',
                });
            });

            it('should reject pubsub head with invalid CID format', async () => {
                const invalidHead = {
                    type: 'head',
                    cid: 'invalid-cid-format',
                    ts: Date.now(),
                    author: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'pubsub/head/v1',
                        json: invalidHead,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                const cidError = response.body.errors.find(
                    (e: ValidationError) =>
                        e.instancePath === '/cid' && e.keyword === 'pattern'
                );
                expect(cidError).toBeDefined();
            });

            it('should reject pubsub head with invalid DID format', async () => {
                const invalidHead = {
                    type: 'head',
                    cid: 'QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o',
                    ts: Date.now(),
                    author: 'invalid-did-format',
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'pubsub/head/v1',
                        json: invalidHead,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                const authorError = response.body.errors.find(
                    (e: ValidationError) =>
                        e.instancePath === '/author' && e.keyword === 'pattern'
                );
                expect(authorError).toBeDefined();
            });
        });
    });

    describe('Error Handling', () => {
        it('should return 400 for missing schema parameter', async () => {
            const response = await request(app)
                .post('/validate')
                .send({
                    json: { version: 1 },
                })
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
                error: 'Missing required fields: schema and json',
            });
        });

        it('should return 400 for missing json parameter', async () => {
            const response = await request(app)
                .post('/validate')
                .send({
                    schema: 'data/write/v1',
                })
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
                error: 'Missing required fields: schema and json',
            });
        });

        it('should return 400 for unknown schema', async () => {
            const response = await request(app)
                .post('/validate')
                .send({
                    schema: 'unknown/v1',
                    json: { test: 'data' },
                })
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
                error: 'Unknown schema: unknown/v1',
            });
            expect(response.body.availableSchemas).toContain('data/write/v1');
            expect(response.body.availableSchemas).toContain('pubsub/head/v1');
        });

        it('should return 404 for unknown endpoints', async () => {
            const response = await request(app)
                .get('/unknown-endpoint')
                .expect(404);

            expect(response.body).toMatchObject({
                error: 'Not found',
                path: '/unknown-endpoint',
            });
        });

        it('should handle malformed JSON gracefully', async () => {
            const response = await request(app)
                .post('/validate')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(500);

            // Express returns 500 for malformed JSON, which gets handled by our error middleware
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toBe('Internal server error');
        });
    });

    describe('Performance', () => {
        it('should complete validation quickly', async () => {
            const validEncryptedTaglist = {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: 1,
                encrypted: true,
                data: 'base64encodedencrypteddata==',
                nonce: 'base64nonce==',
                contentSalt: 'base64salt==',
            };

            const start = Date.now();
            const response = await request(app)
                .post('/validate')
                .send({
                    schema: 'data/write/v1',
                    json: validEncryptedTaglist,
                })
                .expect(200);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100); // Should complete in under 100ms
            expect(response.body.validationTime).toBeDefined();

            // Parse validation time to ensure it's reasonable
            const validationTimeMs = parseFloat(
                response.body.validationTime.replace('ms', '')
            );
            expect(validationTimeMs).toBeLessThan(10); // AJV should be very fast
        });
    });

    describe('CORS Headers', () => {
        it('should include CORS headers in responses', async () => {
            const response = await request(app).get('/health').expect(200);

            expect(response.headers['access-control-allow-origin']).toBe('*');
            expect(response.headers['access-control-allow-methods']).toBe(
                'GET, POST, OPTIONS'
            );
            expect(response.headers['access-control-allow-headers']).toBe(
                'Content-Type, Authorization'
            );
        });

        it('should handle OPTIONS preflight requests', async () => {
            const response = await request(app)
                .options('/validate')
                .expect(204);

            expect(response.headers['access-control-allow-origin']).toBe('*');
        });
    });

    describe('IPNS Record Validation', () => {
        // Helper to create valid IPNS test data
        async function createValidIpnsRecord() {
            const { generateKeyPairFromSeed } = await import(
                '@libp2p/crypto/keys'
            );
            const { createIPNSRecord, marshalIPNSRecord } = await import(
                'ipns'
            );
            const { peerIdFromPublicKey } = await import('@libp2p/peer-id');
            const { CID } = await import('multiformats/cid');

            // Generate keypair
            const seed = new Uint8Array(32);
            crypto.getRandomValues(seed);
            const privateKey = await generateKeyPairFromSeed('Ed25519', seed);
            const peerId = peerIdFromPublicKey(privateKey.publicKey);

            // Create IPNS record
            const testCid = CID.parse(
                'bafyreihyrpefhacm6kkp4ql6j6udakdit7g3dmkzfriqfykhjw6cad7lrm'
            );
            const ipnsRecord = await createIPNSRecord(
                privateKey,
                testCid,
                0n,
                86400000
            );
            const marshaledRecord = marshalIPNSRecord(ipnsRecord);

            return {
                peerId: peerId.toString(),
                marshaledRecord: Buffer.from(marshaledRecord),
                cid: testCid.toString(),
            };
        }

        it('should validate a correctly signed IPNS record', async () => {
            const { peerId, marshaledRecord, cid } =
                await createValidIpnsRecord();

            const response = await request(app)
                .post(`/validate/ipns/${peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(marshaledRecord)
                .expect(200);

            expect(response.body).toMatchObject({
                valid: true,
                peerId: peerId,
                value: `/ipfs/${cid}`,
            });
            expect(response.body.sequence).toBeDefined();
        });

        it('should reject IPNS record with invalid peer ID format', async () => {
            const { marshaledRecord } = await createValidIpnsRecord();

            const response = await request(app)
                .post('/validate/ipns/invalid-peer-id')
                .set('Content-Type', 'application/octet-stream')
                .send(marshaledRecord)
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
            });
            expect(response.body.error).toContain('Invalid Peer ID format');
        });

        it('should reject IPNS record with missing peer ID', async () => {
            const { marshaledRecord } = await createValidIpnsRecord();

            const response = await request(app)
                .post('/validate/ipns/')
                .set('Content-Type', 'application/octet-stream')
                .send(marshaledRecord)
                .expect(404);

            expect(response.body).toMatchObject({
                error: 'Not found',
            });
        });

        it('should reject request with missing body', async () => {
            const { peerId } = await createValidIpnsRecord();

            const response = await request(app)
                .post(`/validate/ipns/${peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .expect(400);

            expect(response.body.valid).toBe(false);
            expect(response.body.error).toBeDefined();
            // Error could be either about missing body or unmarshal failure
            expect(
                response.body.error.includes('Missing or invalid') ||
                    response.body.error.includes('Failed to unmarshal')
            ).toBe(true);
        });

        it('should reject malformed IPNS record data', async () => {
            const { peerId } = await createValidIpnsRecord();
            const invalidRecord = Buffer.from('invalid-ipns-record-data');

            const response = await request(app)
                .post(`/validate/ipns/${peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(invalidRecord)
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
            });
            expect(response.body.error).toContain(
                'Failed to unmarshal IPNS record'
            );
        });

        it('should reject IPNS record with mismatched peer ID (signature validation failure)', async () => {
            const { marshaledRecord } = await createValidIpnsRecord();
            const { peerId: differentPeerId } = await createValidIpnsRecord();

            // Try to validate record signed by one peer ID using a different peer ID
            const response = await request(app)
                .post(`/validate/ipns/${differentPeerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(marshaledRecord)
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
            });
            expect(response.body.error).toContain(
                'IPNS record validation failed'
            );
        });

        it('should reject IPNS record with wrong content type', async () => {
            const { peerId, marshaledRecord } = await createValidIpnsRecord();

            // Send as JSON instead of octet-stream
            const response = await request(app)
                .post(`/validate/ipns/${peerId}`)
                .set('Content-Type', 'application/json')
                .send({ data: marshaledRecord.toString('base64') })
                .expect(400);

            expect(response.body).toMatchObject({
                valid: false,
                error: 'Missing or invalid IPNS record in request body',
            });
        });

        it('should handle empty request body', async () => {
            const { peerId } = await createValidIpnsRecord();

            const response = await request(app)
                .post(`/validate/ipns/${peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(Buffer.alloc(0))
                .expect(400);

            expect(response.body.valid).toBe(false);
            expect(response.body.error).toBeDefined();
            // Error could be either about missing body or unmarshal failure
            expect(
                response.body.error.includes('Missing or invalid') ||
                    response.body.error.includes('Failed to unmarshal')
            ).toBe(true);
        });

        it('should validate multiple IPNS records sequentially', async () => {
            // Test that the endpoint can handle multiple validations
            const record1 = await createValidIpnsRecord();
            const record2 = await createValidIpnsRecord();
            const record3 = await createValidIpnsRecord();

            const response1 = await request(app)
                .post(`/validate/ipns/${record1.peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(record1.marshaledRecord)
                .expect(200);

            const response2 = await request(app)
                .post(`/validate/ipns/${record2.peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(record2.marshaledRecord)
                .expect(200);

            const response3 = await request(app)
                .post(`/validate/ipns/${record3.peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(record3.marshaledRecord)
                .expect(200);

            expect(response1.body.valid).toBe(true);
            expect(response2.body.valid).toBe(true);
            expect(response3.body.valid).toBe(true);
        });

        it('should complete IPNS validation quickly', async () => {
            const { peerId, marshaledRecord } = await createValidIpnsRecord();

            const start = Date.now();
            await request(app)
                .post(`/validate/ipns/${peerId}`)
                .set('Content-Type', 'application/octet-stream')
                .send(marshaledRecord)
                .expect(200);
            const duration = Date.now() - start;

            // IPNS validation should be fast (under 100ms)
            expect(duration).toBeLessThan(100);
        });
    });
});
