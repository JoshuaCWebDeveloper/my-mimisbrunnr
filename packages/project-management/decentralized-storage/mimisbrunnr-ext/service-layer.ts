// DEPRECATED: This file has been replaced by feature-based services
// New architecture: services/decentralized-sync/decentralized-sync-service.ts
//
// The service layer has been redesigned with these key changes:
// 1. Each service owns its repository (single ownership principle)
// 2. Services communicate through public APIs, not direct repository access
// 3. DecentralizedSyncService coordinates between services without owning repositories
// 4. Feature-based organization for better maintainability
//
// Migration guide:
// - DecentralizedSyncService → services/decentralized-sync/decentralized-sync-service.ts
// - Now takes service dependencies instead of repository dependencies
// - Enhanced with comprehensive sync workflows and error handling

export * from './services';
