// Sync Service - manages sync state operations and owns SyncStateRepository
import { SyncState } from '../../data-structures';
import { SyncStateRepository } from './sync-repository';

export class SyncService {
    private syncRepo: SyncStateRepository;

    constructor(db: IDBDatabase) {
        this.syncRepo = new SyncStateRepository(db);
    }

    // Public API for other services
    async createSyncState(
        syncData: Omit<SyncState, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<SyncState> {
        const syncState: SyncState = {
            ...syncData,
            id: this.generateUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.syncRepo.create(syncState);
    }

    async getSyncStateById(id: string): Promise<SyncState | null> {
        return await this.syncRepo.getById(id);
    }

    async getSyncStatesByEntityId(entityId: string): Promise<SyncState[]> {
        return await this.syncRepo.getByEntityId(entityId);
    }

    async updateSyncState(
        id: string,
        updates: Partial<SyncState>
    ): Promise<SyncState> {
        return await this.syncRepo.update(id, updates);
    }

    async deleteSyncState(id: string): Promise<void> {
        await this.syncRepo.delete(id);
    }

    // Business logic methods
    async queueSyncOperation(
        entityId: string,
        entityType: SyncState['entityType'],
        operation: SyncState['operation'],
        localVersion: number = 1
    ): Promise<SyncState> {
        // Check if there's already a pending sync for this entity
        const existing = await this.getSyncStatesByEntityId(entityId);
        const pendingSync = existing.find(
            s => s.status === 'pending' || s.status === 'in_progress'
        );

        if (pendingSync) {
            // Update existing sync if needed
            return await this.updateSyncState(pendingSync.id, {
                operation,
                localVersion,
                updatedAt: Date.now(),
            });
        }

        return await this.createSyncState({
            entityType,
            entityId,
            operation,
            status: 'pending',
            localVersion,
            retryCount: 0,
        });
    }

    async markSyncInProgress(syncId: string): Promise<SyncState> {
        return await this.updateSyncState(syncId, {
            status: 'in_progress',
            updatedAt: Date.now(),
        });
    }

    async markSyncCompleted(
        syncId: string,
        remoteVersion?: number
    ): Promise<SyncState> {
        return await this.updateSyncState(syncId, {
            status: 'completed',
            remoteVersion,
            updatedAt: Date.now(),
        });
    }

    async markSyncFailed(
        syncId: string,
        errorMessage: string,
        nextRetryDelay: number = 60000
    ): Promise<SyncState> {
        const syncState = await this.getSyncStateById(syncId);
        if (!syncState) {
            throw new Error(`Sync state ${syncId} not found`);
        }

        const retryCount = syncState.retryCount + 1;
        const maxRetries = 5;

        // Exponential backoff with jitter
        const baseDelay = Math.min(
            nextRetryDelay * Math.pow(2, retryCount - 1),
            300000
        ); // Max 5 minutes
        const jitter = Math.random() * 0.1 * baseDelay;
        const nextRetryAt =
            retryCount < maxRetries
                ? Date.now() + baseDelay + jitter
                : undefined;

        return await this.updateSyncState(syncId, {
            status: 'failed',
            errorMessage,
            retryCount,
            nextRetryAt,
            updatedAt: Date.now(),
        });
    }

    async markSyncConflict(
        syncId: string,
        conflictData: any,
        remoteVersion?: number
    ): Promise<SyncState> {
        return await this.updateSyncState(syncId, {
            status: 'conflict',
            conflictData,
            remoteVersion,
            updatedAt: Date.now(),
        });
    }

    async getPendingSyncOperations(): Promise<SyncState[]> {
        return await this.syncRepo.getPendingSync();
    }

    async getRetryableSyncOperations(): Promise<SyncState[]> {
        return await this.syncRepo.getRetryableSync();
    }

    async getFailedSyncOperations(): Promise<SyncState[]> {
        return await this.syncRepo.getFailedSync();
    }

    async getConflictSyncOperations(): Promise<SyncState[]> {
        return await this.syncRepo.getConflictSync();
    }

    async getSyncOperationsForEntity(entityId: string): Promise<SyncState[]> {
        return await this.getSyncStatesByEntityId(entityId);
    }

    async getSyncOperationsByType(
        entityType: SyncState['entityType']
    ): Promise<SyncState[]> {
        return await this.syncRepo.getByEntityType(entityType);
    }

    async cleanupCompletedSyncStates(
        olderThanMs: number = 86400000
    ): Promise<void> {
        const completed = await this.syncRepo.getCompletedSync();
        const now = Date.now();

        const toDelete = completed.filter(
            sync => now - sync.updatedAt > olderThanMs
        );

        await Promise.all(toDelete.map(sync => this.syncRepo.delete(sync.id)));
    }

    async resetFailedSyncOperation(syncId: string): Promise<SyncState> {
        return await this.updateSyncState(syncId, {
            status: 'pending',
            retryCount: 0,
            nextRetryAt: undefined,
            errorMessage: undefined,
            updatedAt: Date.now(),
        });
    }

    async cancelSyncOperation(syncId: string): Promise<void> {
        await this.deleteSyncState(syncId);
    }

    async getSyncStatistics(): Promise<{
        pending: number;
        inProgress: number;
        completed: number;
        failed: number;
        conflicts: number;
    }> {
        const [pending, inProgress, completed, failed, conflicts] =
            await Promise.all([
                this.syncRepo.getPendingSync(),
                this.syncRepo.getInProgressSync(),
                this.syncRepo.getCompletedSync(),
                this.syncRepo.getFailedSync(),
                this.syncRepo.getConflictSync(),
            ]);

        return {
            pending: pending.length,
            inProgress: inProgress.length,
            completed: completed.length,
            failed: failed.length,
            conflicts: conflicts.length,
        };
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
            /[xy]/g,
            function (c) {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            }
        );
    }
}
