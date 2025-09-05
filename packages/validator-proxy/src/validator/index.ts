import express from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createServer } from 'http';

const app = express();
const port = process.env.VALIDATOR_PORT || 3000;

// Configure AJV with strict validation
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
                minimum: 1,
                maximum: 9999999999999, // Reasonable timestamp limit
            },
            tags: {
                type: 'array',
                items: {
                    type: 'string',
                    pattern: '^[a-z0-9-]+$',
                    minLength: 1,
                    maxLength: 50,
                },
                minItems: 0,
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
                pattern: '^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})$',
                minLength: 46,
                maxLength: 59,
            },
            ts: {
                type: 'number',
                minimum: 1,
                maximum: 9999999999999,
            },
            author: {
                type: 'string',
                pattern: '^did:key:z[1-9A-HJ-NP-Za-km-z]+$',
                minLength: 10,
                maxLength: 200,
            },
        },
        additionalProperties: false,
    },
};

// Compile validators
const validators: Record<string, any> = {};
for (const [schemaId, schema] of Object.entries(schemas)) {
    try {
        validators[schemaId] = ajv.compile(schema);
        console.log(`✓ Compiled schema: ${schemaId}`);
    } catch (error) {
        console.error(`✗ Failed to compile schema ${schemaId}:`, error);
        process.exit(1);
    }
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'ajv-validation-sidecar',
        schemas: Object.keys(schemas),
        timestamp: Date.now(),
    });
});

// Schema validation endpoint
app.post('/validate', (req, res) => {
    try {
        const { schema, json } = req.body;

        // Validate request structure
        if (!schema || !json) {
            return res.status(400).json({
                valid: false,
                error: 'Missing required fields: schema and json',
            });
        }

        // Check if schema exists
        const validator = validators[schema];
        if (!validator) {
            return res.status(400).json({
                valid: false,
                error: `Unknown schema: ${schema}`,
                availableSchemas: Object.keys(validators),
            });
        }

        // Perform validation
        const startTime = process.hrtime.bigint();
        const valid = validator(json);
        const endTime = process.hrtime.bigint();
        const validationTimeMs = Number(endTime - startTime) / 1000000;

        if (valid) {
            res.json({
                valid: true,
                schema,
                validationTime: `${validationTimeMs.toFixed(2)}ms`,
            });
        } else {
            res.status(400).json({
                valid: false,
                schema,
                errors: validator.errors,
                validationTime: `${validationTimeMs.toFixed(2)}ms`,
            });
        }
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            valid: false,
            error: 'Internal validation error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Schema listing endpoint
app.get('/schemas', (req, res) => {
    res.json({
        schemas: Object.keys(schemas),
        definitions: schemas,
    });
});

// Error handling middleware
app.use((error: any, req: any, res: any, next: any) => {
    console.error('Express error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message,
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        availableEndpoints: ['/health', '/validate', '/schemas'],
    });
});

// Start server
const server = createServer(app);

server.listen(port, () => {
    console.log(`🔒 AJV Validation Sidecar listening on port ${port}`);
    console.log(`📋 Available schemas: ${Object.keys(schemas).join(', ')}`);
    console.log(`🚀 Endpoints: /health, /validate, /schemas`);
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('\n🛑 Shutting down validation sidecar...');
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;