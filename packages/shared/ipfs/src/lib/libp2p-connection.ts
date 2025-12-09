import log from 'loglevel';
import { multiaddr } from '@multiformats/multiaddr';
import type { Connection, Libp2p } from '@libp2p/interface';

/**
 * Connection status enum for tracking perpetual node connection state
 */
export enum ConnectionStatus {
    DISCONNECTED = 'DISCONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    RECONNECTING = 'RECONNECTING',
    FAILED = 'FAILED',
}

/**
 * Libp2p connection manager for perpetual node connectivity
 *
 * This class handles all libp2p-specific logic including:
 * - libp2p initialization configuration
 * - Connection establishment and management
 * - Reconnection logic with exponential backoff
 * - Connection health monitoring
 * - Connection event handling
 *
 * @remarks
 * This class contains NO Helia or IPFS logic - it is purely for libp2p connectivity.
 * The Libp2p instance is passed to the constructor.
 */
export class Libp2pConnection {
    private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = Infinity;
    private reconnectBaseDelay = 1000;
    private reconnectMaxDelay = 30 * 1000;
    private reconnectTimeoutId: NodeJS.Timeout | null = null;
    private isShuttingDown = false;
    private connectionMonitorInterval: NodeJS.Timeout | null = null;
    private currentConnection: Connection | null = null;

    /**
     * Create a new Libp2pConnection instance
     *
     * @param libp2p - The libp2p instance (from Helia)
     * @param addressList - Optional perpetual node multiaddr
     */
    constructor(private libp2p: Libp2p, private address: string) {
        log.info('[Libp2pConnection] Initializing connection manager', {
            peerId: this.libp2p.peerId.toString(),
            address: this.address,
        });

        // Setup connection event listeners
        this.setupConnectionEventListeners();

        // Establish connection
        this.connect().catch(err => {
            log.warn(
                '[Libp2pConnection] Initial connection attempt failed, reconnection will be attempted:',
                err
            );
        });

        // Start connection health monitoring
        this.startConnectionMonitoring();
    }

    /**
     * Setup libp2p connection event listeners for monitoring connection status
     */
    private setupConnectionEventListeners(): void {
        // Listen for peer connections
        this.libp2p.addEventListener('peer:connect', evt => {
            const peerId = evt.detail.toString();
            const connections = this.libp2p.getConnections(evt.detail);

            log.info('[Libp2pConnection] Peer connection event received', {
                peerId,
                totalConnections: connections.length,
                connectionAddrs: connections.map(c => c.remoteAddr.toString()),
            });

            // Check if this is our address
            if (this.address.includes(peerId)) {
                if (this.connectionStatus !== ConnectionStatus.CONNECTED) {
                    log.info(
                        `[Libp2pConnection] Connected to ${this.address} successfully`,
                        {
                            peerId,
                            previousStatus: this.connectionStatus,
                            reconnectAttempts: this.reconnectAttempts,
                        }
                    );
                    this.setConnectionStatus(ConnectionStatus.CONNECTED);
                    this.reconnectAttempts = 0; // Reset reconnect counter on success

                    // Clear any pending reconnect timeout
                    if (this.reconnectTimeoutId !== null) {
                        clearTimeout(this.reconnectTimeoutId);
                        this.reconnectTimeoutId = null;
                        log.debug(
                            '[Libp2pConnection] Cleared pending reconnect timeout'
                        );
                    }
                } else {
                    log.debug(
                        `[Libp2pConnection] Connection event (already connected) for ${this.address}`,
                        { peerId }
                    );
                }
            } else {
                log.debug(
                    `[Libp2pConnection] Peer connected: ${peerId}`,
                    peerId
                );
            }
        });

        // Listen for peer disconnections
        this.libp2p.addEventListener('peer:disconnect', evt => {
            const peerId = evt.detail.toString();

            log.warn('[Libp2pConnection] Peer disconnection event received', {
                peerId,
                currentStatus: this.connectionStatus,
            });

            // Check if this is our address
            if (this.address.includes(peerId)) {
                if (this.connectionStatus === ConnectionStatus.CONNECTED) {
                    log.warn(
                        `[Libp2pConnection] Disconnected from ${this.address} - initiating reconnection`,
                        {
                            peerId,
                            reconnectAttempts: this.reconnectAttempts,
                            maxReconnectAttempts: this.maxReconnectAttempts,
                        }
                    );
                    this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
                    this.scheduleReconnect();
                } else {
                    log.debug(
                        `[Libp2pConnection] Disconnect event (not in CONNECTED state) for ${this.address}`,
                        { peerId, currentStatus: this.connectionStatus }
                    );
                }
            } else {
                log.debug(
                    `[Libp2pConnection] Peer disconnected: ${peerId}`,
                    peerId
                );
            }
        });

        log.info(
            '[Libp2pConnection] Connection event listeners setup complete'
        );
    }

