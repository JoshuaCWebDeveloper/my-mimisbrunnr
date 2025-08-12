// Client-Side IPNS Freshness Validation
// File: packages/mimisbrunnr-ext/src/services/security/ipns-validator.ts

interface IPNSRecord {
    name: string;
    value: string;
    sequence: number;
    validity: string; // RFC3339 timestamp
    ttl?: number;
}

interface NameState {
    lastSeqno: number;
    lastValidated: number;
}

/**
 * IPNS Freshness Validator implementing Vulnerability #7 mitigation
 *
 * As specified in mitigation spec:
 * 1. Monotonic seqno: Track lastSeqno[name]; accept only strictly higher sequence numbers
 * 2. Expiry/EOL check: Reject IPNS records that are expired (past validity/EOL)
 * 3. Signature validation: Rely on IPNS signature verification (in IPFS)
 * 4. No auto-persist: Treat IPNS resolves as hints; validate content before pinning
 * 5. Convergence preference: Prefer IPNS-over-PubSub for faster updates
 */
export class IPNSFreshnessValidator {
    private nameStates = new Map<string, NameState>();
    private readonly VALIDATION_CACHE_TTL = 300000; // 5 minutes

    /**
     * Validate IPNS record for replay protection (Vulnerability #7)
     * Main validation entry point implementing mitigation spec requirements
     */
    validateIPNSRecord(record: IPNSRecord): {
        valid: boolean;
        error?: string;
    } {
        // 1. Monotonic sequence number check
        const seqnoValid = this.isMonotonicSeqno(record.name, record.sequence);
        if (!seqnoValid.valid) {
            return seqnoValid;
        }

        // 2. Expiry/EOL validation
        const expiryValid = this.checkExpiry(record);
        if (!expiryValid.valid) {
            return expiryValid;
        }

        // 3. Signature validation (delegated to IPFS)
        const signatureValid = this.validateSignature(record);
        if (!signatureValid.valid) {
            return signatureValid;
        }

        return { valid: true };
    }

    private isMonotonicSeqno(
        name: string,
        sequence: number
    ): {
        valid: boolean;
        error?: string;
    } {
        const state = this.getNameState(name);

        if (sequence <= state.lastSeqno) {
            return {
                valid: false,
                error: `stale sequence number: ${sequence} <= ${state.lastSeqno}`,
            };
        }

        return { valid: true };
    }

