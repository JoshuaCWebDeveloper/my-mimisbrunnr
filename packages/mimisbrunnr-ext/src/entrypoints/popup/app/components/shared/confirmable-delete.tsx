import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useRef, ButtonHTMLAttributes } from 'react';
import { styled } from 'styled-components';

// Styled components
const StyledDeleteButton = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    outline: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;

const StyledIconWrapper = styled.span<{ $rotated: boolean }>`
    display: inline-block;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: ${({ $rotated }) =>
        $rotated ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

export interface ConfirmableDeleteProps
    extends ButtonHTMLAttributes<HTMLButtonElement> {
    onDelete?: () => void;
    ariaLabel?: string;
}

export const ConfirmableDelete: React.FC<ConfirmableDeleteProps> = ({
    onDelete,
    ariaLabel = 'Delete',
    ...props
}) => {
    const [rotated, setRotated] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleClick = () => {
        if (rotated) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            setRotated(false);
            onDelete?.();
        } else {
            setRotated(true);
            timerRef.current = setTimeout(() => {
                setRotated(false);
                timerRef.current = null;
            }, 3000);
        }
    };

    // SVG Trashcan icon
    return (
        <StyledDeleteButton
            type="button"
            aria-label={ariaLabel}
            {...props}
            onClick={handleClick}
        >
            <StyledIconWrapper $rotated={rotated}>
                <FontAwesomeIcon icon={faTrash} />
            </StyledIconWrapper>
        </StyledDeleteButton>
    );
};
