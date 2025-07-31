// User Repository - manages users store
import { User } from '../../data-structures';
import { BaseRepository } from '../base-repository';

export class UserRepository extends BaseRepository<User> {
    constructor(db: IDBDatabase) {
        super(db, 'users');
    }

    async getByDID(did: string): Promise<User | null> {
        const users = await this.getByIndex('did', did);
        return users[0] || null;
    }

    async getByHandle(handle: string): Promise<User | null> {
        const users = await this.getByIndex('handle', handle);
        return users[0] || null;
    }

    async getCurrentUser(): Promise<User | null> {
        const users = await this.getByIndex('isMe', true);
        return users[0] || null;
    }

    async getVerifiedUsers(): Promise<User[]> {
        return await this.getByIndex('verified', true);
    }
}
