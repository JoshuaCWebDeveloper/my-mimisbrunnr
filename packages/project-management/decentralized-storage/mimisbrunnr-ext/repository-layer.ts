// DEPRECATED: This file has been replaced by feature-based services
// New architecture: /services/ directory with feature-based organization
//
// Migration guide:
// - UserRepository → services/user/user-repository.ts
// - TagRepository → services/tag/tag-repository.ts
// - SubscriptionRepository → services/subscription/subscription-repository.ts
// - Cache repositories → services/cache/cache-repositories.ts
// - SyncStateRepository → services/sync/sync-repository.ts
// - BaseRepository → services/base-repository.ts
//
// Use services instead of direct repository access:
// - UserService for user operations
// - TagService for tag operations
// - SubscriptionService for subscription operations
// - CacheService for cache operations
// - SyncService for sync state operations

export * from './services';
