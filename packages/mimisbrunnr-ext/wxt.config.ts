import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        name: 'My Mimisbrunnr',
    },
    modules: ['@wxt-dev/module-react'],
    srcDir: 'src',
    zip: {
        artifactTemplate:
            'mimisbrunnr-ext-{{browser}}-{{manifestVersion}}-{{mode}}.zip',
        sourcesTemplate: 'mimisbrunnr-source-{{mode}}.zip',
    },
});
