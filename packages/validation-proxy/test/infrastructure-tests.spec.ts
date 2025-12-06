/**
 * MM-21 Infrastructure & Docker Orchestration Tests
 *
 * Tests for Docker Compose stack, service communication,
 * health checks, and configuration validation
 *
 * NOTE: These tests require Docker containers to be running.
 * Run `docker-compose up -d` from the project root before running these tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper to check if containers are running and healthy
async function waitForHealthyContainers(maxRetries = 20, delayMs = 3000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const { stdout } = await execAsync(
                'docker-compose ps --format "{{.Name}}\t{{.Status}}"',
                { cwd: '../..' }
            );
            const lines = stdout.split('\n').filter(Boolean);
            const healthyCount = lines.filter(
                line => line.includes('Up') && !line.includes('Restarting')
            ).length;

            // Need at least 3 services healthy (kubo, validation-service, validation-proxy)
            if (healthyCount >= 3) {
                return true;
            }
        } catch (_e) {
            // eslint-disable-next-line no-console
            console.log(
                `Waiting for containers... attempt ${i + 1}/${maxRetries}`
            );
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return false;
}

describe('Infrastructure Tests', () => {
    beforeAll(async () => {
        // Check if containers are running, if not provide helpful error
        try {
            const { stdout } = await execAsync('docker-compose ps', {
                cwd: '../..',
            });
            if (!stdout || stdout.trim().length === 0) {
                throw new Error(
                    'No containers running. Please run: docker-compose up -d'
                );
            }

            // Wait for containers to be healthy
            const healthy = await waitForHealthyContainers();
            if (!healthy) {
                // eslint-disable-next-line no-console
                console.warn(
                    'Warning: Not all containers are healthy yet. Some tests may fail.'
                );
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to check container status:', error);
            throw new Error(
                'Docker containers are not running. Please run: docker-compose up -d'
            );
        }
    }, 60000);

    describe('Docker Compose Stack', () => {
        it('should start all services successfully', async () => {
            const { stdout } = await execAsync(
                'docker-compose ps --format "{{.Name}}"',
                { cwd: '../..' }
            );
            const containers = stdout.split('\n').filter(Boolean);
            expect(containers.length).toBeGreaterThanOrEqual(3);
        }, 10000);

        it('should show all services as healthy', async () => {
            const { stdout } = await execAsync(
                'docker-compose ps --format "table {{.Name}}\\t{{.State}}"',
                { cwd: '../..' }
            );

            expect(stdout).toContain('kubo');
            expect(stdout).toContain('validation-service');
            expect(stdout).toContain('validation-proxy');

            // All should be Up
            const lines = stdout
                .split('\n')
                .filter(line =>
                    line.match(
                        /^(kubo|validation-service|validation-proxy|orbitdb-service)/
                    )
                );
            lines.forEach(line => {
                expect(line).toContain('Up');
            });
        });

        it('should have correct network configuration', async () => {
            const { stdout } = await execAsync(
                'docker network inspect mimisbrunnr-network'
            );
            const networkConfig = JSON.parse(stdout)[0];

            expect(networkConfig.Name).toBe('mimisbrunnr-network');
            expect(networkConfig.Driver).toBe('bridge');
        });
    });

    describe('Service Health Checks', () => {
        it('should verify IPFS Kubo health', async () => {
            const { stdout } = await execAsync(
                'docker-compose exec -T kubo ipfs version',
                { cwd: '../..' }
            );
            expect(stdout).toContain('ipfs version');
        });

        it('should verify Validation Service health', async () => {
            const { stdout } = await execAsync(
                'docker-compose exec -T validation-service curl -s http://localhost:3000/health',
                { cwd: '../..' }
            );
            const health = JSON.parse(stdout);

            expect(health.status).toBe('healthy');
            expect(health.service).toBe('ajv-validation-sidecar');
            expect(health.schemas).toContain('data/write/v1');
            expect(health.schemas).toContain('pubsub/head/v1');
        });

        it('should verify service ports are exposed correctly', async () => {
            const { stdout } = await execAsync(
                'docker-compose ps --format "table {{.Name}}\\t{{.Ports}}"',
                { cwd: '../..' }
            );

            expect(stdout).toContain('4001->4001'); // Kubo P2P port
            expect(stdout).toContain('5001->5001'); // Proxy IPFS API port
            expect(stdout).toContain('8080->8080'); // Proxy status port
        });
    });

    describe('Service Communication', () => {
        it('should verify validator is accessible from proxy', async () => {
            // Test internal network communication
            const { stdout } = await execAsync(
                'docker-compose exec -T validation-proxy curl -s http://validation-service:3000/health',
                { cwd: '../..' }
            );
            const health = JSON.parse(stdout);
            expect(health.status).toBe('healthy');
        });

        it('should verify kubo is accessible from other services', async () => {
            const { stdout } = await execAsync(
                'docker-compose exec -T validation-service curl -s http://kubo:5001/api/v0/version',
                { cwd: '../..' }
            );
            expect(stdout).toContain('Version');
        });
    });

    describe('Configuration Validation', () => {
        it('should have correct environment variables', async () => {
            // Check validator environment
            const { stdout: validatorEnv } = await execAsync(
                'docker-compose exec -T validation-service env | grep -E "(NODE_ENV|VALIDATOR_PORT|LOG_LEVEL)"',
                { cwd: '../..' }
            );

            expect(validatorEnv).toContain('NODE_ENV=production');
            expect(validatorEnv).toContain('VALIDATOR_PORT=3000');
            expect(validatorEnv).toContain('LOG_LEVEL=info');
        });

        it('should have correct volume mounts', async () => {
            // Check for local volume directory instead of named volume
            const { stdout: inspectOut } = await execAsync(
                'docker inspect kubo'
            );
            const kuboConfig = JSON.parse(inspectOut)[0];
            const mounts = kuboConfig.Mounts;
            const kuboMount = mounts.find(
                (m: { Destination: string }) => m.Destination === '/data/ipfs'
            );
            expect(kuboMount).toBeDefined();
            expect(kuboMount.Source).toContain('kubo_data');
        });

        it('should enforce security constraints', async () => {
            // Check that services run as non-root users
            const { stdout: validatorUser } = await execAsync(
                'docker-compose exec -T validation-service id',
                { cwd: '../..' }
            );
            expect(validatorUser).toContain('uid=1001');
        });
    });

    describe('Service Recovery', () => {
        it('should restart services correctly', async () => {
            // Stop and restart validator
            await execAsync('docker-compose stop validation-service', {
                cwd: '../..',
            });
            await execAsync('docker-compose start validation-service', {
                cwd: '../..',
            });

            // Wait for service to be ready
            await new Promise(resolve => setTimeout(resolve, 10000));

            const { stdout } = await execAsync(
                'docker-compose exec -T validation-service curl -s http://localhost:3000/health',
                { cwd: '../..' }
            );
            const health = JSON.parse(stdout);
            expect(health.status).toBe('healthy');
        }, 30000);
    });

    // Note: We don't stop containers in afterAll to allow for manual inspection
    // Run `docker-compose down` manually when you're done testing
});
