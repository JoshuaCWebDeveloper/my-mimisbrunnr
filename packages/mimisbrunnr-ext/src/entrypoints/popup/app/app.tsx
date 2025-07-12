import { styled } from 'styled-components';
import { TagManager } from './components/tag-manager.js';
import themes from './themes.js';

const Theme = themes.default;

// Styled Components
const StyledApp = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--color-bg-primary);
    overflow: hidden;
    position: relative;

    /* Reset button styles */
    button {
        font-family: inherit;
        font-size: inherit;
        border: none;
        background: none;
        cursor: pointer;
        outline: none;
        transition: all var(--transition-fast);
    }

    /* Reset input styles */
    input {
        font-family: inherit;
        font-size: inherit;
        border: none;
        outline: none;
        background: none;
        transition: all var(--transition-fast);
    }

    /* Premium scrollbar styling */
    ::-webkit-scrollbar {
        width: 4px;
    }

    ::-webkit-scrollbar-track {
        background: transparent;
    }

    ::-webkit-scrollbar-thumb {
        background: var(--color-border-secondary);
        border-radius: var(--radius-full);
        transition: background var(--transition-fast);
    }

    ::-webkit-scrollbar-thumb:hover {
        background: var(--color-border-hover);
    }

    /* Backdrop blur effect */
    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--gradient-surface);
        z-index: -1;
    }
`;

const StyledHeader = styled.header`
    position: relative;
    padding: var(--space-6) var(--space-6) var(--space-5);
    background: var(--glass-bg);
    backdrop-filter: var(--backdrop-blur);
    border-bottom: 1px solid var(--color-border-primary);
    box-shadow: var(--shadow-sm);

    .header-content {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }

    .logo {
        width: 28px;
        height: 28px;
        background: var(--gradient-primary);
        border-radius: var(--radius-lg);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-inverse);
        box-shadow: var(--shadow-md);
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
                rgba(255, 255, 255, 0.2) 0%,
                transparent 50%
            );
        }
    }

    .title-section {
        flex: 1;
    }

    .title {
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0;
        letter-spacing: -0.02em;
        line-height: 1.2;
    }

    .subtitle {
        font-size: var(--font-size-xs);
        color: var(--color-text-tertiary);
        margin: var(--space-1) 0 0;
        font-weight: var(--font-weight-medium);
        letter-spacing: 0.01em;
        text-transform: uppercase;
    }
`;

const StyledMain = styled.main`
    flex: 1;
    padding: var(--space-5) var(--space-6) var(--space-6);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    position: relative;

    /* Subtle gradient overlay */
    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 20px;
        background: linear-gradient(
            to bottom,
            var(--color-bg-primary),
            transparent
        );
        pointer-events: none;
        z-index: 1;
    }
`;

export const App = () => {
    return (
        <StyledApp>
            <Theme />

            <StyledHeader>
                <div className="header-content">
                    <div className="logo">M</div>
                    <div className="title-section">
                        <h1 className="title">Mimisbrunnr</h1>
                        <p className="subtitle">Tag Manager</p>
                    </div>
                </div>
            </StyledHeader>

            <StyledMain>
                <TagManager />
            </StyledMain>
        </StyledApp>
    );
};
