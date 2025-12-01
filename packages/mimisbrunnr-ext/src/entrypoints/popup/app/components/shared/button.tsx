/**
 * Reusable Button Component
 *
 * A styled button component that follows the design system patterns
 * used across the application.
 */

import React from 'react';
import { styled } from 'styled-components';

// ============================================================================
// Types
// ============================================================================

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Button variant */
    variant?: 'primary' | 'secondary';
    /** Button size */
    size?: 'normal' | 'small';
    /** Loading state */
    loading?: boolean;
    /** Icon to display before text */
    icon?: React.ReactNode;
    /** Children content */
    children: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'normal',
    loading = false,
    icon,
    children,
    disabled,
    className,
    ...props
}) => {
    return (
        <StyledButton
            className={`${variant} ${size} ${className || ''}`}
            disabled={disabled || loading}
            {...props}
        >
            {icon && <span className="icon">{icon}</span>}
            {children}
        </StyledButton>
    );
};

// ============================================================================
// Styled Components
// ============================================================================

const StyledButton = styled.button`
    flex: 1;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    box-shadow: var(--shadow-sm);
    transition: all var(--transition-fast);
    cursor: pointer;

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
        border: none;
    }

    &.secondary {
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-primary);
    }

    &.small {
        flex: 0 0 auto;
        padding: var(--space-2) var(--space-3);
        font-size: var(--font-size-xs);
    }

    .icon {
        display: flex;
        align-items: center;
        justify-content: center;
    }
`;
