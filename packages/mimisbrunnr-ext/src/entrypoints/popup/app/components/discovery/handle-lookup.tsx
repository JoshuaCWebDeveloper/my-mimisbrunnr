import { useState } from 'react';
import { styled } from 'styled-components';
import { MessageType } from '../../../../../messenger.js';
import { useMessenger } from '../../context/messenger.js';
import { Button } from '../shared/button.js';

const StyledHandleLookup = styled.div`
    margin-top: var(--space-6);
    padding: var(--space-5);
    background: var(--glass-bg);
    backdrop-filter: var(--backdrop-blur);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);

    .title {
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2);
    }

    .subtitle {
        font-size: var(--font-size-xs);
        color: var(--color-text-tertiary);
        margin: 0 0 var(--space-4);
        font-style: italic;
    }

    .input-group {
        margin-bottom: var(--space-4);
    }

    .label {
        display: block;
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .input-wrapper {
        display: flex;
        gap: var(--space-3);

        button {
            flex: 0 0 auto;
        }
    }

    .input {
        flex: 1;
        min-width: 1px;
        padding: var(--space-3);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
        font-size: var(--font-size-sm);

        &:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        &::placeholder {
            color: var(--color-text-tertiary);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .result-container {
        padding: var(--space-4);
        border-radius: var(--radius-md);
        margin-top: var(--space-3);

        &.success {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
        }

        &.error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
    }

    .result-header {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: rgb(34, 197, 94);
        margin-bottom: var(--space-3);
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    .result-field {
        margin-bottom: var(--space-3);

        &:last-child {
            margin-bottom: 0;
        }
    }

    .result-label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-1);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .result-text {
        font-size: var(--font-size-sm);
        font-family: 'Monaco', 'Courier New', monospace;
        word-break: break-all;
        color: var(--color-text-primary);

        &.error {
            color: rgb(239, 68, 68);
        }
    }
`;

interface DiscoveryResult {
    handle: string;
    ipnsKey: string;
    did: string;
    updatedAt: number;
}

/**
 * Handle Lookup Component (MM-30)
 *
 * Allows users to discover other users by their X.com handle.
 * Uses OrbitDB discovery log to find IPNS/DID mappings.
 *
 * @remarks
 * TODO(MM-31): Add tweet verification display
 * TODO(MM-34): Add caching for recently looked up handles
 * TODO(MM-36): Add loading states and retry logic
 */
export const HandleLookup = () => {
    const messenger = useMessenger();
    const [handle, setHandle] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DiscoveryResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!handle.trim()) {
            setError('Please enter a handle');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const discoveryResult = await messenger.sendMessageToRuntime(
                MessageType.DISCOVER_BY_HANDLE,
                { handle: handle.trim() }
            );

            if (discoveryResult) {
                setResult(discoveryResult);
            } else {
                setError(`No discovery record found for handle: ${handle}`);
            }
        } catch (err) {
            setError((err as Error).message || 'Failed to discover handle');
        } finally {
            setLoading(false);
        }
    };

    return (
        <StyledHandleLookup>
            <h3 className="title">Discover User</h3>
            <p className="subtitle">
                Look up a user's decentralized identity by their X.com handle
            </p>

            <form onSubmit={handleSubmit}>
                <div className="input-group">
                    <label className="label">X.com Handle</label>
                    <div className="input-wrapper">
                        <input
                            className="input"
                            type="text"
                            value={handle}
                            onChange={e => setHandle(e.target.value)}
                            placeholder="@alice"
                            disabled={loading}
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={loading || !handle.trim()}
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </Button>
                    </div>
                </div>
            </form>

            {error && (
                <div className="result-container error">
                    <div className="result-text error">{error}</div>
                </div>
            )}

            {result && (
                <div className="result-container success">
                    <div className="result-header">✓ User Found</div>

                    <div className="result-field">
                        <div className="result-label">Handle</div>
                        <div className="result-text">{result.handle}</div>
                    </div>

                    <div className="result-field">
                        <div className="result-label">DID</div>
                        <div className="result-text">{result.did}</div>
                    </div>

                    <div className="result-field">
                        <div className="result-label">IPNS Key</div>
                        <div className="result-text">{result.ipnsKey}</div>
                    </div>

                    <div className="result-field">
                        <div className="result-label">Last Updated</div>
                        <div className="result-text">
                            {new Date(result.updatedAt).toLocaleString()}
                        </div>
                    </div>
                </div>
            )}
        </StyledHandleLookup>
    );
};
