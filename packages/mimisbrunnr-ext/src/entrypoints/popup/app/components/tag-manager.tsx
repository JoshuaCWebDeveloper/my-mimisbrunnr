import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { Tag } from '../../../../messenger.js';
import { getTabs } from '../../../../runtime.js';
import { useTagManager } from '../context/tag-manager.js';
import { AddTag, TagValue } from './add-tag.js';
import { TagList } from './tag-list.js';

// Styled Components
const StyledTagManager = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    position: relative;
    z-index: 2;
`;

const StyledLoadingContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    gap: var(--space-3);

    .loading-spinner {
        width: 20px;
        height: 20px;
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

const StyledNotOnXMessage = styled.div`
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
        width: 64px;
        height: 64px;
        margin: 0 auto var(--space-4);
        background: var(--gradient-primary);
        border-radius: var(--radius-2xl);
        display: flex;
        align-items: center;
        justify-content: center;
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
            background: linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.3) 0%,
                transparent 50%
            );
        }

        .icon {
            font-size: 28px;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }
    }

    .title {
        font-size: var(--font-size-lg);
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

const StyledErrorMessage = styled.div`
    padding: var(--space-4) var(--space-5);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-danger);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-2);

    &::before {
        content: '⚠️';
        font-size: var(--font-size-base);
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
            <StyledLoadingContainer role="status" aria-busy="true">
                <div className="loading-spinner" />
                <div className="loading-text">Checking current tab...</div>
            </StyledLoadingContainer>
        );
    }

    if (!isOnX) {
        return (
            <StyledNotOnXMessage>
                <div className="icon-container">
                    <span className="icon" role="img" aria-label="bird">
                        🐦
                    </span>
                </div>
                <h2 className="title">Navigate to X.com</h2>
                <p className="text">
                    Visit X.com to manage account tags and organize your
                    followed accounts.
                </p>
            </StyledNotOnXMessage>
        );
    }

    return (
        <StyledTagManager>
            {error && <StyledErrorMessage>{error.message}</StyledErrorMessage>}

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
        </StyledTagManager>
    );
};
