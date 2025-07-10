import React from 'react';
import ReactDOM from 'react-dom/client';
import * as styled from 'styled-components';
import App from './App.js';

const GlobalStyle = styled.createGlobalStyle`
    :root {
        /* Design Tokens */
        --color-primary: #1d9bf0;
        --color-primary-hover: #1a8cd8;
        --color-primary-light: #e7f3ff;
        --color-secondary: #536471;
        --color-success: #00ba7c;
        --color-danger: #f4212e;
        --color-warning: #ffad1f;

        /* Neutral Colors */
        --color-bg-primary: #ffffff;
        --color-bg-secondary: #f7f9fa;
        --color-bg-tertiary: #eff3f4;
        --color-surface: #ffffff;
        --color-surface-hover: #f7f9fa;

        /* Text Colors */
        --color-text-primary: #0f1419;
        --color-text-secondary: #536471;
        --color-text-tertiary: #8b98a5;
        --color-text-inverse: #ffffff;

        /* Border Colors */
        --color-border-primary: #eff3f4;
        --color-border-secondary: #cfd9de;
        --color-border-focus: #1d9bf0;

        /* Spacing Scale */
        --space-1: 4px;
        --space-2: 8px;
        --space-3: 12px;
        --space-4: 16px;
        --space-5: 20px;
        --space-6: 24px;
        --space-8: 32px;

        /* Typography */
        --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            Helvetica, Arial, sans-serif;
        --font-size-xs: 12px;
        --font-size-sm: 14px;
        --font-size-base: 15px;
        --font-size-lg: 17px;
        --font-size-xl: 20px;

        /* Shadows */
        --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
        --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
        --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

        /* Border Radius */
        --radius-sm: 4px;
        --radius-md: 8px;
        --radius-lg: 12px;
        --radius-xl: 16px;
        --radius-full: 9999px;

        /* Transitions */
        --transition-fast: 150ms ease;
        --transition-normal: 250ms ease;
        --transition-slow: 350ms ease;
    }

    @media (prefers-color-scheme: dark) {
        :root {
            --color-primary: #1d9bf0;
            --color-primary-hover: #3ea6f2;
            --color-primary-light: #1e3a5f;

            --color-bg-primary: #000000;
            --color-bg-secondary: #16181c;
            --color-bg-tertiary: #1c1f23;
            --color-surface: #16181c;
            --color-surface-hover: #1c1f23;

            --color-text-primary: #e7e9ea;
            --color-text-secondary: #71767b;
            --color-text-tertiary: #536471;

            --color-border-primary: #2f3336;
            --color-border-secondary: #3e4144;
        }
    }

    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    html,
    body {
        font-family: var(--font-family);
        font-size: var(--font-size-base);
        line-height: 1.5;
        color: var(--color-text-primary);
        background-color: var(--color-bg-primary);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    body {
        margin: 0;
        width: 320px;
        height: 500px;
        overflow-x: hidden;
    }

    #root {
        width: 100%;
        height: 100%;
    }

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
`;

const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <GlobalStyle />
        <App />
    </React.StrictMode>
);
