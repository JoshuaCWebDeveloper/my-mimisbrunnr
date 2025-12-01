const waitForIdbRequest = <T>(request: IDBRequest<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T);
    });
};

export type IdbStoreSpec = {
    name: string;
    indexes: {
        name: string;
        keyPath: string;
        unique?: boolean;
        primary?: boolean;
        autoIncrement?: boolean;
    }[];
};

class IdbFactory {
    private readonly dbName = 'my-mimisbrunnr';
    private readonly version = 5;

    private storeSpecs: IdbStoreSpec[] = [];

    registerStore(store: IdbStoreSpec) {
        this.storeSpecs.push(store);
    }

    async createDatabase(): Promise<IDBDatabase> {
        const request = indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = async (event: IDBVersionChangeEvent) => {
            const openDbRequest = event.target as IDBOpenDBRequest;
            const db = openDbRequest.result;

            for (const storeSpec of this.storeSpecs) {
                const { name, indexes } = storeSpec;

                let store: IDBObjectStore | undefined;
                if (!db.objectStoreNames.contains(name)) {
                    const primaryIndex = indexes.find(index => index.primary);
                    store = db.createObjectStore(name, {
                        keyPath: primaryIndex?.keyPath ?? 'id',
                        autoIncrement: primaryIndex?.autoIncrement ?? false,
                    });
                } else {
                    // Use the transaction provided by the event to access the existing store
                    store = openDbRequest.transaction?.objectStore(name);
                }

                // Now you can safely check/create the indexes
                for (const index of indexes) {
                    if (index.primary) {
                        continue;
                    }

                    if (store && !store.indexNames.contains(index.name)) {
                        store.createIndex(index.name, index.keyPath, {
                            unique: index.unique ?? false,
                        });
                    }
                }
            }
        };

        return waitForIdbRequest(request);
    }
}

const idbFactory = new IdbFactory();

export abstract class IdbRepository {
    protected db: IDBDatabase | null = null;

    constructor(private storeSpec: IdbStoreSpec) {
        idbFactory.registerStore(storeSpec);
    }

    protected waitFor<T>(request: IDBRequest): Promise<T> {
        return waitForIdbRequest(request);
    }

    protected async init(): Promise<void> {
        this.db = await idbFactory.createDatabase();
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
            .transaction([this.storeSpec.name], mode, options)
            .objectStore(this.storeSpec.name);
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
