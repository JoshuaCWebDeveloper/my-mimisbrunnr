/**
 * Passphrase Manager Component (MM-28)
 *
 * Provides a secure passphrase input component with:
 * - Show/hide toggle
 * - Validation feedback
 * - Strength indicator
 * - Confirmation input (for creation)
 *
 * Used for both identity creation and unlocking flows.
 */

import React, { useState, useCallback } from 'react';
import { styled } from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faLock } from '@fortawesome/free-solid-svg-icons';

// ============================================================================
// Types
// ============================================================================

interface PassphraseManagerProps {
    /** Passphrase value */
    value: string;
    /** Change handler */
    onChange: (value: string) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Whether to show confirmation input */
    requireConfirmation?: boolean;
    /** Confirmation value (if requireConfirmation) */
    confirmValue?: string;
    /** Confirmation change handler */
    onConfirmChange?: (value: string) => void;
    /** Whether to show strength indicator */
    showStrength?: boolean;
    /** Validation error message */
    error?: string | null;
    /** Whether the input is disabled */
    disabled?: boolean;
}

type StrengthLevel = 'weak' | 'medium' | 'strong' | null;

// ============================================================================
// Component
// ============================================================================

export const PassphraseManager: React.FC<PassphraseManagerProps> = ({
    value,
    onChange,
    placeholder = 'Enter passphrase',
    requireConfirmation = false,
    confirmValue = '',
    onConfirmChange,
    showStrength = true,
    error = null,
    disabled = false,
}) => {
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Calculate passphrase strength
    const strength = useCallback((): StrengthLevel => {
        if (!value || value.length === 0) return null;
        if (value.length < 16) return 'weak';

        let score = 0;

        // Length bonus
        if (value.length >= 20) score += 2;
        else if (value.length >= 16) score += 1;

        // Character variety
        if (/[a-z]/.test(value)) score += 1;
        if (/[A-Z]/.test(value)) score += 1;
        if (/[0-9]/.test(value)) score += 1;
        if (/[^a-zA-Z0-9]/.test(value)) score += 1;

        // Multiple words bonus
        if (/\s/.test(value)) score += 1;

        if (score >= 5) return 'strong';
        if (score >= 3) return 'medium';
        return 'weak';
    }, [value]);

    const strengthLevel = strength();

    // Check if confirmation matches
    const confirmMatches =
        requireConfirmation &&
        confirmValue.length > 0 &&
        value === confirmValue;
    const confirmMismatch =
        requireConfirmation &&
        confirmValue.length > 0 &&
        value.length > 0 &&
        value !== confirmValue;

    return (
        <Container>
            {/* Main passphrase input */}
            <InputGroup>
                <IconWrapper>
                    <FontAwesomeIcon icon={faLock} />
                </IconWrapper>
                <Input
                    type={showPassphrase ? 'text' : 'password'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-label="Passphrase"
                />
                <ToggleButton
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    disabled={disabled}
                    type="button"
                    aria-label={
                        showPassphrase ? 'Hide passphrase' : 'Show passphrase'
                    }
                >
                    <FontAwesomeIcon
                        icon={showPassphrase ? faEyeSlash : faEye}
                    />
                </ToggleButton>
            </InputGroup>

            {/* Strength indicator */}
            {showStrength && strengthLevel && (
                <StrengthIndicator level={strengthLevel}>
                    <StrengthBar level={strengthLevel} />
                    <StrengthText>
                        Strength: {strengthLevel === 'strong' && 'Strong'}
                        {strengthLevel === 'medium' && 'Medium'}
                        {strengthLevel === 'weak' && 'Weak'}
                    </StrengthText>
                </StrengthIndicator>
            )}

            {/* Validation error */}
            {error && <ErrorMessage>{error}</ErrorMessage>}

            {/* Confirmation input */}
            {requireConfirmation && (
                <>
                    <InputGroup style={{ marginTop: '12px' }}>
                        <IconWrapper>
                            <FontAwesomeIcon icon={faLock} />
                        </IconWrapper>
                        <Input
                            type={showConfirm ? 'text' : 'password'}
                            value={confirmValue}
                            onChange={e => onConfirmChange?.(e.target.value)}
                            placeholder="Confirm passphrase"
                            disabled={disabled}
                            aria-label="Confirm passphrase"
                            $hasError={confirmMismatch}
                        />
                        <ToggleButton
                            onClick={() => setShowConfirm(!showConfirm)}
                            disabled={disabled}
                            type="button"
                            aria-label={
                                showConfirm
                                    ? 'Hide confirmation'
                                    : 'Show confirmation'
                            }
                        >
                            <FontAwesomeIcon
                                icon={showConfirm ? faEyeSlash : faEye}
                            />
                        </ToggleButton>
                    </InputGroup>

                    {/* Confirmation feedback */}
                    {confirmMismatch && (
                        <ErrorMessage>Passphrases do not match</ErrorMessage>
                    )}
                    {confirmMatches && (
                        <SuccessMessage>Passphrases match ✓</SuccessMessage>
                    )}
                </>
            )}

            {/* Helper text */}
            <HelperText>
                Use a strong, memorable passphrase. If you lose it, you cannot
                recover your identity.
            </HelperText>
        </Container>
    );
};

// ============================================================================
// Styled Components
// ============================================================================

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
`;

const InputGroup = styled.div`
    display: flex;
    align-items: center;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    padding: 0 12px;
    transition: border-color 0.2s;

    &:focus-within {
        border-color: #1da1f2;
    }
`;

const IconWrapper = styled.div`
    color: #657786;
    margin-right: 8px;
    display: flex;
    align-items: center;
`;

const Input = styled.input<{ $hasError?: boolean }>`
    flex: 1;
    border: none;
    outline: none;
    padding: 12px 0;
    font-size: 14px;
    font-family: inherit;
    background: transparent;

    ${props =>
        props.$hasError &&
        `
        color: #e0245e;
    `}

    &::placeholder {
        color: #aab8c2;
    }

    &:disabled {
        color: #aab8c2;
        cursor: not-allowed;
    }
`;

const ToggleButton = styled.button`
    background: none;
    border: none;
    color: #657786;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover:not(:disabled) {
        background: #f7f9fa;
        color: #1da1f2;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
`;

const StrengthIndicator = styled.div<{ level: StrengthLevel }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
`;

const StrengthBar = styled.div<{ level: StrengthLevel }>`
    height: 4px;
    border-radius: 2px;
    transition: all 0.3s;
    background: ${props => {
        switch (props.level) {
            case 'strong':
                return 'linear-gradient(90deg, #17bf63 0%, #17bf63 100%)';
            case 'medium':
                return 'linear-gradient(90deg, #ffad1f 0%, #ffad1f 66%)';
            case 'weak':
                return 'linear-gradient(90deg, #e0245e 0%, #e0245e 33%)';
            default:
                return '#e0e0e0';
        }
    }};
    width: ${props => {
        switch (props.level) {
            case 'strong':
                return '100%';
            case 'medium':
                return '66%';
            case 'weak':
                return '33%';
            default:
                return '0%';
        }
    }};
`;

const StrengthText = styled.div`
    font-size: 12px;
    color: #657786;
`;

const ErrorMessage = styled.div`
    color: #e0245e;
    font-size: 12px;
    padding: 4px 0;
`;

const SuccessMessage = styled.div`
    color: #17bf63;
    font-size: 12px;
    padding: 4px 0;
`;

const HelperText = styled.div`
    font-size: 11px;
    color: #657786;
    line-height: 1.4;
    margin-top: 4px;
`;
