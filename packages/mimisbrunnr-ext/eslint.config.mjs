import baseConfig from '../../eslint.config.mjs';

export default [
    {
        ignores: [
            'packages/mimisbrunnr-ext/.output/**',
            'packages/mimisbrunnr-ext/.wxt/**',
        ],
    },
    ...baseConfig,
    {
        files: ['**/*.json'],
        rules: {},
        languageOptions: {
            parser: await import('jsonc-eslint-parser'),
        },
    },
];
