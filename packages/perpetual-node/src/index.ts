#!/usr/bin/env node

// Entry point for the Perpetual Node service
import { bootstrap } from './bootstrap.js';

bootstrap().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', error);
    process.exit(1);
});