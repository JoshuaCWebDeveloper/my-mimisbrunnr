// Integration tests for HealthCheckSystem
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import _express from 'express';
import request from 'supertest';
import { HealthCheckSystem } from '../../utils/health-check.js';

// Mock dependencies
const mockIPFSClient = {
    getConnectionStatus: vi.fn(() => ({
        connected: true,
        peerId: 'test-peer',
        version: '0.60.0',
        lastCheck: Date.now(),
    })),
};

const mockOrbitDBManager = {
    getConnectionStatus: vi.fn(() => ({
        connected: true,
        id: 'orbitdb-test-id',
        peers: 5,
        lastUpdate: Date.now(),
    })),
    getDiscoveryLogStats: vi.fn(() => ({
        address: '/orbitdb/test-address',
        entryCount: 42,
        pinnedEntries: 38,
        replicationProgress: 100,
        peers: 5,
    })),
};

const mockReplicationHandler = {
    getReplicationStats: vi.fn(() => ({
        totalProcessed: 100,
        totalPinned: 95,
        totalRejected: 5,
        pinnedEntries: 95,
        validEntries: 95,
        invalidEntries: 5,
    })),
};

const mockRateLimiter = {
    getRateLimitStats: vi.fn(() => ({
        totalIPs: 25,
        dailyTrackingEntries: 15,
        requestTrackingEntries: 25,
    })),
};

// Mock the config
vi.mock('../../config/environment.js', () => ({
    config: {
        service: {
            port: 3002, // Use different port for tests
            healthCheckInterval: 5000,
        },
    },
}));

