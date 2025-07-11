import baseConfig, { baseOverrides } from '../../eslint.config.mjs';
import nx from '@nx/eslint-plugin';

export default [
    {
        ignores: [
            'packages/mimisbrunnr-ext/.output/**',
            'packages/mimisbrunnr-ext/.wxt/**',
        ],
    },
    ...baseConfig,
    ...nx.configs['flat/react'],
    {
        files: ['**/*.json'],
        rules: {},
        languageOptions: {
            parser: await import('jsonc-eslint-parser'),
        },
    },
    ...baseOverrides,
];
