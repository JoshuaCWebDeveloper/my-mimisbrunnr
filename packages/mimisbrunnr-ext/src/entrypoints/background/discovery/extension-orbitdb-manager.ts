import log from 'loglevel';
import {
    OrbitDbManager,
    type OrbitDbManagerConfig,
} from '@my-mimisbrunnr/orbitdb';

/**
 * OrbitDB Service for MM-30 (Browser Extension)
 *
 * This service extends the shared OrbitDbManager to provide OrbitDB functionality
 * specific to the browser extension environment.
 *
 * Architecture (per implementation plan):
 * - Extends shared OrbitDbManager base class
 * - Uses existing Helia connection from IpfsService (established in MM-27)
 * - Opens 'xcom-taglist-discovery' log database with public write access
 * - Enables pubsub replication to communicate with orbitdb-service via Kubo
 * - Kubo acts as pubsub hub, relaying OrbitDB messages between extension and perpetual node
 *
 * Connection Flow:
 * Extension (Helia + OrbitDB) ← WebTransport → Kubo ← orbitdb-service
 *                                   ↑
 *                              pubsub relay
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-36): No pubsub message validation - OrbitDB messages not validated against schemas
 * - TODO(MM-36): No message de-duplication - duplicate discovery records not filtered
 * - TODO(MM-36): No rate limiting - no protection against discovery record spam
 * - TODO(MM-34): No caching - OrbitDB queries always scan full log
 * - TODO(MM-33): No service architecture - discovery logic not in dedicated service layer yet
 * TODO(MM-36): Add retry logic with exponential backoff for initialization failures
 * TODO(MM-36): Add connection health monitoring
 * TODO(MM-36): Add telemetry for OrbitDB operations
 */
export class ExtensionOrbitDbManager extends OrbitDbManager {
    constructor() {
        const config: OrbitDbManagerConfig = {
            logName: 'xcom-taglist-discovery',
            // Browser uses IndexedDB, no custom directory needed
        };
        super(config);
    }

    /**
     * Setup event listeners for OrbitDB replication events
     *
     * @remarks
     * Implements abstract method from OrbitDbManager.
     * Sets up listeners for the 'update' event to monitor replication.
     *
     * TODO(MM-36): Add comprehensive event handling for monitoring
     */
    protected async setupEventListeners(): Promise<void> {
        if (!this.discoveryLog) {
            return;
        }

        // OrbitDB v3 uses 'update' events
        this.addEventListener('update', async (entry: unknown) => {
            const typedEntry = entry as { hash: string };
            log.debug(
                '[ExtensionOrbitDbManager] Discovery log updated:',
                typedEntry.hash
            );
            // TODO(MM-36): Validate incoming entries
            // TODO(MM-36): De-duplicate entries
            // TODO(MM-34): Update cache
        });

        this.addEventListener('join', (peerId: unknown, heads: unknown) => {
            log.info(
                '[ExtensionOrbitDbManager] Peer joined discovery log:',
                peerId,
                heads
            );
        });

        log.debug('[ExtensionOrbitDbManager] Event listeners set up');
    }

    /**
     * Logging implementation using loglevel
     *
     * @remarks
     * Implements abstract method from OrbitDbManager.
     * Uses loglevel which is appropriate for browser environment.
     */
    protected log(
        level: 'debug' | 'info' | 'warn' | 'error',
        message: string,
        context?: Record<string, unknown>
    ): void {
        const logMessage = context
            ? `${message} ${JSON.stringify(context)}`
            : message;

        switch (level) {
            case 'debug':
                log.debug(`[ExtensionOrbitDbManager] ${logMessage}`);
                break;
            case 'info':
                log.info(`[ExtensionOrbitDbManager] ${logMessage}`);
                break;
            case 'warn':
                log.warn(`[ExtensionOrbitDbManager] ${logMessage}`);
                break;
            case 'error':
                log.error(`[ExtensionOrbitDbManager] ${logMessage}`);
                break;
        }
    }
}