    /**
     * Set connection status and log the change
     */
    private setConnectionStatus(status: ConnectionStatus): void {
        const previousStatus = this.connectionStatus;
        this.connectionStatus = status;

        if (previousStatus !== status) {
            log.info(
                `[Libp2pConnection] Connection status changed: ${previousStatus} → ${status}`,
                {
                    timestamp: new Date().toISOString(),
                    reconnectAttempts: this.reconnectAttempts,
                    maxReconnectAttempts: this.maxReconnectAttempts,
                    activeConnections: this.libp2p.getConnections().length,
                }
            );

            // Log warning for concerning state transitions
            if (status === ConnectionStatus.FAILED) {
                log.error(
                    '[Libp2pConnection] Connection marked as FAILED - manual intervention may be required',
                    {
                        reconnectAttempts: this.reconnectAttempts,
                        maxReconnectAttempts: this.maxReconnectAttempts,
                        address: this.address,
                    }
                );
            } else if (status === ConnectionStatus.RECONNECTING) {
                log.warn('[Libp2pConnection] Entering RECONNECTING state', {
                    attempt: this.reconnectAttempts + 1,
                    maxAttempts: this.maxReconnectAttempts,
                });
            } else if (status === ConnectionStatus.CONNECTED) {
                log.info(
                    '[Libp2pConnection] Successfully established connection to perpetual node',
                    {
                        peerId: this.getPeerId(),
                        address: this.address,
                    }
                );
            }
        }
    }

    /**
     * Start periodic connection health monitoring
     */
    private startConnectionMonitoring(): void {
        // Check connection health every 30 seconds
        this.connectionMonitorInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 30000);

