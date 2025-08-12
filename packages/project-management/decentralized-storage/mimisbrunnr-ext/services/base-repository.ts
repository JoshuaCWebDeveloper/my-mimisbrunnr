// Base repository interface and implementation
export interface IRepository<T> {
    create(item: T): Promise<T>;
    getById(id: string): Promise<T | null>;
    getAll(): Promise<T[]>;
    update(id: string, updates: Partial<T>): Promise<T>;
    delete(id: string): Promise<void>;
    query(filter: Partial<T>): Promise<T[]>;
    count(): Promise<number>;
}

// Abstract base repository with common IndexedDB operations
export abstract class BaseRepository<T extends { id: string }>
    implements IRepository<T>
{
    protected db: IDBDatabase;
    protected storeName: string;

    constructor(db: IDBDatabase, storeName: string) {
        this.db = db;
        this.storeName = storeName;
    }

    async create(item: T): Promise<T> {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        await store.add(item);
        return item;
    }

    async getById(id: string): Promise<T | null> {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const result = await store.get(id);
        return result || null;
    }

    async getAll(): Promise<T[]> {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        return await store.getAll();
    }

    async update(id: string, updates: Partial<T>): Promise<T> {
        const existing = await this.getById(id);
        if (!existing) throw new Error(`Item with id ${id} not found`);

        const updated = { ...existing, ...updates, updatedAt: Date.now() };
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        await store.put(updated);
        return updated;
    }

    async delete(id: string): Promise<void> {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        await store.delete(id);
    }

    async query(filter: Partial<T>): Promise<T[]> {
        const all = await this.getAll();
        return all.filter(item =>
            Object.entries(filter).every(
                ([key, value]) => item[key as keyof T] === value
            )
        );
    }

    async count(): Promise<number> {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        return await store.count();
    }

    // Helper method for index-based queries
    protected async getByIndex<K extends keyof T>(
        indexName: string,
        value: T[K]
    ): Promise<T[]> {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index(indexName);
        return await index.getAll(value);
    }
}
