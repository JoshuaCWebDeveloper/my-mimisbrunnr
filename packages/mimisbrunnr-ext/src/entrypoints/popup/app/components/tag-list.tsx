import { faPencil, faTags, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useMutation } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { styled } from 'styled-components';
import { Tag } from '../../../../messenger.js';
import { useTagManager } from '../context/tag-manager.js';
import { ConfirmableDelete } from './shared/confirmable-delete.js';

const StyledTagList = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    position: relative;

    .list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-2);

        .list-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-bold);
            color: var(--color-text-primary);
            margin: 0;
            letter-spacing: -0.01em;
        }

        .tag-count {
            font-size: var(--font-size-xs);
            color: var(--color-text-tertiary);
            background: var(--color-bg-tertiary);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-full);
            font-weight: var(--font-weight-semibold);
        }
    }

    .filter-container {
        position: relative;
        margin-bottom: var(--space-3);

        .filter-icon {
            position: absolute;
            right: var(--space-3);
            top: 50%;
            transform: translateY(-50%);
            color: var(--color-text-tertiary);
            font-size: var(--font-size-sm);
            pointer-events: none;
        }

        .filter-input {
            width: 100%;
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border-primary);
            color: var(--color-text-primary);
            transition: all var(--transition-fast);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-sm);
            font-size: var(--font-size-sm);

            &::placeholder {
                color: var(--color-text-tertiary);
            }

            &:focus {
                outline: none;
                border-color: var(--color-primary);
                background: var(--color-surface);
                box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.1);
            }
        }
    }

    .tag-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        max-height: 240px;
        overflow-y: auto;
        padding-right: var(--space-1);
    }
`;

const StyledTagItem = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    margin-top: 1px;
    background: var(--gradient-surface);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    transition: all var(--transition-fast);
    position: relative;
    overflow: hidden;
    box-shadow: var(--shadow-xs);

    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--glass-bg);
        backdrop-filter: var(--backdrop-blur);
        z-index: -1;
        opacity: 0;
        transition: opacity var(--transition-fast);
    }

    &:hover {
        border-color: var(--color-border-hover);
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);

        &::before {
            opacity: 1;
        }

        .tag-actions {
            opacity: 1;
            transform: translateX(0);
        }
    }

    .tag-content {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex: 1;
        min-width: 0;
    }

    .username-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
        flex: 1;
    }

    .username {
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
        font-size: var(--font-size-sm);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--font-family-mono);
    }

    .username-prefix {
        color: var(--color-text-tertiary);
        font-weight: var(--font-weight-normal);
    }

    .tag-badge {
        color: var(--color-text-inverse);
        padding: 0 var(--space-2);
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-normal);
        letter-spacing: 0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100px;
        box-shadow: var(--shadow-sm);
        position: relative;

        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.2) 0%,
                transparent 50%
            );
            border-radius: inherit;
        }
    }

    .tag-actions {
        display: flex;
        gap: var(--space-2);
        opacity: 0;
        transform: translateX(8px);
        transition: all var(--transition-fast);
    }

    .action-button {
        width: var(--space-4);
        height: var(--space-4);
        background: var(--color-surface);
        border: 0;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--transition-fast);
        cursor: pointer;
        font-size: var(--font-size-sm);
        position: relative;
        overflow: hidden;

        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.1) 0%,
                transparent 50%
            );
            opacity: 0;
            transition: opacity var(--transition-fast);
        }

        &:hover:not(:disabled) {
            background: var(--color-surface-elevated);
            color: var(--color-text-primary);

            &::before {
                opacity: 1;
            }
        }

        &.edit-button:hover {
            border-color: var(--color-primary);
            color: var(--color-primary);
        }

        &.delete-button:hover {
            border-color: var(--color-danger);
            color: var(--color-danger);
        }

        &:focus {
            outline: none;
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none !important;
        }
    }
`;

const StyledEmptyState = styled.div`
    text-align: center;
    padding: var(--space-8) var(--space-6);
    background: var(--gradient-surface);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    position: relative;
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--glass-bg);
        backdrop-filter: var(--backdrop-blur);
        z-index: -1;
    }

    .icon-container {
        width: 56px;
        height: 56px;
        margin: 0 auto var(--space-4);
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-2xl);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-sm);

        .icon {
            font-size: 24px;
            opacity: 0.6;
        }
    }

    .title {
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin-bottom: var(--space-2);
        letter-spacing: -0.01em;
    }

    .text {
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        line-height: 1.5;
        font-weight: var(--font-weight-medium);
    }
`;

const StyledLoadingContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    gap: var(--space-3);

    .loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--color-border-primary);
        border-top: 2px solid var(--color-primary);
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

    .loading-text {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        font-weight: var(--font-weight-medium);
    }
`;

export interface TagListProps {
    loading?: boolean;
    tags?: Tag[];
    onEdit?: (tag: Tag) => void;
    onError?: (error: Error) => void;
    onDelete?: (id: string) => void;
    className?: string;
}

export const TagList = ({
    loading,
    tags = [],
    onEdit,
    onError,
    onDelete,
    className,
}: TagListProps) => {
    const tagManager = useTagManager();
    const [filterUsername, setFilterUsername] = useState('');

    const { mutateAsync: deleteTag, isPending: isDeleting } = useMutation({
        mutationFn: (tag: Tag) => tagManager.delete(tag),
        onError: (error: Error) => onError?.(error),
        onSuccess: ({ id }) => onDelete?.(id),
    });

    const isLoading = loading || isDeleting;

    const filteredTags = useMemo(() => {
        if (!filterUsername.trim()) {
            return tags;
        }
        const searchTerm = filterUsername.toLowerCase().trim();
        return tags.filter(tag =>
            tag.username.toLowerCase().includes(searchTerm)
        );
    }, [tags, filterUsername]);

    if (isLoading) {
        return (
            <StyledLoadingContainer>
                <div className="loading-spinner" />
                <div className="loading-text">Loading tags...</div>
            </StyledLoadingContainer>
        );
    }

    if (tags.length === 0) {
        return (
            <StyledEmptyState>
                <div className="icon-container">
                    <FontAwesomeIcon icon={faTags} />
                </div>
                <h3 className="title">No tags yet</h3>
                <p className="text">
                    Create your first tag to start organizing X accounts.
                </p>
            </StyledEmptyState>
        );
    }

    return (
        <StyledTagList className={`tag-list ${className || ''}`}>
            <div className="list-header">
                <h3 className="list-title">Your Tags</h3>
                <span className="tag-count">
                    {filteredTags.length} / {tags.length}
                </span>
            </div>

            <div className="filter-container">
                <input
                    type="text"
                    className="filter-input"
                    placeholder="Filter by username..."
                    value={filterUsername}
                    onChange={e => setFilterUsername(e.target.value)}
                    aria-label="Filter tags by username"
                />
                <FontAwesomeIcon icon={faSearch} className="filter-icon" />
            </div>

            <div className="tag-grid">
                {filteredTags.length === 0 && filterUsername.trim() ? (
                    <StyledEmptyState>
                        <div className="icon-container">
                            <FontAwesomeIcon icon={faSearch} />
                        </div>
                        <h3 className="title">No matching tags</h3>
                        <p className="text">
                            No tags found for username containing "
                            {filterUsername}"
                        </p>
                    </StyledEmptyState>
                ) : (
                    filteredTags.map(tag => (
                        <StyledTagItem key={tag.id}>
                            <div className="tag-content">
                                <div className="username-container">
                                    <span className="username">
                                        <span className="username-prefix">
                                            @
                                        </span>
                                        {tag.username}
                                    </span>
                                </div>
                                <span
                                    className="tag-badge"
                                    style={{ backgroundColor: tag.color }}
                                >
                                    {tag.name}
                                </span>
                            </div>
                            <div className="tag-actions">
                                <button
                                    className="action-button edit-button"
                                    onClick={() => onEdit?.(tag)}
                                    disabled={isLoading}
                                    title="Edit tag"
                                >
                                    <FontAwesomeIcon icon={faPencil} />
                                </button>

                                <ConfirmableDelete
                                    className="action-button delete-button"
                                    ariaLabel="Delete tag"
                                    onDelete={() => deleteTag(tag)}
                                    disabled={isLoading}
                                    title="Delete tag"
                                />
                            </div>
                        </StyledTagItem>
                    ))
                )}
            </div>
        </StyledTagList>
    );
};
