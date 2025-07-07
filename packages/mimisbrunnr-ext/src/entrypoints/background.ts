export default defineBackground(() => {
    console.log('X.com Account Tagger background script loaded');

    // Storage service for tags
    class TagStorage {
        private db: IDBDatabase | null = null;
        private readonly dbName = 'XAccountTagger';
        private readonly storeName = 'userTags';
        private readonly version = 1;

        async init(): Promise<void> {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };

                request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, {
                            keyPath: 'username',
                        });
                    }
                };
            });
        }

        async saveTag(
            username: string,
            tag: string,
            color: string
        ): Promise<void> {
            if (!this.db) await this.init();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }
                const transaction = this.db.transaction(
                    [this.storeName],
                    'readwrite'
                );
                const store = transaction.objectStore(this.storeName);
                const request = store.put({ username, tag, color });

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        }

        async getTag(
            username: string
        ): Promise<{ username: string; tag: string; color: string } | null> {
            if (!this.db) await this.init();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }
                const transaction = this.db.transaction(
                    [this.storeName],
                    'readonly'
                );
                const store = transaction.objectStore(this.storeName);
                const request = store.get(username);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || null);
            });
        }

        async getAllTags(): Promise<
            Array<{ username: string; tag: string; color: string }>
        > {
            if (!this.db) await this.init();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }
                const transaction = this.db.transaction(
                    [this.storeName],
                    'readonly'
                );
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        }

        async deleteTag(username: string): Promise<void> {
            if (!this.db) await this.init();

            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }
                const transaction = this.db.transaction(
                    [this.storeName],
                    'readwrite'
                );
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(username);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        }
    }

    const tagStorage = new TagStorage();

    // Handle messages from popup and content script
    browser.runtime.onMessage.addListener(
        (
            message: {
                type: 'GET_TAGS' | 'SAVE_TAG' | 'DELETE_TAG';
                username: string;
                tag: string;
                color: string;
            },
            sender: unknown,
            sendResponse: (response: unknown) => void
        ) => {
            (async () => {
                try {
                    if (message.type === 'GET_TAGS') {
                        const tags = await tagStorage.getAllTags();
                        sendResponse({ tags });
                    } else if (message.type === 'SAVE_TAG') {
                        await tagStorage.saveTag(
                            message.username,
                            message.tag,
                            message.color
                        );
                        // Notify content script to refresh tags
                        const tabs = await browser.tabs.query({
                            url: ['*://*.twitter.com/*', '*://*.x.com/*'],
                        });
                        for (const tab of tabs) {
                            if (tab.id) {
                                try {
                                    await browser.tabs.sendMessage(tab.id, {
                                        type: 'REFRESH_TAGS',
                                    });
                                } catch (_e) {
                                    // Tab might not have content script loaded
                                }
                            }
                        }
                        sendResponse({ success: true });
                    } else if (message.type === 'DELETE_TAG') {
                        await tagStorage.deleteTag(message.username);
                        // Notify content script to refresh tags
                        const tabs = await browser.tabs.query({
                            url: ['*://*.twitter.com/*', '*://*.x.com/*'],
                        });
                        for (const tab of tabs) {
                            if (tab.id) {
                                try {
                                    await browser.tabs.sendMessage(tab.id, {
                                        type: 'REFRESH_TAGS',
                                    });
                                } catch (_e) {
                                    // Tab might not have content script loaded
                                }
                            }
                        }
                        sendResponse({ success: true });
                    } else if (message.type === 'GET_TAG') {
                        const tag = await tagStorage.getTag(message.username);
                        sendResponse({ tag });
                    }
                } catch (error) {
                    sendResponse({ error: (error as Error).message });
                }
            })();
            return true; // Keep message channel open for async response
        }
    );
});
