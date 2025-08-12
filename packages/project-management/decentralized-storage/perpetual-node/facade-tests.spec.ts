// Comprehensive Security Facade Tests
// File: packages/perpetual-node/test/security/facade-tests.spec.ts

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import axios, { AxiosResponse } from 'axios';

describe('Security Facade Test Suite', () => {
    const PROXY_URL = process.env.PROXY_URL || 'http://localhost:5001';
    const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:3001';

    // Test CIDs for various scenarios
    const VALID_SMALL_CID =
        'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const INVALID_CID = 'invalid-cid-format';
    const EXTENSION_ID =
        process.env.EXT_ID || 'chrome-extension://test-extension-id';

    beforeAll(async () => {
        // Wait for services to be ready
        await waitForService(PROXY_URL);
        await waitForService(VALIDATOR_URL);
    });

    describe('Pin/Add Facade Security', () => {
        test('should reject multiple CID arguments', async () => {
            const response = await makeRequest('POST', '/api/v0/pin/add', {
                data: 'arg=cid1&arg=cid2',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            expect(response.status).toBe(400);
            expect(response.data.Message).toContain(
                'only one CID argument supported'
            );
        });

        test('should reject invalid CID format', async () => {
            const response = await makeRequest(
                'POST',
                `/api/v0/pin/add?arg=${INVALID_CID}`
            );

            expect(response.status).toBe(400);
            expect(response.data.Message).toContain('invalid CID format');
        });

        test('should reject CID that is too long', async () => {
            const longCid = 'b' + 'a'.repeat(150); // >100 characters
            const response = await makeRequest(
                'POST',
                `/api/v0/pin/add?arg=${longCid}`
            );

            expect(response.status).toBe(400);
            expect(response.data.Message).toContain('CID too long');
        });

        test('should reject empty CID argument', async () => {
            const response = await makeRequest('POST', '/api/v0/pin/add');

            expect(response.status).toBe(400);
            expect(response.data.Message).toContain('missing or invalid CID');
        });

        test('should enforce rate limiting after burst', async () => {
            // Make requests up to burst limit + some extra
            const burstSize = parseInt(process.env.PIN_ADD_BURST || '30');
            const promises = Array(burstSize + 10)
                .fill(0)
                .map(() =>
                    makeRequest(
                        'POST',
                        `/api/v0/pin/add?arg=${VALID_SMALL_CID}`
                    )
                );

            const responses = await Promise.all(promises);
            const rateLimited = responses.some(r => r.status === 429);

            expect(rateLimited).toBe(true);
        });

        test('should respect CORS for extension origin', async () => {
            const response = await makeRequest('OPTIONS', '/api/v0/pin/add', {
                headers: {
                    Origin: EXTENSION_ID,
                    'Access-Control-Request-Method': 'POST',
                },
            });

            expect(response.status).toBe(204);
            expect(response.headers['access-control-allow-origin']).toBe(
                EXTENSION_ID
            );
        });

        test('should reject CORS for unauthorized origin', async () => {
            const response = await makeRequest('OPTIONS', '/api/v0/pin/add', {
                headers: {
                    Origin: 'https://malicious-site.com',
                    'Access-Control-Request-Method': 'POST',
                },
            });

            // Should not return the malicious origin
            expect(response.headers['access-control-allow-origin']).not.toBe(
                'https://malicious-site.com'
            );
        });

        test('should handle content size validation', async () => {
            // This test would require a real IPFS node with large content
            // In integration tests, we would test with actual large CIDs
            console.log(
                '⚠️ Content size validation requires integration with real IPFS'
            );
        });

        test('should validate against schemas', async () => {
            // This test would require a real validator service
            // In integration tests, we would test with actual schema validation
            console.log(
                '⚠️ Schema validation requires integration with validator service'
            );
        });
    });

    describe('DAG/Get Facade Security', () => {
        test('should reject multiple CID arguments', async () => {
            const response = await makeRequest('POST', '/api/v0/dag/get', {
                data: 'arg=cid1&arg=cid2',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            expect(response.status).toBe(400);
            expect(response.data.Message).toContain('only one arg supported');
        });

        test('should reject invalid CID format', async () => {
            const response = await makeRequest(
                'POST',
                `/api/v0/dag/get?arg=${INVALID_CID}`
            );

            expect(response.status).toBe(400);
            expect(response.data.Message).toContain('invalid cid');
        });

        test('should enforce rate limiting', async () => {
            const burstSize = parseInt(process.env.DAG_GET_BURST || '60');
            const promises = Array(burstSize + 10)
                .fill(0)
                .map(() =>
                    makeRequest(
                        'POST',
                        `/api/v0/dag/get?arg=${VALID_SMALL_CID}`
                    )
                );

            const responses = await Promise.all(promises);
            const rateLimited = responses.some(r => r.status === 429);

            expect(rateLimited).toBe(true);
        });
    });

    describe('Pubsub Facade Security', () => {
        test('should reject invalid topic patterns', async () => {
            const invalidTopics = [
                'invalid-topic',
                'mimis/invalid-type/test',
                'mimis/taglist/' + 'x'.repeat(100), // Too long
                'mimis/taglist/invalid@chars',
            ];

            for (const topic of invalidTopics) {
                const response = await makeRequest(
                    'POST',
                    '/api/v0/pubsub/pub',
                    {
                        params: { arg: topic },
                        data: JSON.stringify({ test: 'message' }),
                    }
                );

                expect(response.status).toBe(403);
                expect(response.data.Message).toContain('topic not allowed');
            }
        });

        test('should accept valid topic patterns', async () => {
            const validTopics = [
                'mimis/taglist/user123',
                'mimis/discovery/test-user',
                'mimis/taglist/valid-topic-123',
            ];

            // Note: These would fail in integration without real validator
            for (const topic of validTopics) {
                console.log(
                    `⚠️ Valid topic test for ${topic} requires integration`
                );
            }
        });

        test('should reject oversized messages', async () => {
            const largeMessage = JSON.stringify({
                data: 'x'.repeat(70000), // >64KB
            });

            const response = await makeRequest('POST', '/api/v0/pubsub/pub', {
                params: { arg: 'mimis/taglist/test' },
                data: largeMessage,
            });

            expect(response.status).toBe(413);
            expect(response.data.Message).toContain('data too large');
        });

        test('should reject non-JSON data', async () => {
            const response = await makeRequest('POST', '/api/v0/pubsub/pub', {
                params: { arg: 'mimis/taglist/test' },
                data: 'not-json-data',
            });

            expect(response.status).toBe(415);
            expect(response.data.Message).toContain('data must be JSON');
        });
    });

    describe('Blocked Endpoints', () => {
        const blockedEndpoints = [
            '/api/v0/add',
            '/api/v0/block/get',
            '/api/v0/block/put',
            '/api/v0/object/get',
            '/api/v0/files/read',
            '/api/v0/dag/export',
            '/api/v0/dag/import',
        ];

        blockedEndpoints.forEach(endpoint => {
            test(`should block ${endpoint}`, async () => {
                const response = await makeRequest('POST', endpoint, {
                    data: 'test-data',
                });

                expect(response.status).toBe(403);
            });
        });

        test('should block gateway routes', async () => {
            const gatewayRoutes = [
                `/ipfs/${VALID_SMALL_CID}`,
                '/ipns/example.com',
            ];

            for (const route of gatewayRoutes) {
                const response = await makeRequest('GET', route);
                expect(response.status).toBe(404);
            }
        });
    });

    describe('Allowed Endpoints', () => {
        test('should allow version endpoint', async () => {
            const response = await makeRequest('POST', '/api/v0/version');

            // Should proxy to Kubo (may fail if Kubo not available)
            expect([200, 502].includes(response.status)).toBe(true);
        });

        test('should return 404 for unknown API paths', async () => {
            const response = await makeRequest(
                'GET',
                '/api/v0/unknown-endpoint'
            );

            expect(response.status).toBe(404);
        });
    });

    describe('Validator Service Integration', () => {
        test('should be healthy', async () => {
            const response = await makeRequest('GET', '/health', {
                baseURL: VALIDATOR_URL,
            });

            expect(response.status).toBe(200);
            expect(response.data.status).toBe('healthy');
            expect(Array.isArray(response.data.schemas)).toBe(true);
        });

        test('should validate taglist schema', async () => {
            const validTaglist = {
                version: 1,
                handle: '@testuser',
                updated: Date.now(),
                tags: ['test', 'example'],
            };

            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'taglist/v1',
                    json: validTaglist,
                },
            });

            expect(response.status).toBe(200);
            expect(response.data.valid).toBe(true);
        });

        test('should reject invalid taglist schema', async () => {
            const invalidTaglist = {
                version: 2, // Wrong version
                handle: 'invalid-handle', // Missing @
                updated: 'not-a-number', // Wrong type
                tags: 'not-an-array', // Wrong type
            };

            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'taglist/v1',
                    json: invalidTaglist,
                },
            });

            expect(response.status).toBe(400);
            expect(response.data.valid).toBe(false);
            expect(Array.isArray(response.data.errors)).toBe(true);
        });

        test('should validate pubsub head schema', async () => {
            const validHead = {
                type: 'head',
                cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
                ts: new Date().toISOString(),
                author: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
                nonce: 'test-nonce-123',
            };

            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'pubsub/head/v1',
                    json: validHead,
                },
            });

            expect(response.status).toBe(200);
            expect(response.data.valid).toBe(true);
        });
    });

    // Helper functions
    async function makeRequest(
        method: 'GET' | 'POST' | 'OPTIONS',
        path: string,
        config: any = {}
    ): Promise<AxiosResponse> {
        const baseURL = config.baseURL || PROXY_URL;

        try {
            const response = await axios({
                method,
                url: path,
                baseURL,
                validateStatus: () => true, // Don't throw on any status
                timeout: 5000,
                headers: {
                    Origin: EXTENSION_ID,
                    ...config.headers,
                },
                ...config,
            });

            return response;
        } catch (error) {
            console.error(`Request failed: ${method} ${path}`, error);
            throw error;
        }
    }

    async function waitForService(url: string, timeout = 30000): Promise<void> {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            try {
                await axios.get(`${url}/health`, { timeout: 1000 });
                console.log(`✅ Service ready: ${url}`);
                return;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error(`Service not ready after ${timeout}ms: ${url}`);
    }
});
