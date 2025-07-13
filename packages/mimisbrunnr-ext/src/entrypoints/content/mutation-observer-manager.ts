import { XComSelectors } from './xcom-selectors.js';
import type { TagProcessor } from './tag-processor.js';

export interface ObserverConfig {
    debounceDelay: number;
    throttleDelay: number;
}

/**
 * Manages DOM change detection and debouncing for efficient tag processing
 */
export class MutationObserverManager {
    private observer: MutationObserver | null = null;
    private debounceTimer: number | null = null;
    private isProcessing = false;
    private lastProcessTime = 0;

    constructor(
        private processor: TagProcessor,
        private config: ObserverConfig = {
            debounceDelay: 300,
            throttleDelay: 1000,
        }
    ) {}

    initialize(): void {
        // Disconnect existing observer if any
        if (this.observer) {
            this.observer.disconnect();
        }

        // Create mutation observer with optimized callback
        this.observer = new MutationObserver(mutations =>
            this.handleMutations(mutations)
        );

        // Start observing with optimized configuration
        const targetNode = document.body || document.documentElement;

        try {
            this.observer.observe(targetNode, {
                childList: true,
                subtree: true,
                // Only observe child list changes, not attributes or character data
                attributes: false,
                characterData: false,
                // Don't observe attribute changes for better performance
                attributeOldValue: false,
                characterDataOldValue: false,
            });

            // eslint-disable-next-line no-console
            console.log('Mutation observer initialized successfully');
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to initialize mutation observer:', error);
        }
    }

    disconnect(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    private handleMutations(mutations: MutationRecord[]): void {
        // Check if any mutations are relevant
        if (!this.hasRelevantChanges(mutations)) {
            return;
        }

        // Debounce processing
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = window.setTimeout(
            () => this.processChanges(),
            this.config.debounceDelay
        );
    }

    private processChanges(): void {
        const now = Date.now();

        // Throttle processing to avoid excessive calls
        if (now - this.lastProcessTime < this.config.throttleDelay) {
            return;
        }

        // Prevent concurrent processing
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.lastProcessTime = now;

        this.processor
            .processPage()
            .catch(error => {
                // eslint-disable-next-line no-console
                console.error('Error processing page for tags:', error);
            })
            .finally(() => {
                this.isProcessing = false;
            });
    }

    private hasRelevantChanges(mutations: MutationRecord[]): boolean {
        for (const mutation of mutations) {
            // Only process if there are actual node additions
            if (
                mutation.type === 'childList' &&
                mutation.addedNodes.length > 0
            ) {
                // Check if added nodes contain relevant elements
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;

                        // Check if the added element or its children contain relevant selectors
                        if (XComSelectors.hasRelevantSelector(element)) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    // Reset processing flags (used when refreshing tags)
    resetProcessingState(): void {
        this.isProcessing = false;
        this.lastProcessTime = 0;
    }
}
