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

    /* Reset button styles */
    button {
        font-family: inherit;
        font-size: inherit;
        border: none;
        background: none;
        cursor: pointer;
        outline: none;
    }

    /* Reset input styles */
    input {
        font-family: inherit;
        font-size: inherit;
        border: none;
        outline: none;
        background: none;
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
        width: 6px;
    }

    ::-webkit-scrollbar-track {
        background: var(--color-bg-secondary);
    }

    ::-webkit-scrollbar-thumb {
        background: var(--color-border-secondary);
        border-radius: var(--radius-full);
    }

    ::-webkit-scrollbar-thumb:hover {
        background: var(--color-text-tertiary);
    }

    header {
        padding: var(--space-4) var(--space-4) var(--space-3);
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-surface);

        h1 {
            font-size: var(--font-size-base);
            font-weight: 700;
            color: var(--color-text-primary);
            margin: 0;
            letter-spacing: -0.01em;
        }
    }

    main {
        flex: 1;
        padding: var(--space-3);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
`;

export const App = () => {
    return (
        <StyledApp>
            <Theme />

            <header>
                <h1 className="title">My Mimisbrunnr</h1>
            </header>

            <main>
                <TagManager />
            </main>
        </StyledApp>
    );
};
