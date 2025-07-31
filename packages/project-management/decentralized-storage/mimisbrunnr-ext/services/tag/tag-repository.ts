// Tag Repository - manages tags store
import { Tag } from '../../data-structures';
import { BaseRepository } from '../base-repository';

export class TagRepository extends BaseRepository<Tag> {
    constructor(db: IDBDatabase) {
        super(db, 'tags');
    }

    async getByOwner(ownerId: string): Promise<Tag[]> {
        return await this.getByIndex('owner', ownerId);
    }

    async getByUsername(username: string): Promise<Tag[]> {
        return await this.getByIndex('username', username);
    }

    async getByLabel(label: string): Promise<Tag[]> {
        return await this.getByIndex('label', label);
    }

    async getPendingSyncTags(): Promise<Tag[]> {
        return await this.getByIndex('syncStatus', 'pending');
    }

    async getSyncedTags(): Promise<Tag[]> {
        return await this.getByIndex('syncStatus', 'synced');
    }

    async getConflictTags(): Promise<Tag[]> {
        return await this.getByIndex('syncStatus', 'conflict');
    }
}
