import express, { Request, Response, NextFunction } from 'express';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { createServer } from 'http';
import log from 'loglevel';
import * as z from 'zod';
import {
    EncryptedTagCollectionSchema,
    UserManifestSchema,
    DidDocumentSchema,
} from '@my-mimisbrunnr/protocol';
import { unmarshalIPNSRecord } from 'ipns';
import { validate as validateIpnsRecord } from 'ipns/validator';
import { peerIdFromString } from '@libp2p/peer-id';

// Configure logging
log.setLevel((process.env.LOG_LEVEL as log.LogLevelDesc) || 'info');

const app = express();
const port = process.env.VALIDATOR_PORT || 3000;

// Configure AJV with strict validation
const ajv = new Ajv.default({
    strict: true,
    allErrors: true,
    verbose: true,
});
addFormats.default(ajv);

// Schema definitions for security validation
// Convert Zod schemas from @my-mimisbrunnr/protocol to JSON Schema for AJV validation
// Using Zod's native z.toJSONSchema() for conversion (Zod 4+)
const schemas = {
    'data/write/v1': z.toJSONSchema(
        z.union([
            EncryptedTagCollectionSchema,
            UserManifestSchema,
            DidDocumentSchema,
        ]),
        {
            target: 'draft-7', // AJV uses JSON Schema Draft 7 by default
        }
    ),

    'pubsub/head/v1': {
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
const validators: Record<string, ValidateFunction> = {};
for (const [schemaId, schema] of Object.entries(schemas)) {
    try {
        validators[schemaId] = ajv.compile(schema);
        log.info(`✓ Compiled schema: ${schemaId}`);
    } catch (error) {
        log.error(`✗ Failed to compile schema ${schemaId}:`, error);
        process.exit(1);
    }
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '16kb' }));

// access logging
app.use((req, res, next) => {
    const oldEnd = res.end;
    res.end = ((...args) => {
        log.info(`${req.method} ${req.url} ${res.statusCode}`);
        oldEnd.apply(res, args as [Buffer, BufferEncoding, () => void]);
    }) as typeof res.end;
    return next();
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    return next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'ajv-validation-sidecar',
        schemas: Object.keys(schemas),
        timestamp: Date.now(),
    });
});

// IPNS record validation endpoint
app.post('/validate/ipns/:peerId', async (req: Request, res: Response) => {
    try {
        const { peerId: peerIdString } = req.params;
        const marshaledRecord = req.body;

        // Validate request
        if (!peerIdString) {
            return res.status(400).json({
                valid: false,
                error: 'Missing peerId parameter',
            });
        }

        log.info(
            `IPNS validation request: peerId=${peerIdString}, body type=${typeof marshaledRecord}, is Buffer=${
                marshaledRecord instanceof Buffer
            }, length=${marshaledRecord?.length}, content-type=${
                req.headers['content-type']
            }`
        );

        if (!marshaledRecord || !(marshaledRecord instanceof Buffer)) {
            return res.status(400).json({
                valid: false,
                error: 'Missing or invalid IPNS record in request body',
                debug: {
                    bodyType: typeof marshaledRecord,
                    isBuffer: marshaledRecord instanceof Buffer,
                    length: marshaledRecord?.length,
                },
            });
        }

        // Parse Peer ID to get public key
        let peerId;
        try {
            peerId = peerIdFromString(peerIdString);
        } catch (error) {
            return res.status(400).json({
                valid: false,
                error: `Invalid Peer ID format: ${
                    error instanceof Error ? error.message : 'unknown error'
                }`,
            });
        }

        if (!peerId.publicKey) {
            return res.status(400).json({
                valid: false,
                error: 'Peer ID has no public key',
            });
        }

        // Unmarshal IPNS record
        let ipnsRecord;
        try {
            ipnsRecord = unmarshalIPNSRecord(new Uint8Array(marshaledRecord));
        } catch (error) {
            return res.status(400).json({
                valid: false,
                error: `Failed to unmarshal IPNS record: ${
                    error instanceof Error ? error.message : 'unknown error'
                }`,
            });
        }

        // Validate IPNS record signature against the public key
        try {
            await validateIpnsRecord(
                peerId.publicKey,
                new Uint8Array(marshaledRecord)
            );
        } catch (error) {
            return res.status(400).json({
                valid: false,
                error: `IPNS record validation failed: ${
                    error instanceof Error ? error.message : 'unknown error'
                }`,
            });
        }

        // All validations passed
        log.info(
            `✓ IPNS record validated successfully: peerId=${peerIdString}, value=${ipnsRecord.value}, sequence=${ipnsRecord.sequence}`
        );

        return res.json({
            valid: true,
            peerId: peerIdString,
            value: ipnsRecord.value.toString(),
            sequence: ipnsRecord.sequence.toString(),
        });
    } catch (error) {
        log.error('IPNS validation error:', error);
        return res.status(500).json({
            valid: false,
            error: 'Internal validation error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Schema validation endpoint
app.post('/validate', (req: Request, res: Response) => {
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
            return res.json({
                valid: true,
                schema,
                validationTime: `${validationTimeMs.toFixed(2)}ms`,
            });
        } else {
            return res.status(400).json({
                valid: false,
                schema,
                errors: validator.errors,
                validationTime: `${validationTimeMs.toFixed(2)}ms`,
            });
        }
    } catch (error) {
        log.error('Validation error:', error);
        return res.status(500).json({
            valid: false,
            error: 'Internal validation error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Schema listing endpoint
app.get('/schemas', (_req: Request, res: Response) => {
    res.json({
        schemas: Object.keys(schemas),
        definitions: schemas,
    });
});

// Error handling middleware
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Express error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message,
    });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        availableEndpoints: [
            '/health',
            '/validate',
            '/validate/ipns/:peerId',
            '/schemas',
        ],
    });
});

// Start server
const server = createServer(app);

server.listen(port, () => {
    log.info(`🔒 AJV Validation Sidecar listening on port ${port}`);
    log.info(`📋 Available schemas: ${Object.keys(schemas).join(', ')}`);
    log.info(
        `🚀 Endpoints: /health, /validate, /validate/ipns/:peerId, /schemas`
    );
});

// Graceful shutdown
const gracefulShutdown = () => {
    log.info('\n🛑 Shutting down validation sidecar...');
    server.close(() => {
        log.info('✓ Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;
