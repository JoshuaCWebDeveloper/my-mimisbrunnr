import { CreateTag, Tag } from '../../messenger.js';

enum IndexName {
    Username = 'username_idx',
}

// Storage service for tags
export class TagRepository {
    private db: IDBDatabase | null = null;
    private readonly dbName = 'my-mimisbrunnr';
    private readonly storeName = 'tags';
    private readonly version = 1;

    private waitFor<T>(request: IDBRequest): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as T);
        });
    }

    private async init(): Promise<void> {
        const request = indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(this.storeName)) {
                const store = db.createObjectStore(this.storeName, {
                    keyPath: 'id',
                });

                // Create index
                store.createIndex(IndexName.Username, 'username', {
                    unique: false,
                });
            }
        };

        this.db = await this.waitFor(request);
    }

    private async getStore(): Promise<IDBObjectStore> {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return this.db
            .transaction([this.storeName], 'readwrite')
            .objectStore(this.storeName);
    }

    async list(): Promise<Tag[]> {
        const store = await this.getStore();

        const request = store.getAll();

        const tags = (await this.waitFor(request)) as Tag[];

        return tags;
    }

    async listByUsername(username: string): Promise<Tag[]> {
        const store = await this.getStore();
        const index = store.index(IndexName.Username);

        const request = index.getAll(username);

        const tags = (await this.waitFor(request)) as Tag[];

        return tags;
    }

    async get(id: string): Promise<Tag | null> {
        const store = await this.getStore();

        const request = store.get(id);

        const tag = (await this.waitFor(request)) as Tag | null;

        return tag;
    }

    async upsert(tag: CreateTag | Tag): Promise<Tag> {
        const store = await this.getStore();

        if (!tag.id) {
            tag.id = crypto.randomUUID();
        }

        const request = store.put(tag);

        const savedTag = (await this.waitFor(request)) as Tag;

        return savedTag;
    }

    async delete(id: string): Promise<void> {
        const store = await this.getStore();

        const request = store.delete(id);

        await this.waitFor(request);
    }
}
