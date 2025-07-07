declare global {
    interface Window {
        browser?: typeof chrome;
    }
}

export {};
