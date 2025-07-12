import React from 'react';
import ReactDOM from 'react-dom/client';
import * as styled from 'styled-components';
import { App } from './app/app.js';
import { AppProvider } from './app/context/app.js';

const GlobalStyle = styled.createGlobalStyle`
    * {
        box-sizing: border-box;
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
        text-rendering: optimizeLegibility;
        font-feature-settings: 'kern' 1;
    }

    body {
        margin: 0;
        width: 320px;
        height: 500px;
        overflow: hidden;
        position: relative;
    }

    #root {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    /* Enhanced focus styles */
    *:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
    }

    /* Smooth scrolling */
    * {
        scroll-behavior: smooth;
    }

    /* Selection styles */
    ::selection {
        background-color: rgba(99, 102, 241, 0.2);
        color: var(--color-text-primary);
    }

    /* Improved button reset */
    button {
        font-family: inherit;
        font-size: inherit;
        border: none;
        background: none;
        cursor: pointer;
        outline: none;
        transition: all var(--transition-fast);

        &:disabled {
            cursor: not-allowed;
        }
    }

    /* Improved input reset */
    input {
        font-family: inherit;
        font-size: inherit;
        border: none;
        outline: none;
        background: none;
        transition: all var(--transition-fast);

        &:disabled {
            cursor: not-allowed;
        }
    }

    /* Remove default input styles */
    input[type='color'] {
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        border: none;
        cursor: pointer;

        &::-webkit-color-swatch-wrapper {
            padding: 0;
            border: none;
            border-radius: inherit;
        }

        &::-webkit-color-swatch {
            border: none;
            border-radius: inherit;
        }

        &::-moz-color-swatch {
            border: none;
            border-radius: inherit;
        }
    }

    /* Typography improvements */
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
        margin: 0;
        font-weight: var(--font-weight-bold);
        line-height: 1.2;
        letter-spacing: -0.01em;
    }

    p {
        margin: 0;
        line-height: 1.5;
    }

    /* Link styles */
    a {
        color: var(--color-primary);
        text-decoration: none;
        transition: color var(--transition-fast);

        &:hover {
            color: var(--color-primary-hover);
        }
    }
`;

const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
    <AppProvider>
        <React.StrictMode>
            <GlobalStyle />
            <App />
        </React.StrictMode>
    </AppProvider>
);
