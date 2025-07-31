// Subscription Repository - manages subscriptions store
import { Subscription } from '../../data-structures';
import { BaseRepository } from '../base-repository';

export class SubscriptionRepository extends BaseRepository<Subscription> {
    constructor(db: IDBDatabase) {
        super(db, 'subscriptions');
    }

    async getByUserId(userId: string): Promise<Subscription | null> {
        const subscriptions = await this.getByIndex('userId', userId);
        return subscriptions[0] || null;
    }

    async getActiveSubscriptions(): Promise<Subscription[]> {
        return await this.getByIndex('isActive', true);
    }

    async getInactiveSubscriptions(): Promise<Subscription[]> {
        return await this.getByIndex('isActive', false);
    }

    async getSyncEnabledSubscriptions(): Promise<Subscription[]> {
        return await this.getByIndex('syncEnabled', true);
    }

    async getSyncDisabledSubscriptions(): Promise<Subscription[]> {
        return await this.getByIndex('syncEnabled', false);
    }
}
