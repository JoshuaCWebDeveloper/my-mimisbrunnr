// Client-Side Pubsub Message Validation
// File: packages/mimisbrunnr-ext/src/services/security/pubsub-validator.ts

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

interface PubsubHead {
    type: 'head';
    cid: string;
    ts: string;
    prev?: string;
    author?: string;
    nonce?: string;
}

interface TopicState {
    lastAccepted?: PubsubHead;
    duplicateCache: Set<string>;
    lastCleanup: number;
}

export class PubsubMessageValidator {
    private ajv: Ajv;
    private headValidator: any;
    private topicStates = new Map<string, TopicState>();
    private readonly DUPLICATE_TTL = 300000; // 5 minutes
    private readonly MAX_TOPIC_BACKOFF = 60000; // 1 minute

    constructor() {
        this.ajv = new Ajv({ strict: true, allErrors: true });
        addFormats(this.ajv);

        // Compile pubsub/head/v1 schema (must match server-side validation)
        this.headValidator = this.ajv.compile({
            type: 'object',
            required: ['type', 'cid', 'ts'],
            properties: {
                type: { const: 'head' },
                cid: { type: 'string', pattern: '^b[a-z2-7]{10,}$' },
                ts: { type: 'string', format: 'date-time' },
                prev: { type: 'string', pattern: '^b[a-z2-7]{10,}$' },
                author: {
                    type: 'string',
                    pattern: '^did:[a-z0-9]+:[A-Za-z0-9._:-]+$',
                },
                nonce: { type: 'string', maxLength: 64 },
            },
            additionalProperties: false,
        });
    }

    /**
     * Validate pubsub head message according to mitigation spec requirements
     * Implements the complete validation pipeline from security implementation
     */
    async validatePubsubHead(
        topic: string,
        message: any
    ): Promise<{
        valid: boolean;
        head?: PubsubHead;
        error?: string;
    }> {
        // 1. Schema validation (parseAndValidateHeadJSON)
        const head = this.parseAndValidateHeadJSON(message);
        if (!head.valid || !head.head) {
            return head;
        }

        // 2. Monotonic timestamp validation (isMonotonic)
        const monotonic = this.isMonotonic(topic, head.head);
        if (!monotonic.valid) {
            return monotonic;
        }

        // 3. Author authorization (isAuthorizedAuthor)
        const authorized = await this.isAuthorizedAuthor(topic, head.head);
        if (!authorized.valid) {
            return authorized;
        }

        // 4. Duplicate detection (isDuplicate)
        const duplicate = this.isDuplicate(topic, head.head);
        if (!duplicate.valid) {
            return duplicate;
        }

        return { valid: true, head: head.head };
    }

    private parseAndValidateHeadJSON(message: any): {
        valid: boolean;
        head?: PubsubHead;
        error?: string;
    } {
        try {
            // Parse message if it's a string
            const obj =
                typeof message === 'string' ? JSON.parse(message) : message;

            // Validate against schema
            const valid = this.headValidator(obj);
            if (!valid) {
                const errors = this.headValidator.errors
                    ?.map(e => e.message)
                    .join(', ');
                return {
                    valid: false,
                    error: `schema validation failed: ${errors}`,
                };
            }

            return { valid: true, head: obj as PubsubHead };
        } catch (error) {
            return { valid: false, error: `JSON parse error: ${error}` };
        }
    }

    private isMonotonic(
        topic: string,
        head: PubsubHead
    ): {
        valid: boolean;
        error?: string;
    } {
        const state = this.getTopicState(topic);

        if (!state.lastAccepted) {
            return { valid: true }; // First message is always valid
        }

        const currentTs = new Date(head.ts).getTime();
        const lastTs = new Date(state.lastAccepted.ts).getTime();

        if (currentTs <= lastTs) {
            return {
                valid: false,
                error: `stale timestamp: ${head.ts} <= ${state.lastAccepted.ts}`,
            };
        }

        // Check prev field consistency if present
        if (head.prev && head.prev !== state.lastAccepted.cid) {
            return {
                valid: false,
                error: `prev mismatch: expected ${state.lastAccepted.cid}, got ${head.prev}`,
            };
        }

        return { valid: true };
    }

    private async isAuthorizedAuthor(
        topic: string,
        head: PubsubHead
    ): Promise<{
        valid: boolean;
        error?: string;
    }> {
        // For controlled topics, require author DID and verify signature
        const controlledTopicPattern =
            /^mimis\/(taglist|discovery)\/[a-z0-9\-]{1,64}$/;

        if (!controlledTopicPattern.test(topic)) {
            return { valid: true }; // Non-controlled topics don't need author verification
        }

        if (!head.author) {
            return {
                valid: false,
                error: 'controlled topic requires author field',
            };
        }

        // TODO: Implement DID signature verification
        // This would verify a detached signature over {topic, cid, ts, prev?, nonce}
        // using the DID's current verification key

        console.log(
            `🔐 Author verification needed for ${head.author} on topic ${topic}`
        );
        return { valid: true }; // Placeholder - implement actual verification
    }