describe('HealthCheckSystem Integration', () => {
    let healthCheckSystem: HealthCheckSystem;
    let server: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        healthCheckSystem = new HealthCheckSystem();
        
        // Initialize with mock dependencies
        healthCheckSystem.initialize({
            ipfsClient: mockIPFSClient as any,
            orbitdbManager: mockOrbitDBManager as any,
            replicationHandler: mockReplicationHandler as any,
            rateLimiter: mockRateLimiter as any,
        });
    });

    afterEach(async () => {
        if (server) {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }
        await healthCheckSystem.shutdown();
    });

    describe('health check endpoints', () => {
        beforeEach(async () => {
            // Start the health check server
            await healthCheckSystem.start();
            // Get the server instance for testing
            server = healthCheckSystem['server'];
        });

        it('should respond to /health endpoint with healthy status', async () => {
            const response = await request(server)
                .get('/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                timestamp: expect.any(Number),
                uptime: expect.any(Number),
                details: {
                    services: {
                        ipfs: 'healthy',
                        orbitdb: 'healthy',
                        discovery: 'healthy',
                        pinning: 'healthy',
                    },
                    unhealthyCount: 0,
                    degradedCount: 0,
                },
            });
        });

        it('should respond to /health/ipfs endpoint', async () => {
            const response = await request(server)
                .get('/health/ipfs')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                details: {
                    connected: true,
                    peerId: 'test-peer',
                    version: '0.60.0',
                    lastCheck: expect.any(Number),
                },
            });
        });

        it('should respond to /health/orbitdb endpoint', async () => {
            const response = await request(server)
                .get('/health/orbitdb')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                details: {
                    connected: true,
                    id: 'orbitdb-test-id',
                    peers: 5,
                    lastUpdate: expect.any(Number),
                },
            });
        });

        it('should respond to /health/discovery endpoint', async () => {
            const response = await request(server)
                .get('/health/discovery')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                details: {
                    address: '/orbitdb/test-address',
                    entryCount: 42,
                    pinnedEntries: 38,
                    replicationProgress: 100,
                    peers: 5,
                },
            });
        });

        it('should respond to /health/pins endpoint', async () => {
            const response = await request(server)
                .get('/health/pins')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                details: {
                    totalProcessed: 100,
                    totalPinned: 95,
                    totalRejected: 5,
                    pinnedEntries: 95,
                    validEntries: 95,
                    invalidEntries: 5,
                    rejectionRate: 0.05,
                },
            });
        });

        it('should respond to /health/ratelimit endpoint', async () => {
            const response = await request(server)
                .get('/health/ratelimit')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                details: {
                    totalIPs: 25,
                    dailyTrackingEntries: 15,
                    requestTrackingEntries: 25,
                },
            });
        });

        it('should respond to /metrics endpoint', async () => {
            const response = await request(server)
                .get('/metrics')
                .expect(200);

            expect(response.body).toMatchObject({
                timestamp: expect.any(Number),
                uptime: expect.any(Number),
                service: {
                    version: expect.any(String),
                    nodeVersion: expect.any(String),
                    platform: expect.any(String),
                    arch: expect.any(String),
                },
                ipfs: expect.any(Object),
                replication: expect.any(Object),
                rateLimit: expect.any(Object),
                memory: expect.any(Object),
                config: expect.any(Object),
            });
        });
    });

    describe('unhealthy service scenarios', () => {
        beforeEach(async () => {
            await healthCheckSystem.start();
            server = healthCheckSystem['server'];
        });

        it('should report unhealthy status when IPFS is disconnected', async () => {
            mockIPFSClient.getConnectionStatus.mockReturnValueOnce({
                connected: false,
                error: 'Connection timeout',
                lastCheck: Date.now(),
            });

            const response = await request(server)
                .get('/health')
                .expect(503);

            expect(response.body.status).toBe('unhealthy');
            expect(response.body.details.services.ipfs).toBe('unhealthy');
        });

        it('should report unhealthy status when OrbitDB is disconnected', async () => {
            mockOrbitDBManager.getConnectionStatus.mockReturnValueOnce({
                connected: false,
                error: 'OrbitDB initialization failed',
                peers: 0,
                lastUpdate: Date.now(),
            });

            const response = await request(server)
                .get('/health')
                .expect(503);

            expect(response.body.status).toBe('unhealthy');
            expect(response.body.details.services.orbitdb).toBe('unhealthy');
        });

        it('should report degraded status when replication has high rejection rate', async () => {
            mockReplicationHandler.getReplicationStats.mockReturnValueOnce({
                totalProcessed: 100,
                totalPinned: 30,
                totalRejected: 70, // High rejection rate
                pinnedEntries: 30,
                validEntries: 30,
                invalidEntries: 70,
            });

            const response = await request(server)
                .get('/health')
                .expect(503);

            expect(response.body.status).toBe('degraded');
            expect(response.body.details.services.pinning).toBe('degraded');
        });

        it('should report unhealthy status when discovery log is unavailable', async () => {
            mockOrbitDBManager.getDiscoveryLogStats.mockReturnValueOnce(null);

            const response = await request(server)
                .get('/health/discovery')
                .expect(503);

            expect(response.body.status).toBe('unhealthy');
            expect(response.body.details.error).toBe('Discovery log not available');
        });
    });

    describe('error handling', () => {
        it('should handle service initialization without dependencies', async () => {
            const uninitializedHealthCheck = new HealthCheckSystem();
            
            await uninitializedHealthCheck.start();
            const testServer = uninitializedHealthCheck['server'];

            const response = await request(testServer)
                .get('/health')
                .expect(503);

            expect(response.body.status).toBe('unhealthy');
            expect(response.body.details.error).toBe('Service dependencies not initialized');

            await uninitializedHealthCheck.shutdown();
        });

        it('should handle errors in health check endpoints gracefully', async () => {
            mockIPFSClient.getConnectionStatus.mockImplementationOnce(() => {
                throw new Error('Mock error');
            });

            await healthCheckSystem.start();
            server = healthCheckSystem['server'];

            const response = await request(server)
                .get('/health/ipfs')
                .expect(503);

            expect(response.body.status).toBe('unhealthy');
            expect(response.body.details.error).toBe('Mock error');
        });

        it('should handle metrics collection errors', async () => {
            mockReplicationHandler.getReplicationStats.mockImplementationOnce(() => {
                throw new Error('Stats error');
            });

            await healthCheckSystem.start();
            server = healthCheckSystem['server'];

            const response = await request(server)
                .get('/metrics')
                .expect(200);

            expect(response.body.error).toBe('Failed to collect metrics');
            expect(response.body.message).toBe('Stats error');
        });
    });

    describe('graceful shutdown', () => {
        it('should shutdown gracefully', async () => {
            await healthCheckSystem.start();
            
            await expect(healthCheckSystem.shutdown()).resolves.not.toThrow();
        });

        it('should shutdown without server running', async () => {
            // Don't start the server
            await expect(healthCheckSystem.shutdown()).resolves.not.toThrow();
        });
    });
});