    private checkExpiry(record: IPNSRecord): {
        valid: boolean;
        error?: string;
    } {
        try {
            const validityTime = new Date(record.validity).getTime();
            const now = Date.now();

            if (validityTime <= now) {
                return {
                    valid: false,
                    error: `IPNS record expired: ${record.validity}`,
                };
            }

            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `invalid validity timestamp: ${record.validity}`,
            };
        }
    }

    private validateSignature(record: IPNSRecord): {
        valid: boolean;
        error?: string;
    } {
        // Signature validation is handled by IPFS internally
        // We rely on IPFS to reject unsigned/invalid records
        // This is a placeholder for potential additional validation

        // In a full implementation, we might:
        // - Verify the record was signed by the expected key
        // - Check signature format and cryptographic validity
        // - Validate the record structure matches IPNS spec

        return { valid: true };
    }

    private getNameState(name: string): NameState {
        if (!this.nameStates.has(name)) {
            this.nameStates.set(name, {
                lastSeqno: 0,
                lastValidated: 0,
            });
        }
        return this.nameStates.get(name)!;
    }

    /**
     * Update the state after successful IPNS validation
     * Called after validating and processing an IPNS record
     */
    updateNameState(name: string, sequence: number): void {
        const state = this.getNameState(name);
        state.lastSeqno = sequence;
        state.lastValidated = Date.now();

        console.log(`✅ Updated IPNS state for ${name}: seqno ${sequence}`);
    }

    /**
     * Process IPNS resolution as hint only - never auto-pin
     * Implements the "No auto-persist" requirement from mitigation spec
     */
    async processIPNSResolution(
        name: string,
        resolution: {
            cid: string;
            sequence: number;
            validity: string;
        },
        fetchAndValidateContent: (
            cid: string
        ) => Promise<{ valid: boolean; content?: any; error?: string }>,
        pinViafacade: (cid: string) => Promise<boolean>
    ): Promise<{
        shouldPin: boolean;
        processed: boolean;
        cid?: string;
        error?: string;
    }> {
        console.log(
            `🔍 Processing IPNS resolution for ${name}: ${resolution.cid}`
        );

        try {
            // Validate the IPNS record first
            const validation = this.validateIPNSRecord({
                name,
                value: resolution.cid,
                sequence: resolution.sequence,
                validity: resolution.validity,
            });

            if (!validation.valid) {
                console.warn(
                    `🚫 IPNS validation failed for ${name}: ${validation.error}`
                );
                return {
                    shouldPin: false,
                    processed: false,
                    error: validation.error,
                };
            }

            // Fetch and validate content (IPNS is treated as hint only)
            console.log(`📡 Fetching content for IPNS hint: ${resolution.cid}`);

            const contentValidation = await fetchAndValidateContent(
                resolution.cid
            );
            if (!contentValidation.valid) {
                console.warn(
                    `🚫 Content validation failed: ${contentValidation.error}`
                );
                return {
                    shouldPin: false,
                    processed: false,
                    error: contentValidation.error,
                };
            }

            // Optionally pin via facade (never auto-pin)
            // This is where the client decides whether to pin based on business logic
            console.log(
                `🤔 Content validated, client should decide whether to pin: ${resolution.cid}`
            );

            // Update state after successful validation
            this.updateNameState(name, resolution.sequence);

            return {
                shouldPin: false, // Never auto-pin - client must decide
                processed: true,
                cid: resolution.cid,
            };
        } catch (error) {
            console.error(
                `❌ Error processing IPNS resolution for ${name}:`,
                error
            );
            return {
                shouldPin: false,
                processed: false,
                error: `processing error: ${error}`,
            };
        }
    }

    /**
     * Resolve IPNS with retry logic and exponential backoff
     * Implements retry specification from technical spec: 500ms→4s, max 5 attempts
     */
    async resolveWithRetry(
        name: string,
        resolve: (name: string) => Promise<any>,
        maxAttempts: number = 5
    ): Promise<{
        success: boolean;
        result?: any;
        error?: string;
        attempts: number;
    }> {
        let lastError: any = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(
                    `🔄 IPNS resolve attempt ${attempt}/${maxAttempts} for ${name}`
                );

                const result = await resolve(name);

                console.log(
                    `✅ IPNS resolve successful on attempt ${attempt}: ${name}`
                );
                return {
                    success: true,
                    result,
                    attempts: attempt,
                };
            } catch (error) {
                lastError = error;
                console.warn(
                    `⚠️ IPNS resolve attempt ${attempt} failed: ${error}`
                );

                // Don't wait after the last attempt
                if (attempt < maxAttempts) {
                    // Exponential backoff: 500ms, 1s, 2s, 4s
                    const delay = Math.min(
                        500 * Math.pow(2, attempt - 1),
                        4000
                    );
                    console.log(`⏱️ Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error(
            `❌ IPNS resolve failed after ${maxAttempts} attempts: ${lastError}`
        );
        return {
            success: false,
            error: `failed after ${maxAttempts} attempts: ${lastError}`,
            attempts: maxAttempts,
        };
    }

    /**
     * Check if an IPNS name has been recently validated (caching)
     */
    isRecentlyValidated(name: string): boolean {
        const state = this.getNameState(name);
        const now = Date.now();

        return now - state.lastValidated < this.VALIDATION_CACHE_TTL;
    }

    /**
     * Get validation statistics for monitoring
     */
    getStats(): {
        totalNames: number;
        recentlyValidated: number;
        averageSeqno: number;
        oldestValidation: number;
    } {
        const names = Array.from(this.nameStates.values());
        const now = Date.now();

        const recentlyValidated = names.filter(
            state => now - state.lastValidated < this.VALIDATION_CACHE_TTL
        ).length;

        const averageSeqno =
            names.length > 0
                ? names.reduce((sum, state) => sum + state.lastSeqno, 0) /
                  names.length
                : 0;

        const oldestValidation =
            names.length > 0
                ? Math.min(...names.map(state => state.lastValidated))
                : 0;

        return {
            totalNames: names.length,
            recentlyValidated,
            averageSeqno: Math.round(averageSeqno),
            oldestValidation,
        };
    }

    /**
     * Clear validation state (for testing or cleanup)
     */
    clearState(): void {
        this.nameStates.clear();
        console.log('🧹 Cleared all IPNS validation state');
    }

    /**
     * Get state for a specific name (debugging)
     */
    getNameStateInfo(name: string): NameState | null {
        return this.nameStates.get(name) || null;
    }

    /**
     * Operational guidance implementation:
     * - Publishes use strictly increasing seqno (handled by IPFS)
     * - Reasonable IPNS lifetime (≤24-48h) - validation only
     * - Republish cadence - not handled by client
     */
    validatePublishLifetime(validityPeriodMs: number): {
        valid: boolean;
        warning?: string;
    } {
        const maxRecommended = 48 * 60 * 60 * 1000; // 48 hours
        const minRecommended = 1 * 60 * 60 * 1000; // 1 hour

        if (validityPeriodMs > maxRecommended) {
            return {
                valid: false,
                warning: `IPNS validity period ${validityPeriodMs}ms exceeds recommended 48h maximum`,
            };
        }

        if (validityPeriodMs < minRecommended) {
            return {
                valid: false,
                warning: `IPNS validity period ${validityPeriodMs}ms below recommended 1h minimum`,
            };
        }

        return { valid: true };
    }
}
