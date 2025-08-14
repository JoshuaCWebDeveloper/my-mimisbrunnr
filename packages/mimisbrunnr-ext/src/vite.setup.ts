import { vi } from 'vitest';

// Create a mock browser object for testing
const mockBrowser = {
    runtime: {
        sendMessage: vi.fn(),
    },
    tabs: {
        sendMessage: vi.fn(),
        query: vi.fn(() => [
            {
                id: 1,
            },
        ]),
    },
};

// Extend the global scope with the mock browser
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).browser = mockBrowser;

globalThis.window = globalThis as typeof window;
