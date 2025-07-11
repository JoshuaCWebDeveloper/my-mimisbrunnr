import { useMutation } from '@tanstack/react-query';
import { styled } from 'styled-components';
import { Tag } from '../../../../messenger.js';
import { useTagManager } from '../context/tag-manager.js';

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

    const { mutateAsync: deleteTag, isPending: isDeleting } = useMutation({
        mutationFn: (tag: Tag) => tagManager.delete(tag),
        onError: (error: Error) => onError?.(error),
        onSuccess: ({ id }) => onDelete?.(id),
    });

    const isLoading = loading || isDeleting;

    return (
        <StyledTagList className={`tag-list ${className}`}>
            {isLoading ? (
                <div className="loading-container">
                    <div className="loading-spinner" />
                </div>
            ) : tags.length === 0 && !isLoading ? (
                <StyledEmptyState>
                    <div className="icon">🏷️</div>
                    <p className="text">No tags yet. Add one above.</p>
                </StyledEmptyState>
            ) : (
                tags.map(tag => (
                    <div key={tag.username} className="tag-item">
                        <div className="tag-info">
                            <span className="username">@{tag.username}</span>
                            <span
                                className="tag-badge"
                                style={{ backgroundColor: tag.color }}
                            >
                                {tag.name}
                            </span>
                        </div>
                        <div className="tag-actions">
                            <button
                                className="icon-button"
                                onClick={() => onEdit?.(tag)}
                                disabled={isLoading}
                                title="Edit"
                            >
                                ✏️
                            </button>
                            <button
                                className="icon-button"
                                onClick={() => deleteTag(tag)}
                                disabled={isLoading}
                                title="Delete"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                ))
            )}
        </StyledTagList>
    );
};
