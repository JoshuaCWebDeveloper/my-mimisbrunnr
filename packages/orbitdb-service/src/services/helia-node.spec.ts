import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeliaNode } from './helia-node.js';
import { Logger } from '../logger/logger.js';
import type { HealthService } from '../health/health.service.js';

// Mock external dependencies
vi.mock('helia', () => ({
    createHelia: vi.fn(),
}));

describe('HeliaNode', () => {
    let heliaNode: HeliaNode;
    let mockLogger: Logger;
    let mockHealthService: Partial<HealthService>;
    let mockConfigService: Partial<import('@nestjs/config').ConfigService>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        } as unknown as Logger;

        mockHealthService = {
            registerService: vi.fn(),
            unregisterService: vi.fn(),
        };

        mockConfigService = {
            get: vi.fn().mockReturnValue({
                ipfs: {
                    apiUrl: 'http://kubo:5001',
                    bootstrapNodes: [],
                },
            }),
        };

        heliaNode = new HeliaNode(
            mockLogger,
            mockHealthService as unknown as HealthService,
            mockConfigService as unknown as import('@nestjs/config').ConfigService
        );
    });

    afterEach(async () => {
        await heliaNode.shutdown();
    });

    describe('initialization', () => {
        it('should create instance', () => {
            expect(heliaNode).toBeDefined();
        });

        it('should have disconnected status initially', () => {
            const status = heliaNode.getConnectionStatus();
            expect(status.connected).toBe(false);
        });
    });

    describe('getHeliaInstance', () => {
        it('should return null before initialization', () => {
            const instance = heliaNode.getHeliaInstance();
            expect(instance).toBeNull();
        });
    });

    describe('getPeers', () => {
        it('should return empty array when not initialized', async () => {
            const peers = await heliaNode.getPeers();
            expect(peers).toEqual([]);
        });
    });

    describe('getHealthStatus', () => {
        it('should return unhealthy status when not connected', async () => {
            const status = await heliaNode.getHealthStatus();
            expect(status.status).toBe('unhealthy');
            expect(status.details?.connected).toBe(false);
        });
    });
});
