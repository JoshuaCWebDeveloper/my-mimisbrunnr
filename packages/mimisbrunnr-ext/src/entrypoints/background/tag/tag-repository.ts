import type { CreateTag, Tag } from '@my-mimisbrunnr/protocol';
import { IdbRepository } from '../idb-repository.js';

enum IndexName {
    Username = 'username_idx',
}

// Storage service for tags
export class TagRepository extends IdbRepository {
    protected override readonly storeName = 'tags';
    protected override readonly version = 3;
    protected override readonly indexes = [
        { name: 'id', keyPath: 'id', primary: true },
        { name: IndexName.Username, keyPath: 'username' },
    ];

    async list(): Promise<Tag[]> {
        const store = await this.openStore();

        const request = store.getAll();

        const tags = (await this.waitFor(request)) as Tag[];

        return tags;
    }

    async listByUsername(username: string): Promise<Tag[]> {
        const store = await this.openStore();
        const index = store.index(IndexName.Username);

        const request = index.getAll(username);

        const tags = (await this.waitFor(request)) as Tag[];

        return tags;
    }

    async get(id: string): Promise<Tag | null> {
        const store = await this.openStore();

        const request = store.get(id);

        const tag = (await this.waitFor(request)) as Tag | null;

        return tag;
    }

    async upsert(tagUpsert: CreateTag | Tag): Promise<Tag> {
        const store = await this.openStore();

        // convert to tag safely
        const tag: Tag =
            'id' in tagUpsert && tagUpsert.id
                ? (tagUpsert as Tag)
                : {
                      ...tagUpsert,
                      id: crypto.randomUUID(),
                      createdAt: new Date(),
                      updatedAt: new Date(),
                  };

        const request = store.put(tag);

        const savedTag = (await this.waitFor(request)) as Tag;

        return savedTag;
    }

    async delete(id: string): Promise<void> {
        const store = await this.openStore();

        const request = store.delete(id);

        await this.waitFor(request);
    }

    async clear(): Promise<void> {
        const store = await this.openStore();

        const request = store.clear();

        await this.waitFor(request);
    }

    async importTags(
        tags: CreateTag[],
        mode: 'merge' | 'overwrite'
    ): Promise<{ imported: number; total: number }> {
        if (mode === 'overwrite') {
            // Clear all existing tags
            await this.clear();
        }

        // Get existing tags for merge mode
        const existingTags = mode === 'merge' ? await this.list() : [];
        const existingTagKeys = new Set(
            existingTags.map(t => `${t.username}:${t.name}`.toLowerCase())
        );

        let imported = 0;

        for (const tag of tags) {
            const tagKey = `${tag.username}:${tag.name}`.toLowerCase();

            // Skip duplicates in merge mode
            if (mode === 'merge' && existingTagKeys.has(tagKey)) {
                continue;
            }

            await this.upsert(tag);
            imported++;
        }

        return { imported, total: tags.length };
    }
}
