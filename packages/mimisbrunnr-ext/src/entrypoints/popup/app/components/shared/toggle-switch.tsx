import { styled } from 'styled-components';

interface ToggleSwitchProps {
    value: boolean;
    onChange: (value: boolean) => void;
    leftLabel: string;
    rightLabel: string;
    disabled?: boolean;
    leftColor?: string;
    rightColor?: string;
}

const StyledToggleSwitch = styled.div<{
    $leftColor?: string;
    $rightColor?: string;
    $value: boolean;
}>`
    display: flex;
    align-items: center;
    gap: var(--space-3);
    user-select: none;

    .label {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
        transition: color var(--transition-fast);
        cursor: pointer;

        &.left.active {
            color: ${props => props.$leftColor || 'var(--color-primary)'};
            font-weight: var(--font-weight-semibold);
        }

        &.right.active {
            color: ${props => props.$rightColor || 'var(--color-primary)'};
            font-weight: var(--font-weight-semibold);
        }

        &.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .switch {
        position: relative;
        width: 48px;
        height: 24px;
        background: ${props =>
            props.$value
                ? props.$rightColor || 'var(--color-primary)'
                : props.$leftColor || 'var(--color-primary)'};
        border: 1px solid
            ${props =>
                props.$value
                    ? props.$rightColor || 'var(--color-primary)'
                    : props.$leftColor || 'var(--color-primary)'};
        border-radius: var(--radius-full);
        cursor: pointer;
        transition: all var(--transition-fast);

        &.disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-secondary);
            border-color: var(--color-border-primary);
        }

        &:hover:not(.disabled) {
            box-shadow: 0 0 0 3px
                ${props => {
                    const color = props.$value
                        ? props.$rightColor || 'rgb(59, 130, 246)'
                        : props.$leftColor || 'rgb(59, 130, 246)';
                    return `${color}1a`; // Add alpha for glow
                }};
        }

        .slider {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 18px;
            height: 18px;
            background: var(--color-text-inverse);
            border-radius: var(--radius-full);
            transition: transform var(--transition-fast);
            box-shadow: var(--shadow-sm);

            &.active {
                transform: translateX(24px);
            }
        }
    }
`;

export const ToggleSwitch = ({
    value,
    onChange,
    leftLabel,
    rightLabel,
    disabled = false,
    leftColor,
    rightColor,
}: ToggleSwitchProps) => {
    const handleToggle = () => {
        if (!disabled) {
            onChange(!value);
        }
    };

    return (
        <StyledToggleSwitch
            $leftColor={leftColor}
            $rightColor={rightColor}
            $value={value}
        >
            <span
                className={`label left ${!value ? 'active' : ''} ${
                    disabled ? 'disabled' : ''
                }`}
                onClick={() => !disabled && onChange(false)}
            >
                {leftLabel}
            </span>
            <div
                className={`switch ${disabled ? 'disabled' : ''}`}
                onClick={handleToggle}
                role="switch"
                aria-checked={value}
                aria-label={`Toggle between ${leftLabel} and ${rightLabel}`}
                tabIndex={disabled ? -1 : 0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggle();
                    }
                }}
            >
                <div className={`slider ${value ? 'active' : ''}`} />
            </div>
            <span
                className={`label right ${value ? 'active' : ''} ${
                    disabled ? 'disabled' : ''
                }`}
                onClick={() => !disabled && onChange(true)}
            >
                {rightLabel}
            </span>
        </StyledToggleSwitch>
    );
};
