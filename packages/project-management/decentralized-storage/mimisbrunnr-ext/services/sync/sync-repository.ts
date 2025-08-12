// Sync Repository - manages syncStates store
import { SyncState } from '../../data-structures';
import { BaseRepository } from '../base-repository';

export class SyncStateRepository extends BaseRepository<SyncState> {
    constructor(db: IDBDatabase) {
        super(db, 'syncStates');
    }

    async getByEntityType(
        entityType: SyncState['entityType']
    ): Promise<SyncState[]> {
        return await this.getByIndex('entityType', entityType);
    }

    async getByEntityId(entityId: string): Promise<SyncState[]> {
        return await this.getByIndex('entityId', entityId);
    }

    async getByStatus(status: SyncState['status']): Promise<SyncState[]> {
        return await this.getByIndex('status', status);
    }

    async getPendingSync(): Promise<SyncState[]> {
        return await this.getByStatus('pending');
    }

    async getInProgressSync(): Promise<SyncState[]> {
        return await this.getByStatus('in_progress');
    }

    async getFailedSync(): Promise<SyncState[]> {
        return await this.getByStatus('failed');
    }

    async getCompletedSync(): Promise<SyncState[]> {
        return await this.getByStatus('completed');
    }

    async getConflictSync(): Promise<SyncState[]> {
        return await this.getByStatus('conflict');
    }

    async getRetryableSync(): Promise<SyncState[]> {
        const now = Date.now();
        const failed = await this.getFailedSync();
        return failed.filter(
            sync => sync.nextRetryAt && sync.nextRetryAt <= now
        );
    }
}
