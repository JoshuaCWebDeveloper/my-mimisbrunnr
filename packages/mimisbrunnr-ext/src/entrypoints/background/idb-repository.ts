export abstract class IdbRepository {
    protected db: IDBDatabase | null = null;
    protected dbName = 'my-mimisbrunnr';
    protected abstract storeName: string;
    protected abstract version: number;
    protected abstract indexes: {
        name: string;
        keyPath: string;
        unique?: boolean;
        primary?: boolean;
        autoIncrement?: boolean;
    }[];

    protected waitFor<T>(request: IDBRequest): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as T);
        });
    }

    protected async init(): Promise<void> {
        const request = indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = async (event: IDBVersionChangeEvent) => {
            const openDbRequest = event.target as IDBOpenDBRequest;
            const db = openDbRequest.result;

            let store: IDBObjectStore | undefined;
            if (!db.objectStoreNames.contains(this.storeName)) {
                const primaryIndex = this.indexes.find(index => index.primary);
                store = db.createObjectStore(this.storeName, {
                    keyPath: primaryIndex?.keyPath ?? 'id',
                    autoIncrement: primaryIndex?.autoIncrement ?? false,
                });
            } else {
                // Use the transaction provided by the event to access the existing store
                store = openDbRequest.transaction?.objectStore(this.storeName);
            }

            // Now you can safely check/create the indexes
            for (const index of this.indexes) {
                if (store && !store.indexNames.contains(index.name)) {
                    store.createIndex(index.name, index.keyPath, {
                        unique: index.unique ?? false,
                    });
                }
            }
        };

        this.db = await this.waitFor(request);
    }

    protected async openStore(
        mode: IDBTransactionMode = 'readwrite',
        options?: IDBTransactionOptions
    ): Promise<IDBObjectStore> {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return this.db
            .transaction([this.storeName], mode, options)
            .objectStore(this.storeName);
    }

    /**
     * Close the database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
