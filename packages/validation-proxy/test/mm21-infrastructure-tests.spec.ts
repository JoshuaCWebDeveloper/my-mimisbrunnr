/**
 * MM-21 Infrastructure & Docker Orchestration Tests
 *
 * Tests for Docker Compose stack, service communication,
 * health checks, and configuration validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('MM-21 Infrastructure Tests', () => {

  describe('Docker Compose Stack', () => {

    it('should start all services successfully', async () => {
      const { stdout } = await execAsync('docker-compose up -d');
      expect(stdout).toContain('Creating');

      // Wait for services to be ready
      await new Promise(resolve => setTimeout(resolve, 30000));
    }, 60000);

    it('should show all services as healthy', async () => {
      const { stdout } = await execAsync('docker-compose ps --format "table {{.Name}}\\t{{.State}}"');

      expect(stdout).toContain('mimis-kubo');
      expect(stdout).toContain('mimis-validator');
      expect(stdout).toContain('mimis-proxy');

      // All should be Up
      const lines = stdout.split('\n').filter(line => line.includes('mimis-'));
      lines.forEach(line => {
        expect(line).toContain('Up');
      });
    });

    it('should have correct network configuration', async () => {
      const { stdout } = await execAsync('docker network inspect mimisbrunnr-network');
      const networkConfig = JSON.parse(stdout)[0];

      expect(networkConfig.Name).toBe('mimisbrunnr-network');
      expect(networkConfig.Driver).toBe('bridge');
    });

  });

  describe('Service Health Checks', () => {

    it('should verify IPFS Kubo health', async () => {
      const { stdout } = await execAsync('docker-compose exec -T kubo ipfs version');
      expect(stdout).toContain('ipfs version');
    });

    it('should verify Validation Service health', async () => {
      const { stdout } = await execAsync('docker-compose exec -T validator curl -s http://localhost:3000/health');
      const health = JSON.parse(stdout);

      expect(health.status).toBe('healthy');
      expect(health.service).toBe('ajv-validation-sidecar');
      expect(health.schemas).toContain('taglist/v1');
      expect(health.schemas).toContain('pubsub/head/v1');
    });

    it('should verify service ports are exposed correctly', async () => {
      const { stdout } = await execAsync('docker-compose ps --format "table {{.Name}}\\t{{.Ports}}"');

      expect(stdout).toContain('4001->4001'); // Kubo P2P port
      expect(stdout).toContain('5001->5001'); // Proxy IPFS API port
      expect(stdout).toContain('8080->8080'); // Proxy status port
    });

  });

  describe('Service Communication', () => {

    it('should verify validator is accessible from proxy', async () => {
      // Test internal network communication
      const { stdout } = await execAsync(
        'docker-compose exec -T proxy wget -qO- http://validator:3000/health'
      );
      const health = JSON.parse(stdout);
      expect(health.status).toBe('healthy');
    });

    it('should verify kubo is accessible from other services', async () => {
      const { stdout } = await execAsync(
        'docker-compose exec -T validator curl -s http://kubo:5001/api/v0/version'
      );
      expect(stdout).toContain('Version');
    });

  });

  describe('Configuration Validation', () => {

    it('should have correct environment variables', async () => {
      // Check validator environment
      const { stdout: validatorEnv } = await execAsync(
        'docker-compose exec -T validator env | grep -E "(NODE_ENV|VALIDATOR_PORT|LOG_LEVEL)"'
      );

      expect(validatorEnv).toContain('NODE_ENV=production');
      expect(validatorEnv).toContain('VALIDATOR_PORT=3000');
      expect(validatorEnv).toContain('LOG_LEVEL=info');
    });

    it('should have correct volume mounts', async () => {
      const { stdout } = await execAsync('docker volume ls');
      expect(stdout).toContain('mimis-kubo-data');
    });

    it('should enforce security constraints', async () => {
      // Check that services run as non-root users
      const { stdout: validatorUser } = await execAsync(
        'docker-compose exec -T validator id'
      );
      expect(validatorUser).toContain('uid=1001');
    });

  });

  describe('Service Recovery', () => {

    it('should restart services correctly', async () => {
      // Stop and restart validator
      await execAsync('docker-compose stop validator');
      await execAsync('docker-compose start validator');

      // Wait for service to be ready
      await new Promise(resolve => setTimeout(resolve, 10000));

      const { stdout } = await execAsync(
        'docker-compose exec -T validator curl -s http://localhost:3000/health'
      );
      const health = JSON.parse(stdout);
      expect(health.status).toBe('healthy');
    }, 30000);

  });

  afterAll(async () => {
    // Cleanup - stop all services
    await execAsync('docker-compose down');
  });

});