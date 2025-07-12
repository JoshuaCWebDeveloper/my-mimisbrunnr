import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { styled } from 'styled-components';
import { CreateTag } from '../../../../messenger.js';
import { useTagManager } from '../context/tag-manager.js';

const StyledForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2);
    background: var(--gradient-surface);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
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

    .form-header {
        .form-title {
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-bold);
            color: var(--color-text-primary);
            margin: 0 0 var(--space-1);
            letter-spacing: -0.01em;
        }

        .form-subtitle {
            font-size: var(--font-size-xs);
            color: var(--color-text-tertiary);
            margin: 0;
            font-weight: var(--font-weight-medium);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
    }

    .input-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }

    .input-row {
        display: flex;
        gap: var(--space-1);
        align-items: flex-end;
        width: 100%;
    }

    .input-field {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
    }

    .input-label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .input {
        padding: var(--space-1) var(--space-2);
        background: var(--color-surface);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-sm);
        color: var(--color-text-primary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        transition: all var(--transition-fast);
        box-shadow: var(--shadow-xs);

        &::placeholder {
            color: var(--color-text-muted);
            font-weight: var(--font-weight-normal);
        }

        &:focus {
            outline: none;
            border-color: var(--color-primary);
            background: var(--color-surface-elevated);
            box-shadow: var(--shadow-sm), 0 0 0 3px rgba(99, 102, 241, 0.1);
            transform: translateY(-1px);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background: var(--color-bg-tertiary);
        }
    }

    .color-input-container {
        height: 100%;
        flex: 0 0 var(--space-10);
    }

    .color-input {
        height: 100%;
        width: 100%;
        border: 2px solid var(--color-border-primary);
        border-radius: var(--radius-sm);
        cursor: pointer;
        background: none;
        transition: all var(--transition-fast);
        box-shadow: var(--shadow-sm);
        position: relative;
        overflow: hidden;

        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: inherit;
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        &:hover:not(:disabled) {
            border-color: var(--color-border-hover);
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        &:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: var(--shadow-md), 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .button-row {
        display: flex;
        gap: var(--space-3);
    }

    .button {
        flex: 1;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        transition: all var(--transition-fast);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid;
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

        &:hover::before {
            opacity: 1;
        }

        &.primary {
            background: var(--gradient-primary);
            color: var(--color-text-inverse);
            border-color: transparent;
            box-shadow: var(--shadow-md);

            &:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: var(--shadow-lg);
            }

            &:active {
                transform: translateY(0);
                box-shadow: var(--shadow-sm);
            }

            &:focus {
                outline: none;
                box-shadow: var(--shadow-lg), 0 0 0 3px rgba(99, 102, 241, 0.3);
            }
        }

        &.secondary {
            background: var(--color-surface);
            color: var(--color-text-secondary);
            border-color: var(--color-border-primary);
            box-shadow: var(--shadow-xs);

            &:hover:not(:disabled) {
                background: var(--color-surface-hover);
                border-color: var(--color-border-hover);
                color: var(--color-text-primary);
                transform: translateY(-1px);
                box-shadow: var(--shadow-sm);
            }

            &:focus {
                outline: none;
                border-color: var(--color-primary);
                box-shadow: var(--shadow-sm), 0 0 0 3px rgba(99, 102, 241, 0.1);
            }
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none !important;
            box-shadow: var(--shadow-xs) !important;
        }

        .loading-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid currentColor;
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
    }
`;

const defaultColor = '#1d9bf0';

export type TagValue = Partial<CreateTag>;

export interface AddTagProps {
    value: TagValue;
    onChange?: (tag: TagValue) => void;
    onSave?: (tag: CreateTag) => void;
    onCancel?: () => void;
    onError?: (error: Error) => void;
}

export const AddTag = ({
    value,
    onChange,
    onSave,
    onCancel,
    onError,
}: AddTagProps) => {
    const tagManager = useTagManager();

    const { mutateAsync: saveTag, isPending: isSaving } = useMutation({
        mutationFn: (tag: CreateTag) => tagManager.save(tag),
        onError: (error: Error) => onError?.(error),
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.({ ...value, [e.target.name]: e.target.value });
    };

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!value.username || !value.name) return;

            const newTag = {
                color: defaultColor,
                ...value,
                username: value.username.trim().toLowerCase(),
                name: value.name.trim(),
            };

            const tag = await saveTag(newTag);
            onSave?.(tag);
        },
        [value, onSave, saveTag]
    );

    const handleCancel = useCallback(() => {
        onCancel?.();
    }, [onCancel]);

    return (
        <StyledForm onSubmit={handleSubmit}>
            <div className="form-header">
                <h3 className="form-title">
                    {value.id ? 'Edit Tag' : 'Add New Tag'}
                </h3>
                <p className="form-subtitle">
                    {value.id
                        ? 'Update tag details'
                        : 'Create a tag for an X account'}
                </p>
            </div>

            <div className="input-group">
                <div className="input-row">
                    <div className="input-field">
                        <input
                            className="input"
                            name="username"
                            placeholder="Username"
                            value={value.username || ''}
                            onChange={handleChange}
                            disabled={isSaving}
                            required
                        />
                    </div>
                    <div className="input-field">
                        <input
                            className="input"
                            name="name"
                            placeholder="Tag Name"
                            value={value.name || ''}
                            onChange={handleChange}
                            disabled={isSaving}
                            required
                        />
                    </div>
                    <div className="color-input-container">
                        <input
                            className="color-input"
                            name="color"
                            type="color"
                            value={value.color || defaultColor}
                            onChange={handleChange}
                            disabled={isSaving}
                            title="Choose tag color"
                        />
                    </div>
                </div>
            </div>

            <div className="button-row">
                <button
                    className="button primary"
                    type="submit"
                    disabled={
                        isSaving ||
                        !value.username?.trim() ||
                        !value.name?.trim()
                    }
                >
                    {isSaving ? (
                        <div className="loading-spinner" />
                    ) : value.id ? (
                        'Update Tag'
                    ) : (
                        'Add Tag'
                    )}
                </button>
                {value.id && (
                    <button
                        className="button secondary"
                        type="button"
                        onClick={handleCancel}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </StyledForm>
    );
};
