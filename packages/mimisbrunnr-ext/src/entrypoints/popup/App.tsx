import React, { useEffect, useState } from 'react';
import { styled } from 'styled-components';

interface UserTag {
    username: string;
    tag: string;
    color: string;
}

const defaultColor = '#1d9bf0';

function sendMessage<T = unknown>(message: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        // Support both browser and chrome APIs
        const runtime = window.browser?.runtime || window.chrome?.runtime;
        if (!runtime) return reject(new Error('No runtime API available'));
        runtime.sendMessage(message, (response: unknown) => {
            if (runtime.lastError) {
                reject(runtime.lastError);
            } else {
                resolve(response as T);
            }
        });
    });
}

// Styled Components
const StyledApp = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--color-bg-primary);
    overflow: hidden;

    .header {
        padding: var(--space-4) var(--space-4) var(--space-3);
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-surface);

        .title {
            font-size: var(--font-size-base);
            font-weight: 700;
            color: var(--color-text-primary);
            margin: 0;
            letter-spacing: -0.01em;
        }

        .subtitle {
            font-size: var(--font-size-xs);
            color: var(--color-text-secondary);
            margin: var(--space-1) 0 0;
            line-height: 1.3;
            font-weight: 500;
        }
    }

    .content {
        flex: 1;
        padding: var(--space-3);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }

    .loading-container {
        display: flex;
        justify-content: center;
        padding: var(--space-4);
    }

    .loading-spinner {
        width: 14px;
        height: 14px;
        border: 1px solid var(--color-border-primary);
        border-top: 1px solid var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;

        @keyframes spin {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }
    }
`;

const StyledForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

    .input-row {
        display: flex;
        gap: var(--space-2);
        align-items: center;
    }

    .input {
        flex: 1;
        padding: var(--space-2) var(--space-3);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-sm);
        color: var(--color-text-primary);
        font-size: var(--font-size-xs);
        font-weight: 500;
        transition: all var(--transition-fast);

        &::placeholder {
            color: var(--color-text-tertiary);
            font-weight: 400;
        }

        &:focus {
            outline: none;
            border-color: var(--color-primary);
            background: var(--color-surface);
            box-shadow: 0 0 0 1px var(--color-primary);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .color-input {
        width: 28px;
        height: 28px;
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-sm);
        cursor: pointer;
        background: none;
        transition: all var(--transition-fast);

        &:hover {
            border-color: var(--color-border-secondary);
        }

        &:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: 0 0 0 1px var(--color-primary);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .button-row {
        display: flex;
        gap: var(--space-2);
        margin-top: var(--space-1);
    }

    .button {
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-sm);
        font-size: var(--font-size-xs);
        font-weight: 600;
        transition: all var(--transition-fast);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        border: 1px solid;

        &.primary {
            background: var(--color-primary);
            color: var(--color-text-inverse);
            border-color: var(--color-primary);

            &:hover:not(:disabled) {
                background: var(--color-primary-hover);
                border-color: var(--color-primary-hover);
            }

            &:focus {
                outline: none;
                box-shadow: 0 0 0 1px var(--color-surface),
                    0 0 0 3px var(--color-primary);
            }
        }

        &.danger {
            background: var(--color-danger);
            color: var(--color-text-inverse);
            border-color: var(--color-danger);

            &:hover:not(:disabled) {
                background: #d91828;
                border-color: #d91828;
            }

            &:focus {
                outline: none;
                box-shadow: 0 0 0 1px var(--color-surface),
                    0 0 0 3px var(--color-danger);
            }
        }

        &.secondary {
            background: var(--color-surface);
            color: var(--color-text-primary);
            border-color: var(--color-border-primary);

            &:hover:not(:disabled) {
                background: var(--color-surface-hover);
                border-color: var(--color-border-secondary);
            }

            &:focus {
                outline: none;
                box-shadow: 0 0 0 1px var(--color-primary);
            }
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .error-message {
        padding: var(--space-2) var(--space-3);
        background: rgba(244, 33, 46, 0.08);
        border: 1px solid rgba(244, 33, 46, 0.2);
        border-radius: var(--radius-sm);
        color: var(--color-danger);
        font-size: var(--font-size-xs);
        margin-top: var(--space-2);
    }
`;

const StyledTagList = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    .tag-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-2) var(--space-3);
        background: var(--color-surface);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);

        &:hover {
            border-color: var(--color-border-secondary);
            background: var(--color-surface-hover);

            .tag-actions {
                opacity: 1;
            }
        }
    }

    .tag-info {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex: 1;
        min-width: 0;
    }

    .username {
        font-weight: 600;
        color: var(--color-text-primary);
        font-size: var(--font-size-xs);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 60px;
        max-width: 80px;
    }

    .tag-badge {
        color: var(--color-text-inverse);
        padding: 2px var(--space-2);
        border-radius: var(--radius-sm);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 80px;
    }

    .tag-actions {
        display: flex;
        gap: var(--space-1);
        opacity: 0.6;
        transition: opacity var(--transition-fast);
    }

    .icon-button {
        width: 24px;
        height: 24px;
        border-radius: var(--radius-sm);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--transition-fast);
        cursor: pointer;
        font-size: 11px;

        &:hover:not(:disabled) {
            background: var(--color-surface-hover);
            border-color: var(--color-border-secondary);
            color: var(--color-text-primary);
        }

        &:focus {
            outline: none;
            box-shadow: 0 0 0 1px var(--color-primary);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }
`;

const StyledEmptyState = styled.div`
    text-align: center;
    padding: var(--space-4) var(--space-3);
    color: var(--color-text-secondary);

    .icon {
        font-size: 32px;
        margin-bottom: var(--space-2);
        opacity: 0.5;
    }

    .text {
        font-size: var(--font-size-xs);
        line-height: 1.4;
    }
