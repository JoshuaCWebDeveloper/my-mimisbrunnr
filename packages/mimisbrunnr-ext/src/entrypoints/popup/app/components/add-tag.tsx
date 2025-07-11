import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { styled } from 'styled-components';
import { CreateTag } from '../../../../messenger.js';
import { useTagManager } from '../context/tag-manager.js';

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
                username: value.username.trim().toLowerCase(),
                name: value.name,
                color: value.color || defaultColor,
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
            <div className="input-row">
                <input
                    className="input"
                    name="username"
                    placeholder="Username"
                    value={value.username || ''}
                    onChange={handleChange}
                    disabled={isSaving}
                    required
                />
                <input
                    className="input"
                    name="name"
                    placeholder="Tag"
                    value={value.name || ''}
                    onChange={handleChange}
                    disabled={isSaving}
                    required
                />
                <input
                    className="color-input"
                    name="color"
                    type="color"
                    value={value.color || defaultColor}
                    onChange={handleChange}
                    disabled={isSaving}
                    title="Color"
                />
            </div>

            <div className="button-row">
                <button
                    className="button primary"
                    type="submit"
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <div className="loading-spinner" />
                    ) : value.id ? (
                        'Update'
                    ) : (
                        'Add'
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
