// Subscription Service - manages subscription-related operations and owns SubscriptionRepository
import { Subscription } from '../../data-structures';
import { SubscriptionRepository } from './subscription-repository';

export class SubscriptionService {
    private subscriptionRepo: SubscriptionRepository;

    constructor(db: IDBDatabase) {
        this.subscriptionRepo = new SubscriptionRepository(db);
    }

    // Public API for other services
    async createSubscription(
        subscriptionData: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Subscription> {
        // Check if subscription already exists for this user
        const existing = await this.getSubscriptionByUserId(
            subscriptionData.userId
        );
        if (existing) {
            throw new Error(
                `Subscription already exists for user ${subscriptionData.userId}`
            );
        }

        const subscription: Subscription = {
            ...subscriptionData,
            id: this.generateUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return await this.subscriptionRepo.create(subscription);
    }

    async getSubscriptionById(id: string): Promise<Subscription | null> {
        return await this.subscriptionRepo.getById(id);
    }

    async getSubscriptionByUserId(
        userId: string
    ): Promise<Subscription | null> {
        return await this.subscriptionRepo.getByUserId(userId);
    }

    async getAllSubscriptions(): Promise<Subscription[]> {
        return await this.subscriptionRepo.getAll();
    }

    async getActiveSubscriptions(): Promise<Subscription[]> {
        return await this.subscriptionRepo.getActiveSubscriptions();
    }

    async getSyncEnabledSubscriptions(): Promise<Subscription[]> {
        return await this.subscriptionRepo.getSyncEnabledSubscriptions();
    }

    async updateSubscription(
        id: string,
        updates: Partial<Subscription>
    ): Promise<Subscription> {
        return await this.subscriptionRepo.update(id, updates);
    }

    async deleteSubscription(id: string): Promise<void> {
        await this.subscriptionRepo.delete(id);
    }

    // Business logic methods
    async subscribeToUser(
        userId: string,
        syncEnabled: boolean = true
    ): Promise<Subscription> {
        return await this.createSubscription({
            userId,
            isActive: true,
            syncEnabled,
            lastFetchedAt: undefined,
        });
    }

    async unsubscribeFromUser(userId: string): Promise<void> {
        const subscription = await this.getSubscriptionByUserId(userId);
        if (subscription) {
            await this.deleteSubscription(subscription.id);
        }
    }

    async activateSubscription(userId: string): Promise<Subscription> {
        const subscription = await this.getSubscriptionByUserId(userId);
        if (!subscription) {
            throw new Error(`No subscription found for user ${userId}`);
        }

        return await this.updateSubscription(subscription.id, {
            isActive: true,
            updatedAt: Date.now(),
        });
    }

    async deactivateSubscription(userId: string): Promise<Subscription> {
        const subscription = await this.getSubscriptionByUserId(userId);
        if (!subscription) {
            throw new Error(`No subscription found for user ${userId}`);
        }

        return await this.updateSubscription(subscription.id, {
            isActive: false,
            updatedAt: Date.now(),
        });
    }

    async toggleSyncEnabled(
        userId: string,
        syncEnabled: boolean
    ): Promise<Subscription> {
        const subscription = await this.getSubscriptionByUserId(userId);
        if (!subscription) {
            throw new Error(`No subscription found for user ${userId}`);
        }

        return await this.updateSubscription(subscription.id, {
            syncEnabled,
            updatedAt: Date.now(),
        });
    }

    async updateLastFetched(userId: string): Promise<Subscription> {
        const subscription = await this.getSubscriptionByUserId(userId);
        if (!subscription) {
            throw new Error(`No subscription found for user ${userId}`);
        }

        return await this.updateSubscription(subscription.id, {
            lastFetchedAt: Date.now(),
            updatedAt: Date.now(),
        });
    }

    async getSubscriptionsNeedingRefresh(
        maxAge: number = 3600000
    ): Promise<Subscription[]> {
        const activeSubscriptions = await this.getActiveSubscriptions();
        const now = Date.now();

        return activeSubscriptions.filter(
            sub =>
                sub.syncEnabled &&
                (!sub.lastFetchedAt || now - sub.lastFetchedAt > maxAge)
        );
    }

    async isSubscribedToUser(userId: string): Promise<boolean> {
        const subscription = await this.getSubscriptionByUserId(userId);
        return subscription !== null && subscription.isActive;
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
