import { createGlobalStyle } from 'styled-components';

export default {
    default: createGlobalStyle`
    :root {
        /* Premium Color Palette */
        --color-primary: #6366f1;
        --color-primary-hover: #5b5ff0;
        --color-primary-light: #eef2ff;
        --color-primary-dark: #4f46e5;
        --color-secondary: #64748b;
        --color-accent: #f59e0b;
        --color-success: #10b981;
        --color-danger: #ef4444;
        --color-warning: #f59e0b;

        /* Sophisticated Neutrals */
        --color-bg-primary: #fefefe;
        --color-bg-secondary: #f8fafc;
        --color-bg-tertiary: #f1f5f9;
        --color-surface: #ffffff;
        --color-surface-hover: #f8fafc;
        --color-surface-elevated: #ffffff;

        /* Text Hierarchy */
        --color-text-primary: #0f172a;
        --color-text-secondary: #475569;
        --color-text-tertiary: #94a3b8;
        --color-text-inverse: #ffffff;
        --color-text-muted: #cbd5e1;

        /* Border System */
        --color-border-primary: #e2e8f0;
        --color-border-secondary: #cbd5e1;
        --color-border-focus: #6366f1;
        --color-border-hover: #94a3b8;

        /* Enhanced Spacing Scale */
        --space-0: 0px;
        --space-1: 4px;
        --space-2: 8px;
        --space-3: 12px;
        --space-4: 16px;
        --space-5: 20px;
        --space-6: 24px;
        --space-7: 28px;
        --space-8: 32px;
        --space-10: 40px;
        --space-12: 48px;

        /* Premium Typography */
        --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            'Helvetica Neue', Arial, sans-serif;
        --font-family-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
            'Courier New', monospace;
        --font-size-xs: 11px;
        --font-size-sm: 13px;
        --font-size-base: 14px;
        --font-size-md: 15px;
        --font-size-lg: 16px;
        --font-size-xl: 18px;
        --font-size-2xl: 20px;
        --font-weight-normal: 400;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;

        /* Sophisticated Shadows */
        --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);

        /* Modern Border Radius */
        --radius-xs: 2px;
        --radius-sm: 6px;
        --radius-md: 8px;
        --radius-lg: 12px;
        --radius-xl: 16px;
        --radius-2xl: 20px;
        --radius-full: 9999px;

        /* Smooth Transitions */
        --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
        --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
        --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);

        /* Glass Effect */
        --glass-bg: rgba(255, 255, 255, 0.8);
        --glass-border: rgba(255, 255, 255, 0.2);
        --backdrop-blur: blur(12px);

        /* Gradients */
        --gradient-primary: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        --gradient-surface: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
        --gradient-border: linear-gradient(145deg, #e2e8f0 0%, #cbd5e1 100%);
    }

    @media (prefers-color-scheme: dark) {
        :root {
            /* Dark Mode Premium Colors */
            --color-primary: #818cf8;
            --color-primary-hover: #a5b4fc;
            --color-primary-light: #1e1b4b;
            --color-primary-dark: #6366f1;

            /* Dark Sophisticated Neutrals */
            --color-bg-primary: #0f172a;
            --color-bg-secondary: #1e293b;
            --color-bg-tertiary: #334155;
            --color-surface: #1e293b;
            --color-surface-hover: #334155;
            --color-surface-elevated: #334155;

            /* Dark Text Hierarchy */
            --color-text-primary: #f1f5f9;
            --color-text-secondary: #cbd5e1;
            --color-text-tertiary: #64748b;
            --color-text-muted: #475569;

            /* Dark Border System */
            --color-border-primary: #334155;
            --color-border-secondary: #475569;
            --color-border-hover: #64748b;

            /* Dark Glass Effect */
            --glass-bg: rgba(30, 41, 59, 0.8);
            --glass-border: rgba(255, 255, 255, 0.1);

            /* Dark Gradients */
            --gradient-primary: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
            --gradient-surface: linear-gradient(145deg, #1e293b 0%, #334155 100%);
            --gradient-border: linear-gradient(145deg, #334155 0%, #475569 100%);
        }
    }`,
};
