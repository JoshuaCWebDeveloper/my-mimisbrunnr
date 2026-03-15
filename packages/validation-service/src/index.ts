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
import { extractFilePart } from './extract-file-part.js';

// Configure logging
log.setLevel((process.env.LOG_LEVEL as log.LogLevelDesc) || 'info');

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

const app = express();

// access logging
app.use((req, res, next) => {
    const oldEnd = res.end;
    res.end = ((...args) => {
        log.info(`${req.method} ${req.url} ${res.statusCode}`);
        oldEnd.apply(res, args as [Buffer, BufferEncoding, () => void]);
    }) as typeof res.end;
    return next();
});

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    return next();
});

// IPNS record validation endpoint (for routing/put)
// Expects multipart/form-data with 'file' field containing the marshaled IPNS record
// Also validates HTTP method and extracts peer ID from query parameter
app.post(
    '/validate/ipns/:peerId',
    express.raw({ type: 'multipart/form-data', limit: '16kb' }),
    async (req: Request, res: Response) => {
        try {
            // Validate HTTP method
            if (req.method !== 'POST') {
                return res.status(405).json({
                    valid: false,
                    error: 'Method not allowed',
                });
            }

            const { peerId: peerIdString } = req.params;

            // Validate request
            if (!peerIdString) {
                return res.status(400).json({
                    valid: false,
                    error: 'Missing peerId parameter',
                });
            }

            const rawBody = req.body as Buffer;

            if (!rawBody || !rawBody.length) {
                return res.status(400).json({
                    valid: false,
                    error: 'Empty request body',
                });
            }

            // Check if body was buffered to disk
            if ((req as any).bodyBufferedToDisk) {
                return res.status(413).json({
                    valid: false,
                    error: 'Request body too large (buffered to disk)',
                });
            }

            // Check size limit (10KB for IPNS records)
            if (rawBody.length > 10240) {
                return res.status(413).json({
                    valid: false,
                    error: 'IPNS record too large (max 10KB)',
                });
            }

            const file = extractFilePart(
                rawBody,
                req.headers['content-type'] as string
            );

            log.info(
                `IPNS validation request: peerId=${peerIdString}, raw body size=${rawBody?.length}, content-type=${req.headers['content-type']}, file size=${file?.length}`
            );

            if (!file) {
                return res.status(400).json({
                    valid: false,
                    error: 'Missing file part in multipart/form-data',
                    debug: {
                        filePresent: !!file,
                        contentType: req.headers['content-type'],
                    },
                });
            }

            const marshaledRecord = file;

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
                ipnsRecord = unmarshalIPNSRecord(
                    new Uint8Array(marshaledRecord)
                );
            } catch (error) {
                return res.status(400).json({
                    valid: false,
                    error: `Failed to unmarshal IPNS record: ${error}`,
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
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
);

// JSON endpoints

// Middleware
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'ajv-validation-sidecar',
        schemas: Object.keys(schemas),
        timestamp: Date.now(),
    });
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

// DAG/put validation endpoint
// Accepts multipart/form-data with 'file' field and validates the content
app.post(
    '/validate/dag/put',
    express.raw({ type: 'multipart/form-data', limit: '2mb' }),
    async (req: Request, res: Response) => {
        try {
            // Validate HTTP method
            if (req.method !== 'POST') {
                return res.status(405).json({
                    valid: false,
                    error: 'Method not allowed',
                });
            }

            const rawBody = req.body as Buffer;
            const clientIp = req.headers['x-real-ip'] || req.ip;

            if (!rawBody || !rawBody.length) {
                return res.status(400).json({
                    valid: false,
                    error: 'Empty request body',
                });
            }

            // Check if body was buffered to disk
            if ((req as any).bodyBufferedToDisk) {
                return res.status(413).json({
                    valid: false,
                    error: 'Request body too large (buffered to disk)',
                });
            }

            // Extract file from multipart data
            const file = extractFilePart(
                rawBody,
                req.headers['content-type'] as string
            );

            if (!file) {
                return res.status(400).json({
                    valid: false,
                    error: 'Missing file part in multipart/form-data',
                });
            }

            // Check size limit (1MB)
            const maxSize = 1048576;
            if (file.length > maxSize) {
                return res.status(413).json({
                    valid: false,
                    error: `Content too large (max: ${maxSize} bytes, got: ${file.length} bytes)`,
                });
            }

            // Parse JSON
            let jsonObj;
            try {
                jsonObj = JSON.parse(file.toString('utf8'));
            } catch (error) {
                return res.status(415).json({
                    valid: false,
                    error: `Content is not valid JSON: ${
                        error instanceof Error ? error.message : 'parse error'
                    }`,
                });
            }

            // Validate against schema
            const validator = validators['data/write/v1'];
            const valid = validator(jsonObj);

            if (!valid) {
                return res.status(415).json({
                    valid: false,
                    schema: 'data/write/v1',
                    errors: validator.errors,
                });
            }

            log.info(
                `✓ DAG/put validation passed: ip=${clientIp}, size=${file.length}`
            );

            return res.status(200).json({
                valid: true,
                schema: 'data/write/v1',
            });
        } catch (error) {
            log.error('DAG/put validation error:', error);
            return res.status(500).json({
                valid: false,
                error: 'Internal validation error',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
);

// DAG/get validation endpoint
// Validates CID format from query parameter
app.get('/validate/dag/get', (req: Request, res: Response) => {
    try {
        // Validate HTTP method
        if (req.method !== 'GET') {
            return res.status(405).json({
                valid: false,
                error: 'Method not allowed',
            });
        }

        const cid = req.query.arg as string;

        if (!cid) {
            return res.status(400).json({
                valid: false,
                error: 'Missing required parameter: arg',
            });
        }

        // Validate CID format (CIDv0 or CIDv1)
        const isCIDv0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid);
        const isCIDv1 = /^b[a-z2-7]{58}$/.test(cid);

        if (!isCIDv0 && !isCIDv1) {
            return res.status(400).json({
                valid: false,
                error: 'Invalid CID format',
            });
        }

        return res.status(200).json({
            valid: true,
            cid,
        });
    } catch (error) {
        log.error('DAG/get validation error:', error);
        return res.status(500).json({
            valid: false,
            error: 'Internal validation error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Pin/add validation endpoint
// Validates CID format and optionally validates content by fetching from Kubo
// Query params:
//   - arg: CID to validate (required)
//   - validate-content: if "true", fetches and validates content (optional)
app.post('/validate/pin/add', async (req: Request, res: Response) => {
    try {
        // Validate HTTP method
        if (req.method !== 'POST') {
            return res.status(405).json({
                valid: false,
                error: 'Method not allowed',
            });
        }

        const cid = req.query.arg as string;
        const validateContent = req.query['validate-content'] === 'true';

        if (!cid) {
            return res.status(400).json({
                valid: false,
                error: 'Missing required parameter: arg',
            });
        }

        // Validate CID format (CIDv0 or CIDv1)
        const isCIDv0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid);
        const isCIDv1 = /^b[a-z2-7]+$/.test(cid) && cid.length >= 40 && cid.length <= 200;

        if (!isCIDv0 && !isCIDv1) {
            return res.status(400).json({
                valid: false,
                error: 'Invalid CID format',
            });
        }

        // If content validation is requested, fetch and validate from Kubo
        if (validateContent) {
            try {
                const kuboUrl = process.env.KUBO_URL || 'http://kubo:5001';
                const response = await fetch(`${kuboUrl}/api/v0/dag/get?arg=${cid}`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(30000), // 30 second timeout
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        return res.status(404).json({
                            valid: false,
                            error: 'Content not found',
                            cid,
                        });
                    }
                    return res.status(502).json({
                        valid: false,
                        error: 'Failed to fetch content from IPFS',
                        status: response.status,
                    });
                }

                // Check content size (1MB limit for pinned content validation)
                const contentLength = response.headers.get('content-length');

                if (contentLength && parseInt(contentLength) > 1048576) {
                    return res.status(413).json({
                        valid: false,
                        error: 'Content too large for validation',
                        limit: 1048576,
                        size: parseInt(contentLength),
                    });
                }

                // Read content with size limit
                const reader = response.body?.getReader();
                if (!reader) {
                    return res.status(502).json({
                        valid: false,
                        error: 'Failed to read content stream',
                    });
                }

                let contentBytes = new Uint8Array(0);
                let totalSize = 0;
                const maxSize = 1048576; // 1MB

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        totalSize += value.length;
                        if (totalSize > maxSize) {
                            reader.cancel();
                            return res.status(413).json({
                                valid: false,
                                error: 'Content too large',
                                limit: maxSize,
                                size: totalSize,
                            });
                        }

                        // Append to content
                        const newBytes = new Uint8Array(contentBytes.length + value.length);
                        newBytes.set(contentBytes);
                        newBytes.set(value, contentBytes.length);
                        contentBytes = newBytes;
                    }
                } finally {
                    reader.releaseLock();
                }

                // Parse JSON
                const contentString = new TextDecoder().decode(contentBytes);
                let jsonObj;
                try {
                    jsonObj = JSON.parse(contentString);
                } catch (error) {
                    return res.status(415).json({
                        valid: false,
                        error: 'Content is not valid JSON',
                        message: error instanceof Error ? error.message : 'parse error',
                    });
                }

                // Validate against schema
                const validator = validators['data/write/v1'];
                const valid = validator(jsonObj);

                if (!valid) {
                    return res.status(415).json({
                        valid: false,
                        schema: 'data/write/v1',
                        errors: validator.errors,
                    });
                }

                log.info(`✓ Pin/add validation with content check passed: cid=${cid}, size=${totalSize}`);

                return res.status(200).json({
                    valid: true,
                    cid,
                    contentSize: totalSize,
                    schema: 'data/write/v1',
                });
            } catch (error) {
                log.error('Pin/add content validation error:', error);
                return res.status(502).json({
                    valid: false,
                    error: 'Failed to validate content',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        log.info(`✓ Pin/add CID validation passed: cid=${cid}`);

        return res.status(200).json({
            valid: true,
            cid,
        });
    } catch (error) {
        log.error('Pin/add validation error:', error);
        return res.status(500).json({
            valid: false,
            error: 'Internal validation error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Pubsub/pub validation endpoint
// Validates topic and message content
app.post(
    '/validate/pubsub/pub',
    express.json({ limit: '64kb' }),
    (req: Request, res: Response) => {
        try {
            // Validate HTTP method
            if (req.method !== 'POST') {
                return res.status(405).json({
                    valid: false,
                    error: 'Method not allowed',
                });
            }

            const topic = req.query.arg as string;
            const messageContent = req.body;

            // Validate message body exists
            if (!messageContent) {
                return res.status(400).json({
                    valid: false,
                    error: 'Missing message content',
                });
            }

            // Check size limit (64KB for pubsub messages)
            const bodySize = JSON.stringify(messageContent).length;
            if (bodySize > 65536) {
                return res.status(413).json({
                    valid: false,
                    error: 'Message too large',
                    limit: 65536,
                    size: bodySize,
                });
            }

            // Validate topic
            if (!topic) {
                return res.status(400).json({
                    valid: false,
                    error: 'Missing required parameter: arg (topic)',
                });
            }

            // Topic allowlist pattern: mimis/(taglist|discovery)/[a-z0-9-]{1,64}
            const topicPattern = /^mimis\/(taglist|discovery)\/[a-z0-9-]{1,64}$/;
            if (!topicPattern.test(topic)) {
                return res.status(403).json({
                    valid: false,
                    error: 'Topic not allowed',
                    topic,
                });
            }

            // Validate message is valid JSON
            if (!messageContent || typeof messageContent !== 'object') {
                return res.status(400).json({
                    valid: false,
                    error: 'Message must be valid JSON',
                });
            }

            // Validate against pubsub schema
            const validator = validators['pubsub/head/v1'];
            const valid = validator(messageContent);

            if (!valid) {
                return res.status(415).json({
                    valid: false,
                    schema: 'pubsub/head/v1',
                    errors: validator.errors,
                });
            }

            log.info(`✓ Pubsub/pub validation passed: topic=${topic}`);

            return res.status(200).json({
                valid: true,
                topic,
                schema: 'pubsub/head/v1',
            });
        } catch (error) {
            log.error('Pubsub/pub validation error:', error);
            return res.status(500).json({
                valid: false,
                error: 'Internal validation error',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
);

// Pubsub/sub validation endpoint
// Validates topic only
app.post('/validate/pubsub/sub', (req: Request, res: Response) => {
    try {
        // Validate HTTP method
        if (req.method !== 'POST') {
            return res.status(405).json({
                valid: false,
                error: 'Method not allowed',
            });
        }

        const topic = req.query.arg as string;

        // Validate topic
        if (!topic) {
            return res.status(400).json({
                valid: false,
                error: 'Missing required parameter: arg (topic)',
            });
        }

        // Topic allowlist pattern: mimis/(taglist|discovery)/[a-z0-9-]{1,64}
        const topicPattern = /^mimis\/(taglist|discovery)\/[a-z0-9-]{1,64}$/;
        if (!topicPattern.test(topic)) {
            return res.status(403).json({
                valid: false,
                error: 'Topic not allowed',
                topic,
            });
        }

        log.info(`✓ Pubsub/sub validation passed: topic=${topic}`);

        return res.status(200).json({
            valid: true,
            topic,
        });
    } catch (error) {
        log.error('Pubsub/sub validation error:', error);
        return res.status(500).json({
            valid: false,
            error: 'Internal validation error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
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
            '/validate/dag/put',
            '/validate/dag/get',
            '/validate/pin/add',
            '/validate/pubsub/pub',
            '/validate/pubsub/sub',
            '/schemas',
        ],
    });
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
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
}

export default app;
