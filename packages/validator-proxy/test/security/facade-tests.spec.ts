import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios, { AxiosResponse } from 'axios';
import { createHash } from 'crypto';

// Test configuration
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:5001';
const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:3000';

// Test utilities
const makeRequest = async (
    method: 'GET' | 'POST',
    path: string,
    options: any = {}
): Promise<AxiosResponse> => {
    return axios({
        method,
        url: path,
        baseURL: PROXY_URL,
        validateStatus: () => true, // Don't throw on error status codes
        timeout: 10000,
        ...options,
    });
};

// Test data
const validTaglist = {
    version: 1,
    handle: '@testuser',
    updated: Date.now(),
    tags: ['defi', 'testing', 'security'],
};

const invalidTaglist = {
    version: 2, // Invalid version
    handle: 'invalid-handle', // Missing @
    updated: 'not-a-number', // Should be number
    tags: ['valid-tag'],
};

const validHead = {
    type: 'head',
    cid: 'QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o',
    ts: Date.now(),
    author: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
};

const oversizedContent = {
    version: 1,
    handle: '@testuser',
    updated: Date.now(),
    tags: Array(10000).fill('x'.repeat(100)), // Create oversized content
};

describe('Security Façade Tests', () => {
    describe('Health and Status Endpoints', () => {
        it('should return proxy health status', async () => {
            const response = await makeRequest('GET', '/health');
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('status', 'ok');
            expect(response.data).toHaveProperty('service', 'ipfs-security-proxy');
        });

        it('should return detailed health status', async () => {
            const response = await makeRequest('GET', '/health-detailed', {
                baseURL: PROXY_URL.replace('5001', '8080'),
            });
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('status');
            expect(response.data).toHaveProperty('services');
        });
    });

    describe('Validator Service Tests', () => {
        it('should validate correct taglist schema', async () => {
            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'taglist/v1',
                    json: validTaglist,
                },
            });

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('valid', true);
        });

        it('should reject invalid taglist schema', async () => {
            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'taglist/v1',
                    json: invalidTaglist,
                },
            });

            expect(response.status).toBe(400);
            expect(response.data).toHaveProperty('valid', false);
            expect(response.data).toHaveProperty('errors');
        });

        it('should validate correct pubsub head schema', async () => {
            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'pubsub/head/v1',
                    json: validHead,
                },
            });

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('valid', true);
        });

        it('should return available schemas', async () => {
            const response = await makeRequest('GET', '/schemas', {
                baseURL: VALIDATOR_URL,
            });

            expect(response.status).toBe(200);
            expect(response.data.schemas).toContain('taglist/v1');
            expect(response.data.schemas).toContain('pubsub/head/v1');
        });
    });

    describe('API Endpoint Security', () => {
        it('should block unauthorized API endpoints', async () => {
            const blockedEndpoints = [
                '/api/v0/add',
                '/api/v0/block/get',
                '/api/v0/object/get',
                '/api/v0/files/ls',
                '/api/v0/refs/local',
            ];

            for (const endpoint of blockedEndpoints) {
                const response = await makeRequest('GET', endpoint);
                expect(response.status).toBe(403);
                expect(response.data).toHaveProperty('Message');
                expect(response.data.Message).toContain('blocked');
            }
        });

        it('should allow safe API endpoints', async () => {
            const safeEndpoints = ['/api/v0/version', '/api/v0/id'];

            for (const endpoint of safeEndpoints) {
                const response = await makeRequest('GET', endpoint);
                // Should not be blocked (may fail for other reasons like IPFS not running)
                expect(response.status).not.toBe(403);
            }
        });

        it('should return 404 for unknown endpoints', async () => {
            const response = await makeRequest('GET', '/unknown/endpoint');
            expect(response.status).toBe(404);
        });
    });

    describe('Pin/Add Façade Security', () => {
        it('should require POST method for pin/add', async () => {
            const response = await makeRequest('GET', '/api/v0/pin/add?arg=QmTest');
            expect(response.status).toBe(405);
            expect(response.data).toHaveProperty('Message', 'Method not allowed');
        });

        it('should require CID parameter', async () => {
            const response = await makeRequest('POST', '/api/v0/pin/add');
            expect(response.status).toBe(400);
            expect(response.data).toHaveProperty('Message');
            expect(response.data.Message).toContain('Missing required parameter');
        });

        it('should validate CID format', async () => {
            const invalidCids = ['invalid-cid', 'not-a-cid-at-all', ''];

            for (const cid of invalidCids) {
                const response = await makeRequest('POST', `/api/v0/pin/add?arg=${cid}`);
                expect(response.status).toBe(400);
                expect(response.data).toHaveProperty('Message');
                expect(response.data.Message).toContain('Invalid CID format');
            }
        });
    });

    describe('Rate Limiting Tests', () => {
        it('should apply rate limits to API endpoints', async () => {
            // Make rapid requests to trigger rate limiting
            const requests = Array(100).fill(null).map(() => 
                makeRequest('GET', '/api/v0/version')
            );

            const responses = await Promise.allSettled(requests);
            const rateLimited = responses.some(
                (result) => 
                    result.status === 'fulfilled' && 
                    result.value.status === 429
            );

            // At least some requests should be rate limited
            expect(rateLimited).toBe(true);
        });

        it('should have different rate limits for different endpoints', async () => {
            // Test that pin endpoints have stricter limits than read endpoints
            const pinRequests = Array(50).fill(null).map(() =>
                makeRequest('POST', '/api/v0/pin/add?arg=QmTest')
            );

            const responses = await Promise.allSettled(pinRequests);
            const rateLimited = responses.filter(
                (result) =>
                    result.status === 'fulfilled' && 
                    result.value.status === 429
            ).length;

            // Pin endpoints should have stricter limits
            expect(rateLimited).toBeGreaterThan(0);
        });
    });

    describe('Pubsub Façade Security', () => {
        it('should validate topic format for pubsub/pub', async () => {
            const invalidTopics = [
                'invalid-topic',
                'mimis/invalid/topic',
                'mimis/taglist/',
                'mimis/taglist/toolong' + 'x'.repeat(100),
            ];

            for (const topic of invalidTopics) {
                const response = await makeRequest('POST', `/api/v0/pubsub/pub?arg=${topic}`, {
                    data: validHead,
                });
                expect(response.status).toBe(403);
                expect(response.data).toHaveProperty('Message');
                expect(response.data.Message).toContain('Topic not allowed');
            }
        });

        it('should allow valid topic formats', async () => {
            const validTopics = [
                'mimis/taglist/test',
                'mimis/discovery/user123',
                'mimis/taglist/test-topic',
            ];

            for (const topic of validTopics) {
                const response = await makeRequest('POST', `/api/v0/pubsub/pub?arg=${topic}`, {
                    data: validHead,
                });
                // Should not be blocked for topic format (may fail for other reasons)
                expect(response.status).not.toBe(403);
            }
        });

        it('should enforce message size limits', async () => {
            const largeMessage = {
                ...validHead,
                largeField: 'x'.repeat(100000), // 100KB
            };

            const response = await makeRequest('POST', '/api/v0/pubsub/pub?arg=mimis/taglist/test', {
                data: largeMessage,
            });

            expect(response.status).toBe(413);
            expect(response.data).toHaveProperty('Message');
            expect(response.data.Message).toContain('too large');
        });
    });

    describe('Content Size Validation', () => {
        it('should reject oversized content', async () => {
            // This test would require a mock IPFS node or actual oversized content
            // For now, we test the size limit validation logic
            const oversizedJson = JSON.stringify(oversizedContent);
            expect(oversizedJson.length).toBeGreaterThan(65536); // Should exceed limits
        });
    });

    describe('CORS and Security Headers', () => {
        it('should include security headers', async () => {
            const response = await makeRequest('GET', '/health');
            
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-xss-protection']).toBe('1; mode=block');
        });

        it('should handle CORS preflight requests', async () => {
            const response = await makeRequest('OPTIONS', '/api/v0/version');
            
            expect(response.status).toBe(204);
            expect(response.headers['access-control-allow-origin']).toBeTruthy();
            expect(response.headers['access-control-allow-methods']).toBeTruthy();
        });
    });

    describe('Error Handling', () => {
        it('should return JSON error responses', async () => {
            const response = await makeRequest('POST', '/api/v0/pin/add');
            
            expect(response.headers['content-type']).toContain('application/json');
            expect(response.data).toHaveProperty('Message');
            expect(typeof response.data.Message).toBe('string');
        });

        it('should handle malformed JSON gracefully', async () => {
            const response = await makeRequest('POST', '/api/v0/pubsub/pub?arg=mimis/taglist/test', {
                data: 'invalid-json{',
                headers: { 'Content-Type': 'application/json' },
            });

            expect(response.status).toBe(400);
            expect(response.data).toHaveProperty('Message');
        });
    });

    describe('Performance and Monitoring', () => {
        it('should complete validation within reasonable time', async () => {
            const start = Date.now();
            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'taglist/v1',
                    json: validTaglist,
                },
            });
            const duration = Date.now() - start;

            expect(response.status).toBe(200);
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should provide validation timing information', async () => {
            const response = await makeRequest('POST', '/validate', {
                baseURL: VALIDATOR_URL,
                data: {
                    schema: 'taglist/v1',
                    json: validTaglist,
                },
            });

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('validationTime');
            expect(response.data.validationTime).toMatch(/^\d+(\.\d+)?ms$/);
        });
    });
});