        log.info('[Libp2pConnection] Connection monitoring started');
    }

    /**
     * Stop connection monitoring
     */
    private stopConnectionMonitoring(): void {
        if (this.connectionMonitorInterval !== null) {
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
            log.info('[Libp2pConnection] Connection monitoring stopped');
        }
    }

    /**
     * Check connection health and reconnect if needed
     */
    private async checkConnectionHealth(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        try {
            const connections = this.libp2p.getConnections();
            const addressedConnections = connections.filter(conn => {
                const remotePeer = conn.remotePeer.toString();
                return this.address.includes(remotePeer) ? true : false;
            });

            log.debug('[Libp2pConnection] Connection health check', {
                totalConnections: connections.length,
                addressedConnections: addressedConnections.length,
                currentStatus: this.connectionStatus,
                timestamp: new Date().toISOString(),
            });

            if (addressedConnections.length === 0) {
                if (this.connectionStatus === ConnectionStatus.CONNECTED) {
                    log.warn(
                        '[Libp2pConnection] Connection health check: No active connections to perpetual node detected',
                        {
                            totalConnections: connections.length,
                            lastConnectionStatus:
                                this.currentConnection?.status,
                        }
                    );
                    this.setConnectionStatus(ConnectionStatus.DISCONNECTED);
                    this.scheduleReconnect();
                } else if (
                    this.connectionStatus === ConnectionStatus.DISCONNECTED &&
                    this.reconnectAttempts === 0
                ) {
                    // Handle case where we're disconnected but haven't started reconnecting
                    log.info(
                        '[Libp2pConnection] Connection health check: Still disconnected, initiating reconnection'
                    );
                    this.scheduleReconnect();
                }
            } else {
                // Verify connection quality
                const conn = addressedConnections[0];
                const isHealthy = conn.status === 'open';

                if (!isHealthy) {
                    log.warn(
                        '[Libp2pConnection] Connection health check: Connection exists but may be unhealthy',
                        {
                            status: conn.status,
                            remoteAddr: conn.remoteAddr.toString(),
                        }
                    );
                }

                // Update current connection reference
                this.currentConnection = conn;

                if (this.connectionStatus !== ConnectionStatus.CONNECTED) {
                    log.info(
                        '[Libp2pConnection] Connection health check: Connection restored',
                        {
                            previousStatus: this.connectionStatus,
                            connectionStatus: conn.status,
                            remoteAddr: conn.remoteAddr.toString(),
                        }
                    );
                    this.setConnectionStatus(ConnectionStatus.CONNECTED);
                    this.reconnectAttempts = 0;
                } else {
                    log.debug(
                        '[Libp2pConnection] Connection health check: Connection healthy',
                        {
                            status: conn.status,
                            remoteAddr: conn.remoteAddr.toString(),
                        }
                    );
                }
            }
        } catch (error) {
            log.error(
                '[Libp2pConnection] Error during connection health check:',
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                }
            );
        }
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    private scheduleReconnect(): void {
        if (this.isShuttingDown) {
            log.debug(
                '[Libp2pConnection] Skipping reconnect: service is shutting down'
            );
            return;
        }

        if (
            this.connectionStatus === ConnectionStatus.RECONNECTING ||
            this.connectionStatus === ConnectionStatus.CONNECTING
        ) {
            log.debug(
                '[Libp2pConnection] Skipping reconnect: already attempting connection',
                { currentStatus: this.connectionStatus }
            );
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            log.error(
                `[Libp2pConnection] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Marking connection as FAILED.`,
                {
                    reconnectAttempts: this.reconnectAttempts,
                    address: this.address,
                }
            );
            this.setConnectionStatus(ConnectionStatus.FAILED);
            return;
        }

        // Clear any existing reconnect timeout
        if (this.reconnectTimeoutId !== null) {
            log.debug('[Libp2pConnection] Clearing existing reconnect timeout');
            clearTimeout(this.reconnectTimeoutId);
        }

        // Calculate exponential backoff delay
        const delay = Math.min(
            this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
            this.reconnectMaxDelay
        );

        log.info(
            `[Libp2pConnection] Scheduling reconnection attempt ${
                this.reconnectAttempts + 1
            }/${this.maxReconnectAttempts} in ${delay}ms (${(
                delay / 1000
            ).toFixed(1)}s)`,
            {
                currentStatus: this.connectionStatus,
                delay,
                attempt: this.reconnectAttempts + 1,
                maxAttempts: this.maxReconnectAttempts,
                address: this.address,
            }
        );

        this.setConnectionStatus(ConnectionStatus.RECONNECTING);

        this.reconnectTimeoutId = setTimeout(() => {
            this.reconnectAttempts++;
            this.attemptReconnect();
        }, delay);
    }

    /**
     * Attempt to reconnect to the perpetual node
     */
    private async attemptReconnect(): Promise<void> {
        const attemptNumber = this.reconnectAttempts;

        if (this.isShuttingDown) {
            log.debug(
                '[Libp2pConnection] Aborting reconnect: service is shutting down'
            );
            return;
        }

        if (!this.address) {
            log.error(
                '[Libp2pConnection] Cannot reconnect: no addresses configured'
            );
            return;
        }

        log.info(
            `[Libp2pConnection] Attempting reconnection (attempt ${attemptNumber}/${this.maxReconnectAttempts})`,
            {
                address: this.address,
                timestamp: new Date().toISOString(),
            }
        );

        try {
            await this.connect();

            log.info(
                `[Libp2pConnection] Reconnection attempt ${attemptNumber} succeeded`,
                {
                    attemptsUsed: this.reconnectAttempts,
                }
            );
        } catch (error) {
            log.warn(
                `[Libp2pConnection] Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts} failed`,
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    errorType: error?.constructor?.name,
                    attemptsRemaining:
                        this.maxReconnectAttempts - this.reconnectAttempts,
                }
            );

            // Schedule next reconnection attempt
            this.scheduleReconnect();
        }
    }

    /**
     * Connect to perpetual node via libp2p
     */
    async connect(): Promise<void> {
        if (!this.address) {
            throw new Error('No address configured');
        }

        if (this.connectionStatus === ConnectionStatus.CONNECTING) {
            log.debug(
                '[Libp2pConnection] Connection attempt already in progress, skipping'
            );
            return;
        }

        try {
            this.setConnectionStatus(ConnectionStatus.CONNECTING);

            log.info(
                '[Libp2pConnection] Connecting to perpetual node via libp2p:',
                this.address
            );

            // Parse multiaddr and connect
            const ma = multiaddr(this.address);

            log.info('[Libp2pConnection] Parsed multiaddr:', ma.toString());

            // Attempt connection with timeout
            log.info('[Libp2pConnection] Starting dial attempt...');
            const connection = await this.libp2p.dial(ma);

            this.currentConnection = connection;
            this.setConnectionStatus(ConnectionStatus.CONNECTED);
            this.reconnectAttempts = 0; // Reset on successful connection

            log.info(
                '[Libp2pConnection] Successfully connected to perpetual node',
                {
                    remoteAddr: connection.remoteAddr.toString(),
                    remotePeer: connection.remotePeer.toString(),
                    status: connection.status,
                }
            );
        } catch (error) {
            // Enhanced error logging
            log.error(
                '[Libp2pConnection] Failed to connect to perpetual node:',
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    errorType: error?.constructor?.name,
                    stack: error instanceof Error ? error.stack : undefined,
                    attempt: this.reconnectAttempts,
                }
            );

            // Log additional debugging info
            const peers = await this.libp2p.peerStore.all();
            log.info(
                '[Libp2pConnection] Current peer store has',
                peers.length,
                'peers'
            );

            const connections = this.libp2p.getConnections();
            log.info(
                '[Libp2pConnection] Current active connections:',
                connections.length
            );

            this.setConnectionStatus(ConnectionStatus.DISCONNECTED);

            // Re-throw to allow caller to handle
            throw error;
        }
    }

    /**
     * Manually trigger a reconnection attempt
     * Useful for testing or manual recovery
     */
    async reconnect(): Promise<void> {
        if (!this.address) {
            throw new Error('No address configured');
        }

        log.info('[Libp2pConnection] Manual reconnection triggered', {
            currentStatus: this.connectionStatus,
            previousReconnectAttempts: this.reconnectAttempts,
        });

        // Reset reconnect attempts for manual reconnection
        this.reconnectAttempts = 0;

        // Clear any pending reconnect timeout
        if (this.reconnectTimeoutId !== null) {
            log.debug(
                '[Libp2pConnection] Clearing pending reconnect timeout for manual reconnection'
            );
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }

        // Close existing connection if present
        if (this.currentConnection) {
            try {
                log.info(
                    '[Libp2pConnection] Closing existing connection before manual reconnect'
                );
                await this.currentConnection.close();
                this.currentConnection = null;
            } catch (error) {
                log.warn(
                    '[Libp2pConnection] Error closing existing connection:',
                    error
                );
            }
        }

        await this.connect();
    }

    /**
     * Shutdown the connection manager
     */
    async shutdown(): Promise<void> {
        try {
            log.info('[Libp2pConnection] Shutting down connection manager...');

            // Set shutdown flag to prevent reconnection attempts
            this.isShuttingDown = true;

            // Stop connection monitoring
            this.stopConnectionMonitoring();

            // Clear any pending reconnect timeout
            if (this.reconnectTimeoutId !== null) {
                clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = null;
            }

            // Close current connection if exists
            if (this.currentConnection) {
                try {
                    await this.currentConnection.close();
                    log.info(
                        '[Libp2pConnection] Closed connection to perpetual node'
                    );
                } catch (error) {
                    log.warn(
                        '[Libp2pConnection] Error closing connection:',
                        error
                    );
                }
                this.currentConnection = null;
            }

            this.setConnectionStatus(ConnectionStatus.DISCONNECTED);

            log.info(
                '[Libp2pConnection] Connection manager shut down successfully'
            );
        } catch (error) {
            log.error(
                '[Libp2pConnection] Failed to shutdown connection manager:',
                error
            );
            throw error;
        }
    }

    /**
     * Get the peer ID
     */
    getPeerId(): string {
        return this.libp2p.peerId.toString();
    }

    /**
     * Get current connection status
     */
    getConnectionStatus(): ConnectionStatus {
        return this.connectionStatus;
    }

    /**
     * Get connection statistics and health information
     */
    getConnectionInfo(): {
        status: ConnectionStatus;
        reconnectAttempts: number;
        maxReconnectAttempts: number;
        isConnected: boolean;
        currentConnectionInfo: {
            remoteAddr: string;
            remotePeer: string;
            status: string;
        } | null;
        totalConnections: number;
    } {
        return {
            status: this.connectionStatus,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            isConnected: this.connectionStatus === ConnectionStatus.CONNECTED,
            currentConnectionInfo: this.currentConnection
                ? {
                      remoteAddr: this.currentConnection.remoteAddr.toString(),
                      remotePeer: this.currentConnection.remotePeer.toString(),
                      status: this.currentConnection.status,
                  }
                : null,
            totalConnections: this.libp2p.getConnections().length,
        };
    }
}
