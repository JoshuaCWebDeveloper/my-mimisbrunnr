/**
 * Identity Manager Component (MM-28)
 *
 * Manages user identity state and provides UI for:
 * - Creating a new identity (first-time setup)
 * - Unlocking existing identity with passphrase
 * - Displaying current identity status
 * - Locking/deleting identity
 *
 * This component acts as a gate for encrypted operations like IPFS publishing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { styled } from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faLock,
    faLockOpen,
    faKey,
    faUserPlus,
    faSignOut,
} from '@fortawesome/free-solid-svg-icons';
import { PassphraseManager } from './passphrase-manager.js';
import { Button } from '../shared/button.js';
import { useMessenger } from '../../context/messenger.js';
import { MessageType } from '../../../../../messenger.js';

// ============================================================================
// Styled Components
// ============================================================================

const StyledIdentityManager = styled.div`
    margin-bottom: var(--space-6);
    padding: var(--space-5);
    background: var(--glass-bg);
    backdrop-filter: var(--backdrop-blur);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);

    .header {
        text-align: center;
        margin-bottom: var(--space-4);
    }

    .title {
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2);
    }

    .subtitle {
        font-size: var(--font-size-xs);
        color: var(--color-text-tertiary);
        margin: 0;
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

    .input {
        width: 100%;
        padding: var(--space-3);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
        font-size: var(--font-size-sm);
        transition: all var(--transition-fast);

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

    .button-container {
        display: flex;
        gap: var(--space-3);
        margin-top: var(--space-2);
    }

    .result-container {
        padding: var(--space-3);
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

        &:first-child {
            margin-top: 0;
        }
    }

    .status-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }

    .status-icon {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-secondary);
        border-radius: var(--radius-full);
        color: var(--color-text-tertiary);
        font-size: 18px;

        &.unlocked {
            background: rgb(34, 197, 94);
            color: white;
        }
    }

    .status-content {
        flex: 1;
        min-width: 0;
    }

    .result-label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .result-text {
        font-size: var(--font-size-sm);
        color: var(--color-text-primary);
        margin-top: var(--space-1);

        &.success {
            color: rgb(34, 197, 94);
        }

        &.error {
            color: rgb(239, 68, 68);
            font-family: 'Monaco', 'Courier New', monospace;
            word-break: break-all;
        }

        &.did {
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: var(--font-size-xs);
            word-break: break-all;
        }
    }

    .info-label {
        font-weight: var(--font-weight-medium);
        color: var(--color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: var(--font-size-xs);
    }

    .status {
        font-size: var(--font-size-xs);
        color: var(--color-text-tertiary);
        margin-top: var(--space-2);
        font-style: italic;
    }
`;

// ============================================================================
// Types
// ============================================================================

type IdentityState =
    | { status: 'loading' }
    | { status: 'none' } // No identity exists
    | { status: 'locked'; did: string; handle: string } // Identity exists but locked
    | { status: 'unlocked'; did: string; handle: string }; // Identity unlocked

// ============================================================================
// Component
// ============================================================================

export const IdentityManager: React.FC = () => {
    const messenger = useMessenger();
    const [identityState, setIdentityState] = useState<IdentityState>({
        status: 'loading',
    });
    const [mode, setMode] = useState<'setup' | 'unlock' | 'view'>('view');

    // Form state
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [handle, setHandle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const loadIdentityStatus = useCallback(async () => {
        try {
            // Check if identity is unlocked
            const { isUnlocked } = await messenger.sendMessageToRuntime(
                MessageType.IS_IDENTITY_UNLOCKED
            );

            if (isUnlocked) {
                // Get identity info
                const identityInfo = await messenger.sendMessageToRuntime(
                    MessageType.GET_IDENTITY_INFO
                );

                if (identityInfo) {
                    setIdentityState({
                        status: 'unlocked',
                        did: identityInfo.did,
                        handle: identityInfo.handle,
                    });
                    setMode('view');
                    return;
                }
            }

            // Check if identity exists
            const { hasIdentity } = await messenger.sendMessageToRuntime(
                MessageType.HAS_IDENTITY
            );

            if (hasIdentity) {
                // Get identity info (encrypted)
                const identityInfo = await messenger.sendMessageToRuntime(
                    MessageType.GET_IDENTITY_INFO
                );

                if (identityInfo) {
                    setIdentityState({
                        status: 'locked',
                        did: identityInfo.did,
                        handle: identityInfo.handle,
                    });
                    setMode('view');
                } else {
                    setIdentityState({ status: 'none' });
                    setMode('setup');
                }
            } else {
                setIdentityState({ status: 'none' });
                setMode('setup');
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to load identity status:', err);
            setIdentityState({ status: 'none' });
            setMode('setup');
        }
    }, [messenger]);

    const handleCreateIdentity = useCallback(async () => {
        if (passphrase !== confirmPassphrase) {
            setError('Passphrases do not match');
            return;
        }

        if (!handle.match(/^@[a-zA-Z0-9_]{1,15}$/)) {
            setError('Handle must be in format @username (1-15 characters)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await messenger.sendMessageToRuntime(
                MessageType.CREATE_IDENTITY,
                { passphrase, handle }
            );

            setIdentityState({
                status: 'unlocked',
                did: response.did,
                handle: response.handle,
            });
            setMode('view');
            setPassphrase('');
            setConfirmPassphrase('');
            setHandle('');
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to create identity'
            );
        } finally {
            setLoading(false);
        }
    }, [messenger, passphrase, confirmPassphrase, handle]);

    const handleUnlockIdentity = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await messenger.sendMessageToRuntime(
                MessageType.UNLOCK_IDENTITY,
                { passphrase }
            );

            setIdentityState({
                status: 'unlocked',
                did: response.did,
                handle: response.handle,
            });
            setMode('view');
            setPassphrase('');
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to unlock identity'
            );
        } finally {
            setLoading(false);
        }
    }, [messenger, passphrase]);

    const handleLockIdentity = useCallback(async () => {
        try {
            await messenger.sendMessageToRuntime(MessageType.LOCK_IDENTITY);
            await loadIdentityStatus();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to lock identity'
            );
        }
    }, [messenger, loadIdentityStatus]);

    // Load identity status on mount
    useEffect(() => {
        loadIdentityStatus();
    }, [loadIdentityStatus]);

    // Render loading state
    if (identityState.status === 'loading') {
        return (
            <StyledIdentityManager>
                <div className="status">Loading identity...</div>
            </StyledIdentityManager>
        );
    }

    // Render "No Identity" - Setup Mode
    if (identityState.status === 'none' || mode === 'setup') {
        return (
            <StyledIdentityManager>
                <div className="header">
                    <div className="icon">
                        <FontAwesomeIcon icon={faUserPlus} />
                    </div>
                    <h3 className="title">Create Identity</h3>
                    <p className="subtitle">
                        Create a decentralized identity to encrypt and publish
                        your tags
                    </p>
                </div>

                <div className="input-group">
                    <label className="label">X.com Handle</label>
                    <input
                        className="input"
                        type="text"
                        placeholder="@username"
                        value={handle}
                        onChange={e => setHandle(e.target.value)}
                        disabled={loading}
                    />
                    <div className="status">Your X.com/Twitter handle</div>
                </div>

                <div className="input-group">
                    <label className="label">Passphrase</label>
                    <PassphraseManager
                        value={passphrase}
                        onChange={setPassphrase}
                        requireConfirmation
                        confirmValue={confirmPassphrase}
                        onConfirmChange={setConfirmPassphrase}
                        showStrength
                        error={error}
                        disabled={loading}
                    />
                </div>

                <div className="button-container">
                    <Button
                        variant="primary"
                        onClick={handleCreateIdentity}
                        disabled={
                            loading ||
                            !passphrase ||
                            !confirmPassphrase ||
                            !handle ||
                            passphrase !== confirmPassphrase
                        }
                        icon={<FontAwesomeIcon icon={faKey} />}
                    >
                        {loading ? 'Creating...' : 'Create Identity'}
                    </Button>
                </div>
            </StyledIdentityManager>
        );
    }

    // Render "Locked Identity" - Unlock Mode
    if (identityState.status === 'locked' || mode === 'unlock') {
        return (
            <StyledIdentityManager>
                <div className="header">
                    <div className="icon">
                        <FontAwesomeIcon icon={faLock} />
                    </div>
                    <h3 className="title">Unlock Identity</h3>
                    <p className="subtitle">
                        Identity:{' '}
                        {identityState.status === 'locked'
                            ? identityState.handle
                            : ''}
                    </p>
                </div>

                <div className="input-group">
                    <label className="label">Passphrase</label>
                    <PassphraseManager
                        value={passphrase}
                        onChange={setPassphrase}
                        placeholder="Enter your passphrase"
                        error={error}
                        disabled={loading}
                        showStrength={false}
                    />
                </div>

                <div className="button-container">
                    <Button
                        variant="primary"
                        onClick={handleUnlockIdentity}
                        disabled={loading || !passphrase}
                        icon={<FontAwesomeIcon icon={faLockOpen} />}
                    >
                        {loading ? 'Unlocking...' : 'Unlock'}
                    </Button>
                </div>
            </StyledIdentityManager>
        );
    }

    // Render "Unlocked Identity" - View Mode
    return (
        <StyledIdentityManager>
            <div className="result-container success">
                <div className="status-row">
                    <div className="status-icon unlocked">
                        <FontAwesomeIcon icon={faLockOpen} />
                    </div>
                    <div className="status-content">
                        <div className="result-label">Identity Unlocked</div>
                        <div className="result-text">
                            <span className="info-label">Handle:</span>{' '}
                            {identityState.handle}
                        </div>
                        <div className="result-text did">
                            <span className="info-label">DID:</span>{' '}
                            {identityState.did}
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={handleLockIdentity}
                        title="Lock Identity"
                        icon={<FontAwesomeIcon icon={faSignOut} />}
                    >
                        Lock
                    </Button>
                </div>
            </div>

            {error && (
                <div className="result-container error">
                    <div className="result-label">Error</div>
                    <div className="result-text error">{error}</div>
                </div>
            )}
        </StyledIdentityManager>
    );
};
