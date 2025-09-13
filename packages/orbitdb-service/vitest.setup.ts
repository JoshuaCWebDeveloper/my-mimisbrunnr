// Test setup file for Vitest
/* eslint-disable no-console */
import { vi, beforeEach, afterEach } from 'vitest';

// Mock console methods to reduce test output noise
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.IPFS_API_URL = 'http://localhost:5001';
process.env.ORBITDB_LOG_NAME = 'test-discovery-log';
process.env.ORBITDB_DATA_DIR = '/tmp/test-orbitdb';
process.env.PORT = '3000';

// Global test mocks that apply to all tests
vi.mock('winston', () => ({
    default: {
        createLogger: vi.fn(() => ({
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
        })),
        format: {
            combine: vi.fn(() => ({})),
            timestamp: vi.fn(() => ({})),
            colorize: vi.fn(() => ({})),
            printf: vi.fn(() => ({})),
        },
        transports: {
            Console: vi.fn(),
            File: vi.fn(),
        },
        addColors: vi.fn(),
    },
}));

// Suppress console output in tests unless specifically needed
beforeEach(() => {
    // Only suppress in test environment
    if (process.env.VITEST) {
        console.log = vi.fn();
        console.warn = vi.fn();
        console.error = vi.fn();
        console.info = vi.fn();
        console.debug = vi.fn();
    }
});

// Restore console after tests if needed
afterEach(() => {
    if (process.env.VITEST_RESTORE_CONSOLE) {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        console.info = originalConsole.info;
        console.debug = originalConsole.debug;
    }
});

// Global test utilities
export const testUtils = {
    // Create a mock discovery record for testing
    createMockDiscoveryRecord: (overrides: Record<string, unknown> = {}) => ({
        lookupKey: 'a'.repeat(64),
        handle: '@testuser',
        ipnsKey: 'k2k4r8n9w3t2...',
        did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    }),

    // Restore console for debugging specific tests
    restoreConsole: () => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        console.info = originalConsole.info;
        console.debug = originalConsole.debug;
    },

    // Suppress console for tests that need it
    suppressConsole: () => {
        console.log = vi.fn();
        console.warn = vi.fn();
        console.error = vi.fn();
        console.info = vi.fn();
        console.debug = vi.fn();
    },
};