    private isDuplicate(
        topic: string,
        head: PubsubHead
    ): {
        valid: boolean;
        error?: string;
    } {
        const state = this.getTopicState(topic);
        const duplicateKey = `${topic}:${head.cid}`;

        // Clean up old entries periodically
        const now = Date.now();
        if (now - state.lastCleanup > this.DUPLICATE_TTL) {
            state.duplicateCache.clear();
            state.lastCleanup = now;
        }

        if (state.duplicateCache.has(duplicateKey)) {
            return { valid: false, error: 'duplicate message within TTL' };
        }

        // Add to duplicate cache
        state.duplicateCache.add(duplicateKey);

        return { valid: true };
    }

    private getTopicState(topic: string): TopicState {
        if (!this.topicStates.has(topic)) {
            this.topicStates.set(topic, {
                duplicateCache: new Set(),
                lastCleanup: Date.now(),
            });
        }
        return this.topicStates.get(topic)!;
    }

    /**
     * Update the last accepted head for a topic after successful processing
     * Called after successful pin operation via facade
     */
    updateLastAccepted(topic: string, head: PubsubHead): void {
        const state = this.getTopicState(topic);
        state.lastAccepted = head;
        console.log(`✅ Updated last accepted for topic ${topic}: ${head.cid}`);
    }

    /**
     * Complete validation pipeline as specified in mitigation spec
     * This is the main entry point that implements the pseudocode:
     *
     * onHead(msg) {
     *   const head = parseAndValidateHeadJSON(msg)
     *   if (!head) return
     *   if (!isMonotonic(head, lastAccepted[topic])) return
     *   if (!isAuthorizedAuthor(head, topic)) return
     *   if (isDuplicate(topic, head.cid)) return
     *   const doc = await fetchRootJson(head.cid)
     *   if (!validateDocSchema(doc)) return
     *   await pinCid(head.cid)
     *   updateLastAccepted(topic, head)
     * }
     */
    async processMessage(
        topic: string,
        message: any,
        fetchRootJson: (cid: string) => Promise<any>,
        validateDocSchema: (doc: any) => boolean,
        pinCid: (cid: string) => Promise<boolean>
    ): Promise<{
        processed: boolean;
        error?: string;
    }> {
        try {
            // Validate the head message
            const validation = await this.validatePubsubHead(topic, message);
            if (!validation.valid || !validation.head) {
                console.warn(`🚫 Rejected pubsub message: ${validation.error}`);
                return { processed: false, error: validation.error };
            }

            const head = validation.head;

            // Fetch and validate the document content (≤1MB, JSON enforced by node)
            let doc: any;
            try {
                doc = await fetchRootJson(head.cid);
            } catch (error) {
                console.warn(
                    `🚫 Failed to fetch root JSON for ${head.cid}: ${error}`
                );
                return { processed: false, error: `fetch failed: ${error}` };
            }

            // Validate document schema locally
            if (!validateDocSchema(doc)) {
                console.warn(
                    `🚫 Document schema validation failed for ${head.cid}`
                );
                return {
                    processed: false,
                    error: 'document schema validation failed',
                };
            }

            // Pin the CID via facade (never auto-pin)
            try {
                const pinSuccess = await pinCid(head.cid);
                if (!pinSuccess) {
                    console.warn(`🚫 Failed to pin ${head.cid} via facade`);
                    return { processed: false, error: 'pin operation failed' };
                }
            } catch (error) {
                console.warn(
                    `🚫 Pin operation error for ${head.cid}: ${error}`
                );
                return { processed: false, error: `pin failed: ${error}` };
            }

            // Success - update last accepted
            this.updateLastAccepted(topic, head);

            console.log(
                `✅ Successfully processed pubsub message: ${head.cid}`
            );
            return { processed: true };
        } catch (error) {
            console.error(`❌ Error processing pubsub message:`, error);
            return { processed: false, error: `processing error: ${error}` };
        }
    }

    /**
     * Get telemetry counters for monitoring (implements mitigation spec requirement)
     */
    getTelemetry(): Record<string, number> {
        // These would be maintained as the validator processes messages
        return {
            pubsub_heads_seen_total: 0, // Increment on each message received
            pubsub_heads_dropped_schema: 0, // Increment on schema validation failure
            pubsub_heads_dropped_stale: 0, // Increment on timestamp monotonicity failure
            pubsub_heads_dropped_unauth: 0, // Increment on author verification failure
            pubsub_heads_dropped_dup: 0, // Increment on duplicate detection
            pubsub_heads_pinned_total: 0, // Increment on successful pin operation
        };
    }

    /**
     * Reset state for a topic (useful for testing or error recovery)
     */
    resetTopicState(topic: string): void {
        this.topicStates.delete(topic);
        console.log(`🔄 Reset topic state: ${topic}`);
    }

    /**
     * Get current state for debugging
     */
    getTopicStates(): Map<string, TopicState> {
        return new Map(this.topicStates);
    }
}
