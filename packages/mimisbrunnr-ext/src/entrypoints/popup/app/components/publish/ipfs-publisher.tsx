import { useState } from 'react';
import { styled } from 'styled-components';
import { MessageType } from '../../../../../messenger.js';
import { useMessenger } from '../../context/messenger.js';
import { ToggleSwitch } from '../shared/toggle-switch.js';
import { useInvalidateListTags } from '../../queries/tags.js';

/**
 * IPFS Publisher Component (MM-27 POC)
 *
 * Simple UI for publishing tag collections to IPFS and retrieving them by CID.
 * This is a minimal proof-of-concept implementation.
 *
 * @remarks
 * Missing functionality (to be added in later tickets):
 * - TODO(MM-37): Enhanced UI with better status indicators
 * - TODO(MM-35): Display validation errors to user
 * - TODO(MM-34): Show cache hit/miss metrics
 * - TODO(MM-32): Intelligent data merging UI
 * - TODO(MM-28): Identity selection and encryption options
 */

const StyledIpfsPublisher = styled.div`
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

    .button-container {
        display: flex;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
    }

    .button {
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        box-shadow: var(--shadow-sm);
        transition: all var(--transition-fast);

        &:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        &:active:not(:disabled) {
            transform: translateY(0);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        &.primary {
            background: var(--gradient-primary);
            color: var(--color-text-inverse);
        }

        &.secondary {
            background: var(--color-bg-secondary);
            color: var(--color-text-primary);
        }
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
        font-family: 'Monaco', 'Courier New', monospace;

        &:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        &::placeholder {
            color: var(--color-text-tertiary);
        }
    }

    .input-group.mode {
        .status {
            height: 3em;
        }
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
        font-family: 'Monaco', 'Courier New', monospace;
        word-break: break-all;

        &.success {
            color: rgb(34, 197, 94);
        }

        &.error {
            color: rgb(239, 68, 68);
        }
    }

    .status {
        font-size: var(--font-size-xs);
        color: var(--color-text-tertiary);
        margin-top: var(--space-2);
        font-style: italic;
    }
`;

export const IpfsPublisher = () => {
    const messenger = useMessenger();
    const [loading, setLoading] = useState(false);
    const [publishedCid, setPublishedCid] = useState<string | null>(null);
    const [retrieveCid, setRetrieveCid] = useState('');
    const [isOverwriteMode, setIsOverwriteMode] = useState(false); // false = merge, true = overwrite
    const [importResult, setImportResult] = useState<{
        imported: number;
        total: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const importMode: 'merge' | 'overwrite' = isOverwriteMode
        ? 'overwrite'
        : 'merge';

    const invalidateListTags = useInvalidateListTags();

    const handlePublish = async () => {
        setLoading(true);
        setError(null);
        setPublishedCid(null);

        try {
            const response = await messenger.sendMessageToRuntime(
                MessageType.PUBLISH_TO_IPFS
            );
            setPublishedCid(response.cid);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!retrieveCid.trim()) {
            setError('Please enter a CID');
            return;
        }

        setLoading(true);
        setError(null);
        setImportResult(null);

        try {
            const response = await messenger.sendMessageToRuntime(
                MessageType.IMPORT_FROM_IPFS,
                { cid: retrieveCid.trim(), mode: importMode }
            );
            setImportResult(response);
            invalidateListTags();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <StyledIpfsPublisher>
            <h3 className="title">IPFS Publisher (POC)</h3>
            <p className="subtitle">
                Publish your tags to IPFS or retrieve tags by CID
            </p>

            {/* Publish Section */}
            <div className="button-container">
                <button
                    className="button primary"
                    onClick={handlePublish}
                    disabled={loading}
                >
                    {loading ? 'Publishing...' : 'Publish to IPFS'}
                </button>
            </div>

            {publishedCid && (
                <div className="result-container success">
                    <div className="result-label">Published CID</div>
                    <div className="result-text success">{publishedCid}</div>
                    <div className="status">
                        Copy this CID to retrieve your tags later
                    </div>
                </div>
            )}

            {/* Import Section */}
            <div className="input-group">
                <label className="label">Import from IPFS by CID</label>
                <input
                    className="input"
                    type="text"
                    placeholder="bafyrei..."
                    value={retrieveCid}
                    onChange={e => setRetrieveCid(e.target.value)}
                    disabled={loading}
                />
            </div>

            {/* Import Mode Toggle */}
            <div className="input-group mode">
                <label className="label">Import Mode</label>
                <ToggleSwitch
                    value={isOverwriteMode}
                    onChange={setIsOverwriteMode}
                    leftLabel="Merge"
                    rightLabel="Overwrite"
                    leftColor="rgb(147, 51, 234)" // Purple
                    rightColor="rgb(239, 68, 68)" // Red
                    disabled={loading}
                />
                <div className="status">
                    {importMode === 'merge'
                        ? 'Add new tags without duplicates'
                        : 'Delete all existing tags and replace with imported ones'}
                </div>
            </div>

            <div className="button-container">
                <button
                    className="button primary"
                    onClick={handleImport}
                    disabled={loading || !retrieveCid.trim()}
                >
                    {loading ? 'Importing...' : 'Import Tags'}
                </button>
            </div>

            {importResult && (
                <div className="result-container success">
                    <div className="result-label">Import Complete</div>
                    <div className="result-text success">
                        Imported {importResult.imported} of {importResult.total}{' '}
                        tag(s)
                    </div>
                    <div className="status">
                        {importResult.imported === importResult.total
                            ? 'All tags imported successfully'
                            : `${
                                  importResult.total - importResult.imported
                              } duplicate(s) skipped`}
                    </div>
                </div>
            )}

            {error && (
                <div className="result-container error">
                    <div className="result-label">Error</div>
                    <div className="result-text error">{error}</div>
                </div>
            )}
        </StyledIpfsPublisher>
    );
};
