import { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { MessageType } from '../../../../../messenger.js';
import { useMessenger } from '../../context/messenger.js';

const StyledDiscoveryStatus = styled.div`
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    display: flex;
    flex-direction: column;
    margin-top: var(--space-4);

    .status-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex: 1;
        min-width: 1px;
    }

    .status-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: var(--space-2);
        border-radius: 50%;

        &.online {
            background-color: rgb(34, 197, 94);
            box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
        }

        &.offline {
            background-color: rgb(239, 68, 68);
            box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
        }
    }

    .status-label {
        color: var(--color-text-secondary);
        font-weight: var(--font-weight-medium);
    }

    .status-value {
        flex: 1;
        min-width: 1px;
        color: var(--color-text-primary);
        font-family: 'Monaco', 'Courier New', monospace;
        padding-top: 0.4em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

interface DiscoveryStatusProps {
    className?: string;
}

/**
 * Discovery Status Component (MM-30)
 *
 * Displays the current status of OrbitDB connection and discovery service.
 * Shows whether the service is initialized and the OrbitDB ID.
 *
 * @remarks
 * TODO(MM-36): Add real-time connection monitoring
 * TODO(MM-36): Add connection health metrics
 * TODO(MM-34): Show cache statistics
 */
export const DiscoveryStatus = ({ className }: DiscoveryStatusProps) => {
    const messenger = useMessenger();
    const [isInitialized, setIsInitialized] = useState(false);
    const [orbitdbId, setOrbitdbId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const status = await messenger.sendMessageToRuntime(
                    MessageType.GET_DISCOVERY_STATUS
                );

                setIsInitialized(status.isInitialized);
                setOrbitdbId(status.orbitdbId);
            } catch (error) {
                console.error('Failed to fetch discovery status:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();

        // Poll for status updates every 10 seconds
        // TODO(MM-36): Replace with real-time event-based updates
        const interval = setInterval(fetchStatus, 10000);

        return () => clearInterval(interval);
    }, [messenger]);

    if (loading) {
        return (
            <StyledDiscoveryStatus className={className}>
                <span className="status-label">Loading...</span>
            </StyledDiscoveryStatus>
        );
    }

    return (
        <StyledDiscoveryStatus className={className}>
            <div className="status-row">
                <span className="status-label">Discovery:</span>
                <span className="status-value">
                    <span
                        className={`status-indicator ${
                            isInitialized ? 'online' : 'offline'
                        }`}
                    />

                    <span className="status-value">
                        {isInitialized ? 'Online' : 'Offline'}
                    </span>
                </span>
            </div>
            {orbitdbId && (
                <div className="status-row">
                    <span className="status-label">OrbitDB:</span>
                    <span className="status-value">{orbitdbId}</span>
                </div>
            )}
        </StyledDiscoveryStatus>
    );
};
