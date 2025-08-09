// Tag Service - manages tag-related operations and owns TagRepository
import { Tag } from '../../data-structures';
import { TagRepository } from './tag-repository';

export class TagService {
    private tagRepo: TagRepository;

    constructor(db: IDBDatabase) {
        this.tagRepo = new TagRepository(db);
    }

    // Public API for other services
    async createTag(
        tagData: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Tag> {
        const tag: Tag = {
            ...tagData,
            id: this.generateUUID(),
            syncStatus: 'pending', // New tags start as pending sync
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        return await this.tagRepo.create(tag);
    }

    async getTagById(id: string): Promise<Tag | null> {
        return await this.tagRepo.getById(id);
    }

    async getTagsByOwner(ownerId: string): Promise<Tag[]> {
        return await this.tagRepo.getByOwner(ownerId);
    }

    async getTagsByUsername(username: string): Promise<Tag[]> {
        return await this.tagRepo.getByUsername(username);
    }

    async getTagsByLabel(label: string): Promise<Tag[]> {
        return await this.tagRepo.getByLabel(label);
    }

    async getAllTags(): Promise<Tag[]> {
        return await this.tagRepo.getAll();
    }

    async updateTag(id: string, updates: Partial<Tag>): Promise<Tag> {
        // If content is being updated, mark as pending sync
        if (updates.label || updates.color || updates.description) {
            updates.syncStatus = 'pending';
        }
        return await this.tagRepo.update(id, updates);
    }

    async deleteTag(id: string): Promise<void> {
        await this.tagRepo.delete(id);
    }

    // Business logic methods
    async getMyTags(currentUserId: string): Promise<Tag[]> {
        return await this.getTagsByOwner(currentUserId);
    }

    async getPendingSyncTags(): Promise<Tag[]> {
        return await this.tagRepo.getPendingSyncTags();
    }

    async getSyncedTags(): Promise<Tag[]> {
        return await this.tagRepo.getSyncedTags();
    }

    async getConflictTags(): Promise<Tag[]> {
        return await this.tagRepo.getConflictTags();
    }

    async markTagsSynced(tagIds: string[]): Promise<void> {
        await Promise.all(
            tagIds.map(id =>
                this.updateTag(id, {
                    syncStatus: 'synced',
                    lastSyncedAt: Date.now(),
                })
            )
        );
    }

    async markTagConflict(tagId: string, conflictData?: any): Promise<Tag> {
        return await this.updateTag(tagId, {
            syncStatus: 'conflict',
            // Note: conflictData would need to be added to Tag interface if needed
        });
    }

    async searchTags(query: string): Promise<Tag[]> {
        const allTags = await this.getAllTags();
        const lowerQuery = query.toLowerCase();

        return allTags.filter(
            tag =>
                tag.label.toLowerCase().includes(lowerQuery) ||
                tag.username.toLowerCase().includes(lowerQuery) ||
                (tag.description &&
                    tag.description.toLowerCase().includes(lowerQuery))
        );
    }

    async getTagsForUser(
        username: string,
        currentUserId?: string
    ): Promise<Tag[]> {
        const userTags = await this.getTagsByUsername(username);

        // If it's the current user, return all tags
        if (currentUserId) {
            const currentUser = userTags.find(
                tag => tag.owner === currentUserId
            );
            if (currentUser) {
                return userTags;
            }
        }

        // For other users, only return synced tags (public tags)
        return userTags.filter(tag => tag.syncStatus === 'synced');
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
