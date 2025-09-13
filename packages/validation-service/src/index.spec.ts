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
        await new Promise<void>((resolve) => {
            server = app.listen(port, () => {
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            server.close(() => {
                resolve();
            });
        });
    });

    describe('Health Endpoints', () => {
        it('should return healthy status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                service: 'ajv-validation-sidecar',
                schemas: ['taglist/v1', 'pubsub/head/v1'],
            });
            expect(response.body.timestamp).toBeTypeOf('number');
        });

        it('should return schemas list', async () => {
            const response = await request(app)
                .get('/schemas')
                .expect(200);

            expect(response.body).toHaveProperty('schemas');
            expect(response.body.schemas).toContain('taglist/v1');
            expect(response.body.schemas).toContain('pubsub/head/v1');
            expect(response.body).toHaveProperty('definitions');
        });
    });

    describe('Schema Validation', () => {
        describe('taglist/v1 schema', () => {
            it('should validate correct taglist data', async () => {
                const validTaglist = {
                    version: 1,
                    handle: '@testuser',
                    updated: Date.now(),
                    tags: ['defi', 'testing', 'security'],
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'taglist/v1',
                        json: validTaglist,
                    })
                    .expect(200);

                expect(response.body).toMatchObject({
                    valid: true,
                    schema: 'taglist/v1',
                });
                expect(response.body.validationTime).toMatch(/^\d+(\.\d+)?ms$/);
            });

            it('should reject taglist with invalid version', async () => {
                const invalidTaglist = {
                    version: 2, // Invalid version
                    handle: '@testuser',
                    updated: Date.now(),
                    tags: ['test'],
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'taglist/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body).toMatchObject({
                    valid: false,
                    schema: 'taglist/v1',
                });
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors[0]).toMatchObject({
                    instancePath: '/version',
                    keyword: 'const',
                    message: 'must be equal to constant',
                });
            });

            it('should reject taglist with invalid handle format', async () => {
                const invalidTaglist = {
                    version: 1,
                    handle: 'invalid-handle', // Missing @
                    updated: Date.now(),
                    tags: ['test'],
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'taglist/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                expect(response.body.errors).toBeDefined();
                const handleError = response.body.errors.find((e: ValidationError) => e.instancePath === '/handle');
                expect(handleError).toBeDefined();
                expect(handleError.keyword).toBe('pattern');
            });

            it('should reject taglist with invalid tag format', async () => {
                const invalidTaglist = {
                    version: 1,
                    handle: '@testuser',
                    updated: Date.now(),
                    tags: ['INVALID_TAG'], // Should be lowercase with hyphens only
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'taglist/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                const tagError = response.body.errors.find((e: ValidationError) => 
                    e.instancePath === '/tags/0' && e.keyword === 'pattern'
                );
                expect(tagError).toBeDefined();
            });

            it('should reject taglist with too many tags', async () => {
                const invalidTaglist = {
                    version: 1,
                    handle: '@testuser',
                    updated: Date.now(),
                    tags: Array(101).fill('tag'), // Exceeds maxItems: 100
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'taglist/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                const maxItemsError = response.body.errors.find((e: ValidationError) => 
                    e.keyword === 'maxItems'
                );
                expect(maxItemsError).toBeDefined();
            });

            it('should reject taglist with non-unique tags', async () => {
                const invalidTaglist = {
                    version: 1,
                    handle: '@testuser',
                    updated: Date.now(),
                    tags: ['test', 'test'], // Duplicate tags
                };

                const response = await request(app)
                    .post('/validate')
                    .send({
                        schema: 'taglist/v1',
                        json: invalidTaglist,
                    })
                    .expect(400);

                expect(response.body.valid).toBe(false);
                const uniqueError = response.body.errors.find((e: ValidationError) => 
                    e.keyword === 'uniqueItems'
                );
                expect(uniqueError).toBeDefined();
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
                const cidError = response.body.errors.find((e: ValidationError) => 
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
                const authorError = response.body.errors.find((e: ValidationError) => 
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
                    schema: 'taglist/v1',
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
            expect(response.body.availableSchemas).toContain('taglist/v1');
            expect(response.body.availableSchemas).toContain('pubsub/head/v1');
        });

        it('should return 404 for unknown endpoints', async () => {
            const response = await request(app)
                .get('/unknown-endpoint')
                .expect(404);

            expect(response.body).toMatchObject({
                error: 'Not found',
                path: '/unknown-endpoint',
                availableEndpoints: ['/health', '/validate', '/schemas'],
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
            const validTaglist = {
                version: 1,
                handle: '@testuser',
                updated: Date.now(),
                tags: ['test'],
            };

            const start = Date.now();
            const response = await request(app)
                .post('/validate')
                .send({
                    schema: 'taglist/v1',
                    json: validTaglist,
                })
                .expect(200);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100); // Should complete in under 100ms
            expect(response.body.validationTime).toBeDefined();
            
            // Parse validation time to ensure it's reasonable
            const validationTimeMs = parseFloat(response.body.validationTime.replace('ms', ''));
            expect(validationTimeMs).toBeLessThan(10); // AJV should be very fast
        });
    });

    describe('CORS Headers', () => {
        it('should include CORS headers in responses', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.headers['access-control-allow-origin']).toBe('*');
            expect(response.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
            expect(response.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
        });

        it('should handle OPTIONS preflight requests', async () => {
            const response = await request(app)
                .options('/validate')
                .expect(204);

            expect(response.headers['access-control-allow-origin']).toBe('*');
        });
    });
});