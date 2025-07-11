import { defineContentScript } from '#imports';
import { MessageType, Messenger } from '../../messenger.js';

const messenger = new Messenger();

export default defineContentScript({
    matches: ['*://*.twitter.com/*', '*://*.x.com/*'],
    main() {
        console.log('X.com Account Tagger loaded');

        // Initialize the mutation observer with optimizations
        initializeMutationObserver();

        // Initial processing
        processPageForTags();
    },
});

// Process the page to find and display tags
async function processPageForTags() {
    // Find all profile links and usernames
    const selectors = [
        'a[href*="/status/"]', // Tweet links
        'a[href*="/user/"]', // User profile links
        '[data-testid="User-Name"]', // User name elements
        'a[href^="/"]', // General profile links
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        for (const element of elements) {
            const username = extractUsername(element);
            if (username) {
                await displayTagForElement(element, username);
            }
        }
    }
}

// Extract username from various X.com elements
function extractUsername(element: Element): string | null {
    // Try to get username from href
    if (element instanceof HTMLAnchorElement) {
        const href = element.href;
        const match = href.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
        if (match && match[1] && !match[1].includes('status')) {
            return match[1].toLowerCase();
        }
    }

    // Try to get from text content (for @username patterns)
    const text = element.textContent;
    if (text) {
        const match = text.match(/@([a-zA-Z0-9_]+)/);
        if (match) {
            return match[1].toLowerCase();
        }
    }

    return null;
}

// Display tag for a specific element
async function displayTagForElement(element: Element, username: string) {
    try {
        const tagsByUsername = await messenger.sendMessageToRuntime(
            MessageType.LIST_TAGS_BY_USERNAME,
            { username }
        );

        const tag = tagsByUsername[0];
        if (!tag) return;

        // Check if tag is already displayed
        if (
            element.parentNode?.querySelector(
                '.x-account-tag[data-username="' + username + '"]'
            )
        ) {
            return;
        }

        // Create tag element
        const tagElement = document.createElement('span');
        tagElement.className = 'x-account-tag';
        tagElement.setAttribute('data-username', username);
        tagElement.textContent = tag.name;
        tagElement.style.cssText = `
      background-color: ${tag.color};
      color: white;
      padding: 2px 6px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      margin-left: 6px;
      display: inline-block;
      vertical-align: middle;
      line-height: 1.2;
      white-space: nowrap;
    `;

        // Insert tag after the element
        if (element.parentNode) {
            element.parentNode.insertBefore(tagElement, element.nextSibling);
        }
    } catch (error) {
        console.error('Error getting tag for username:', username, error);
    }
}

// Optimized mutation observer implementation
let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
let isProcessing = false;
let lastProcessTime = 0;
const DEBOUNCE_DELAY = 300; // ms
const THROTTLE_DELAY = 1000; // ms

function initializeMutationObserver() {
    // Disconnect existing observer if any
    if (observer) {
        observer.disconnect();
    }

    // Create debounced processing function
    const debouncedProcess = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = window.setTimeout(() => {
            const now = Date.now();

            // Throttle processing to avoid excessive calls
            if (now - lastProcessTime < THROTTLE_DELAY) {
                return;
            }

            // Prevent concurrent processing
            if (isProcessing) {
                return;
            }

            isProcessing = true;
            lastProcessTime = now;

            processPageForTags()
                .catch(error => {
                    console.error('Error processing page for tags:', error);
                })
                .finally(() => {
                    isProcessing = false;
                });
        }, DEBOUNCE_DELAY);
    };

    // Create mutation observer with optimized callback
    observer = new MutationObserver(mutations => {
        // Check if any mutations are relevant
        let hasRelevantChanges = false;

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

                        // Check if the added element or its children contain profile links
                        if (
                            element.matches?.(
                                'a[href*="/"], [data-testid="User-Name"]'
                            ) ||
                            element.querySelector?.(
                                'a[href*="/"], [data-testid="User-Name"]'
                            )
                        ) {
                            hasRelevantChanges = true;
                            break;
                        }
                    }
                }
            }

            if (hasRelevantChanges) break;
        }

        // Only trigger processing if we found relevant changes
        if (hasRelevantChanges) {
            debouncedProcess();
        }
    });

    // Start observing with optimized configuration
    const targetNode = document.body || document.documentElement;

    try {
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            // Only observe child list changes, not attributes or character data
            attributes: false,
            characterData: false,
            // Don't observe attribute changes for better performance
            attributeOldValue: false,
            characterDataOldValue: false,
        });

        console.log('Mutation observer initialized successfully');
    } catch (error) {
        console.error('Failed to initialize mutation observer:', error);
    }
}

// Cleanup function for when the script is unloaded
function cleanup() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
}

// Listen for page unload to cleanup
window.addEventListener('beforeunload', cleanup);

// Listen for messages from background script
messenger.onRuntimeMessage(message => {
    switch (message.type) {
        case MessageType.REFRESH_TAGS: {
            // Remove existing tags and reprocess
            document
                .querySelectorAll('.x-account-tag')
                .forEach(el => el.remove());

            // Reset processing state
            isProcessing = false;
            lastProcessTime = 0;

            processPageForTags();
            break;
        }
    }
});
