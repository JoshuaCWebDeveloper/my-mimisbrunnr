import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { Tag } from '../../../../messenger.js';
import { getTabs } from '../../../../runtime.js';
import { useTagManager } from '../context/tag-manager.js';
import { AddTag, TagValue } from './add-tag.js';
import { TagList } from './tag-list.js';

// Styled Components
const StyledApp = styled.div`
    display: flex;

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

export const TagManager = () => {
    const [activeTag, setActiveTag] = useState<TagValue>({});
    const [isOnX, setIsOnX] = useState<boolean | null>(null);

    const tagManager = useTagManager();

    const {
        data: tags,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: ['tags'],
        queryFn: () => tagManager.list(),
    });

    const checkIfOnX = useCallback(async () => {
        try {
            const tabs = await getTabs().query({
                active: true,
                currentWindow: true,
            });

            const currentTab = tabs[0];
            const isX = Boolean(
                currentTab?.url?.includes('twitter.com') ||
                    currentTab?.url?.includes('x.com')
            );
            setIsOnX(isX);

            if (isX) {
                refetch();
            }
        } catch (_e) {
            setIsOnX(false);
        }
    }, [refetch]);

    useEffect(() => {
        checkIfOnX();
    }, [checkIfOnX]);

    const handleChange = useCallback((tag: TagValue) => {
        setActiveTag(tag);
    }, []);

    const handleEdit = useCallback((tag: Tag) => {
        setActiveTag(tag);
    }, []);

    const handleSave = useCallback(() => {
        setActiveTag({});
        refetch();
    }, [refetch]);

    const handleDelete = useCallback(() => {
        refetch();
    }, [refetch]);

    const handleCancel = useCallback(() => {
        setActiveTag({});
    }, []);

    const handleError = useCallback((error: Error) => {
        console.error(error);
    }, []);

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
                    <div className="icon">
                        <span role="img" aria-label="bird">
                            🐦
                        </span>
                    </div>
                    <h2 className="title">Navigate to X.com</h2>
                    <p className="text">Visit X.com to manage account tags.</p>
                </StyledNotOnXMessage>
            </StyledApp>
        );
    }

    return (
        <StyledApp>
            <h2 className="subtitle">Organize X.com accounts</h2>

            <p className="error">{error?.message}</p>

            <AddTag
                value={activeTag}
                onChange={handleChange}
                onSave={handleSave}
                onCancel={handleCancel}
                onError={handleError}
            />

            <TagList
                loading={isLoading}
                tags={tags}
                onEdit={handleEdit}
                onError={handleError}
                onDelete={handleDelete}
            />
        </StyledApp>
    );
};