`;

const StyledNotOnXMessage = styled.div`
    text-align: center;
    padding: var(--space-4) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    margin: var(--space-3);

    .icon {
        font-size: 40px;
        margin-bottom: var(--space-2);
        opacity: 0.6;
    }

    .title {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text-primary);
        margin-bottom: var(--space-1);
    }

    .text {
        color: var(--color-text-secondary);
        font-size: var(--font-size-xs);
        line-height: 1.4;
    }
`;

function App() {
    const [tags, setTags] = useState<UserTag[]>([]);
    const [form, setForm] = useState<Partial<UserTag>>({ color: defaultColor });
    const [editing, setEditing] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOnX, setIsOnX] = useState<boolean | null>(null);

    const checkIfOnX = async () => {
        try {
            const tabs = await new Promise<Array<{ url?: string }>>(resolve => {
                const runtime = window.browser?.tabs || window.chrome?.tabs;
                if (runtime) {
                    runtime.query(
                        { active: true, currentWindow: true },
                        resolve
                    );
                } else {
                    resolve([]);
                }
            });

            const currentTab = tabs[0];
            const isX = Boolean(
                currentTab?.url?.includes('twitter.com') ||
                    currentTab?.url?.includes('x.com')
            );
            setIsOnX(isX);

            if (isX) {
                fetchTags();
            }
        } catch (_e) {
            setIsOnX(false);
        }
    };

    const fetchTags = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await sendMessage<{ tags: UserTag[] }>({
                type: 'GET_TAGS',
            });
            setTags(res.tags);
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to fetch tags');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkIfOnX();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.username || !form.tag || !form.color) return;
        setLoading(true);
        setError(null);
        try {
            await sendMessage({
                type: 'SAVE_TAG',
                username: form.username.trim().toLowerCase(),
                tag: form.tag,
                color: form.color,
            });
            setForm({ color: defaultColor });
            setEditing(null);
            fetchTags();
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to save tag');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (tag: UserTag) => {
        setForm(tag);
        setEditing(tag.username);
    };

    const handleDelete = async (username: string, tag: string) => {
        setLoading(true);
        setError(null);
        try {
            await sendMessage({ type: 'DELETE_TAG', username, tag });
            fetchTags();
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to delete tag');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setForm({ color: defaultColor });
        setEditing(null);
    };

    if (isOnX === null) {
        return (
            <StyledApp>
                <div className="header">
                    <h1 className="title">Loading...</h1>
                </div>
                <div className="content">
                    <div className="loading-container">
                        <div className="loading-spinner" />
                    </div>
                </div>
            </StyledApp>
        );
    }

    if (!isOnX) {
        return (
            <StyledApp>
                <div className="header">
                    <h1 className="title">X Account Tags</h1>
                    <p className="subtitle">Organize X.com accounts</p>
                </div>
                <StyledNotOnXMessage>
                    <div className="icon">🐦</div>
                    <h2 className="title">Navigate to X.com</h2>
                    <p className="text">Visit X.com to manage account tags.</p>
                </StyledNotOnXMessage>
            </StyledApp>
        );
    }

    return (
        <StyledApp>
            <div className="header">
                <h1 className="title">X Account Tags</h1>
                <p className="subtitle">Organize X.com accounts</p>
            </div>

            <div className="content">
                <StyledForm onSubmit={handleSubmit}>
                    <div className="input-row">
                        <input
                            className="input"
                            name="username"
                            placeholder="Username"
                            value={form.username || ''}
                            onChange={handleChange}
                            disabled={loading}
                            required
                        />
                        <input
                            className="input"
                            name="tag"
                            placeholder="Tag"
                            value={form.tag || ''}
                            onChange={handleChange}
                            disabled={loading}
                            required
                        />
                        <input
                            className="color-input"
                            name="color"
                            type="color"
                            value={form.color || defaultColor}
                            onChange={handleChange}
                            disabled={loading}
                            title="Color"
                        />
                    </div>

                    <div className="button-row">
                        <button
                            className="button primary"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="loading-spinner" />
                            ) : editing ? (
                                'Update'
                            ) : (
                                'Add'
                            )}
                        </button>
                        {editing && (
                            <button
                                className="button secondary"
                                type="button"
                                onClick={handleCancel}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        )}
                    </div>

                    {error && <div className="error-message">{error}</div>}
                </StyledForm>

                <StyledTagList>
                    {loading && tags.length === 0 ? (
                        <div className="loading-container">
                            <div className="loading-spinner" />
                        </div>
                    ) : tags.length === 0 ? (
                        <StyledEmptyState>
                            <div className="icon">🏷️</div>
                            <p className="text">No tags yet. Add one above.</p>
                        </StyledEmptyState>
                    ) : (
                        tags.map(tag => (
                            <div key={tag.username} className="tag-item">
                                <div className="tag-info">
                                    <span className="username">
                                        @{tag.username}
                                    </span>
                                    <span
                                        className="tag-badge"
                                        style={{ backgroundColor: tag.color }}
                                    >
                                        {tag.tag}
                                    </span>
                                </div>
                                <div className="tag-actions">
                                    <button
                                        className="icon-button"
                                        onClick={() => handleEdit(tag)}
                                        disabled={loading}
                                        title="Edit"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="icon-button"
                                        onClick={() =>
                                            handleDelete(tag.username, tag.tag)
                                        }
                                        disabled={loading}
                                        title="Delete"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </StyledTagList>
            </div>
        </StyledApp>
    );
}

export default App;
