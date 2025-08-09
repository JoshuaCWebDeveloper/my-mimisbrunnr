// User Service - manages user-related operations and owns UserRepository
import { User } from '../../data-structures';
import { UserRepository } from './user-repository';

export class UserService {
    private userRepo: UserRepository;

    constructor(db: IDBDatabase) {
        this.userRepo = new UserRepository(db);
    }

    // Public API for other services
    async createUser(
        userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<User> {
        const user: User = {
            ...userData,
            id: this.generateUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        return await this.userRepo.create(user);
    }

    async getUserById(id: string): Promise<User | null> {
        return await this.userRepo.getById(id);
    }

    async getUserByDID(did: string): Promise<User | null> {
        return await this.userRepo.getByDID(did);
    }

    async getUserByHandle(handle: string): Promise<User | null> {
        return await this.userRepo.getByHandle(handle);
    }

    async getCurrentUser(): Promise<User | null> {
        return await this.userRepo.getCurrentUser();
    }

    async getVerifiedUsers(): Promise<User[]> {
        return await this.userRepo.getVerifiedUsers();
    }

    async updateUser(id: string, updates: Partial<User>): Promise<User> {
        return await this.userRepo.update(id, updates);
    }

    async deleteUser(id: string): Promise<void> {
        await this.userRepo.delete(id);
    }

    async getAllUsers(): Promise<User[]> {
        return await this.userRepo.getAll();
    }

    // Business logic methods
    async setCurrentUser(userId: string): Promise<User> {
        // First, unset any existing current user
        const existingCurrentUser = await this.getCurrentUser();
        if (existingCurrentUser && existingCurrentUser.id !== userId) {
            await this.updateUser(existingCurrentUser.id, { isMe: false });
        }

        // Set the new current user
        return await this.updateUser(userId, { isMe: true });
    }

    async verifyUser(userId: string, proofUrl: string): Promise<User> {
        return await this.updateUser(userId, {
            verified: true,
            proofUrl,
            updatedAt: Date.now(),
        });
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
