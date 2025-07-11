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
