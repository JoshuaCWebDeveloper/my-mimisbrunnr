// AJV Validation Sidecar Service
// File: packages/perpetual-node/src/validator/index.ts

import express from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const app = express();
const port = process.env.PORT || 3000;

// Initialize AJV with strict validation
const ajv = new Ajv({
    strict: true,
    allErrors: true,
    verbose: true,
});
addFormats(ajv);

// Schema definitions for security validation
const schemas = {
    'taglist/v1': {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://schemas.mimisbrunnr.local/taglist/v1.json',
        type: 'object',
        required: ['version', 'handle', 'updated', 'tags'],
        properties: {
            version: { const: 1 },
            handle: {
                type: 'string',
                pattern: '^@[a-zA-Z0-9_]{1,15}$',
                minLength: 2,
                maxLength: 16,
            },
            updated: {
                type: 'number',
                minimum: 1700000000000, // Reasonable timestamp lower bound
                maximum: 9999999999999, // Reasonable timestamp upper bound
            },
            tags: {
                type: 'array',
                items: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 50,
                    pattern: '^[a-zA-Z0-9_-]+$',
                },
                maxItems: 100,
                uniqueItems: true,
            },
        },
        additionalProperties: false,
    },

    'pubsub/head/v1': {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://schemas.mimisbrunnr.local/pubsub/head/v1.json',
        type: 'object',
        required: ['type', 'cid', 'ts'],
        properties: {
            type: { const: 'head' },
            cid: {
                type: 'string',
                pattern: '^b[a-z2-7]{10,}$',
                maxLength: 100,
            },
            ts: {
                type: 'string',
                format: 'date-time',
            },
            prev: {
                type: 'string',
                pattern: '^b[a-z2-7]{10,}$',
                maxLength: 100,
            },
            author: {
                type: 'string',
                pattern: '^did:[a-z0-9]+:[A-Za-z0-9._:-]+$',
                maxLength: 200,
            },
            nonce: {
                type: 'string',
                maxLength: 64,
            },
        },
        additionalProperties: false,
    },
};

// Compile schemas for performance
const compiledSchemas = Object.entries(schemas).reduce((acc, [key, schema]) => {
    try {
        acc[key] = ajv.compile(schema);
        console.log(`✓ Compiled schema: ${key}`);
    } catch (error) {
        console.error(`✗ Failed to compile schema ${key}:`, error);
        process.exit(1);
    }
    return acc;
}, {} as Record<string, any>);

// Middleware
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        schemas: Object.keys(compiledSchemas),
        timestamp: new Date().toISOString(),
    });
});

// Primary schema validation endpoint used by facades
app.post('/validate', (req, res) => {
    const startTime = Date.now();
    const { schema, json } = req.body;

    if (!schema || !json) {
        return res.status(400).json({
            error: 'missing required fields',
            required: ['schema', 'json'],
        });
    }

    const validator = compiledSchemas[schema];
    if (!validator) {
        return res.status(400).json({
            error: 'unknown schema',
            available: Object.keys(compiledSchemas),
        });
    }

    const valid = validator(json);
    const processingTime = Date.now() - startTime;

    if (valid) {
        res.json({
            valid: true,
            processingTimeMs: processingTime,
        });
    } else {
        res.status(400).json({
            valid: false,
            processingTimeMs: processingTime,
            errors: validator.errors?.map(error => ({
                path: error.instancePath,
                message: error.message,
                value: error.data,
            })),
        });
    }
});

// Batch validation endpoint for efficiency
app.post('/validate/batch', (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'items must be a non-empty array',
        });
    }

    if (items.length > 10) {
        return res.status(400).json({
            error: 'batch size limited to 10 items',
        });
    }

    const results = items.map((item, index) => {
        const { schema, json } = item;
        const validator = compiledSchemas[schema];

        if (!validator) {
            return {
                index,
                valid: false,
                error: 'unknown schema',
            };
        }

        const valid = validator(json);

        return {
            index,
            valid,
            errors: valid
                ? undefined
                : validator.errors?.map(error => ({
                      path: error.instancePath,
                      message: error.message,
                  })),
        };
    });

    res.json({ results });
});

// Error handling middleware
app.use(
    (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) => {
        console.error('Validation service error:', err);
        res.status(500).json({
            error: 'internal validation error',
            message:
                process.env.NODE_ENV === 'development'
                    ? err.message
                    : 'internal server error',
        });
    }
);

// Start the validation sidecar service
app.listen(port, () => {
    console.log(`🔒 Validation sidecar running on port ${port}`);
    console.log(
        `📋 Available schemas: ${Object.keys(compiledSchemas).join(', ')}`
    );
    console.log(`🚀 Ready to validate content for security facades`);
});
