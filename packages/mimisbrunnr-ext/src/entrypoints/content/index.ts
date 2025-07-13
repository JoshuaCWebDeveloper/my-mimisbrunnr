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

const findNearestCommonAncestor = ([elementA, elementB]: [
    Element,
    Element
]): Element | null => {
    const ancestorsA = new Set<Element>();
    let currentA: Element | null = elementA;
    while (currentA) {
        ancestorsA.add(currentA);
        currentA = currentA.parentElement;
    }
    let currentB: Element | null = elementB;
    while (currentB) {
        if (ancestorsA.has(currentB)) {
            return currentB;
        }
        currentB = currentB.parentElement;
    }
    return null;
};

// Process the page to find and display tags
async function processPageForTags() {
    // Find user name elements specifically - these contain the account names
    const userNameElements = document.querySelectorAll(
        '[data-testid="User-Name"]'
    );

    for (const element of userNameElements) {
        const username = extractUsernameFromUserNameElement(element);
        if (username) {
            await displayTagForUserNameElement(element, username);
        }
    }

    // Also process profile page header elements
    await processProfileHeaderForTags();

    // Process profile hover cards (popups)
    await processProfileHoverCardsForTags();
}

// Extract username from User-Name elements
function extractUsernameFromUserNameElement(element: Element): string | null {
    // Look for the username link within the User-Name element
    const usernameLink = element.querySelector('a[href^="/"]');
    if (usernameLink instanceof HTMLAnchorElement) {
        const href = usernameLink.href;
        const match = href.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
        if (
            match &&
            match[1] &&
            !match[1].includes('status') &&
            !match[1].includes('i/')
        ) {
            return match[1].toLowerCase();
        }
    }

    // Fallback: try to get from text content (for @username patterns)
    const text = element.textContent;
    if (text) {
        const match = text.match(/@([a-zA-Z0-9_]+)/);
        if (match) {
            return match[1].toLowerCase();
        }
    }

    return null;
}

// Process profile header for tags
async function processProfileHeaderForTags() {
    // Look for profile header elements - these are typically in the main profile section
    const profileHeaderSelectors = [
        '[data-testid="UserName"]',
        '[data-testid="UserProfileHeader_Items"]',
        '[data-testid="UserDescription"]',
    ];

    for (const selector of profileHeaderSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            const username = extractUsernameFromProfileElement(element);
            if (username) {
                await displayTagForProfileElement(element, username);
                break; // Only process one profile header per selector
            }
        }
    }
}

// Process profile hover cards for tags
async function processProfileHoverCardsForTags() {
    // Look for profile hover card elements - these appear when hovering over usernames
    const hoverCardSelectors = [
        '[data-testid="hoverCard"]',
        '[data-testid="HoverCard"]',
        '[role="tooltip"]',
        '[data-testid="UserCell"]',
        '[data-testid="HoverCard-tweet"]',
        '[data-testid="card.layoutLarge.detail"]',
        // More generic selectors that might catch hover cards
        '[role="dialog"]',
        '[data-testid*="hover"]',
        '[data-testid*="card"]',
    ];

    console.log('Processing hover cards for tags...');

    for (const selector of hoverCardSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(
            `Found ${elements.length} elements for selector: ${selector}`
        );

        for (const element of elements) {
            // Check if this looks like a profile hover card
            if (isProfileHoverCard(element)) {
                console.log('Found profile hover card:', element);
                const username = extractUsernameFromProfileElement(element);
                console.log('Extracted username from hover card:', username);
                if (username) {
                    await displayTagForProfileCard(element, username);
                }
            }
        }
    }
}

// Check if an element is a profile hover card
function isProfileHoverCard(element: Element): boolean {
    console.log('Checking if element is profile hover card:', element);

    // Look for common patterns in profile hover cards
    const hasUserInfo =
        element.querySelector('[data-testid="UserName"]') ||
        element.querySelector('[data-testid="UserCell"]') ||
        element.querySelector('[data-testid="User-Name"]') ||
        element.querySelector('a[href^="/"]');

    // Check if it contains profile-like content
    const textContent = element.textContent || '';
    const hasAtSymbol = textContent.includes('@');
    const hasFollowButton =
        element.querySelector('[data-testid*="follow"]') ||
        element.querySelector('[data-testid*="Follow"]') ||
        element.querySelector('[role="button"]');

    // Additional checks for hover cards
    const hasProfileImage =
        element.querySelector('[data-testid="UserAvatar"]') ||
        element.querySelector('img[src*="profile"]');

    // Check if it's positioned like a tooltip/overlay
    const computedStyle = window.getComputedStyle(element);
    const isPositionedOverlay =
        computedStyle.position === 'absolute' ||
        computedStyle.position === 'fixed' ||
        computedStyle.zIndex !== 'auto';

    console.log('Hover card check results:', {
        hasUserInfo,
        hasAtSymbol,
        hasFollowButton,
        hasProfileImage,
        isPositionedOverlay,
        textContent: textContent.slice(0, 100),
    });

    // Should have user info and either @ symbol or follow button, plus positioning
    return !!(
        hasUserInfo &&
        (hasAtSymbol || hasFollowButton || hasProfileImage)
    );
}

// Extract username from profile page elements
function extractUsernameFromProfileElement(element: Element): string | null {
    // First try to find username from the URL if we're on a profile page
    const currentUrl = window.location.pathname;
    const urlMatch = currentUrl.match(/^\/([^/]+)(?:\/|$)/);
    if (
        urlMatch &&
        urlMatch[1] &&
        !urlMatch[1].includes('status') &&
        !urlMatch[1].includes('i') &&
        !urlMatch[1].includes('search') &&
        !urlMatch[1].includes('home') &&
        !urlMatch[1].includes('notifications') &&
        !urlMatch[1].includes('messages')
    ) {
        return urlMatch[1].toLowerCase();
    }

    // Fallback: look for username links within the element
    const usernameLink = element.querySelector('a[href^="/"]');
    if (usernameLink instanceof HTMLAnchorElement) {
        const href = usernameLink.href;
        const match = href.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
        if (
            match &&
            match[1] &&
            !match[1].includes('status') &&
            !match[1].includes('i/')
        ) {
            return match[1].toLowerCase();
        }
    }

    // Look for @username patterns in text content
    const text = element.textContent;
    if (text) {
        const match = text.match(/@([a-zA-Z0-9_]+)/);
        if (match) {
            return match[1].toLowerCase();
        }
    }

    return null;
}

// Display tag for a profile element in its own row (reuses tweet tag logic)
async function displayTagForProfileElement(element: Element, username: string) {
    try {
        // Find the best container for the profile element
        const profileContainer = findProfileContainer(element);
        if (!profileContainer) return;

        // Reuse the unified tag display logic with profile styling
        await displayTagsForContainer(profileContainer, username, true);
    } catch (error) {
        console.error(
            'Error getting tag for profile username:',
            username,
            error
        );
    }
}

async function displayTagForProfileCard(element: Element, username: string) {
    try {
        // start by finding the two profile links (should be display name and username)
        const [displayLink, usernameLink] = [
            ...element.querySelectorAll(
                'a[role="link"]:not([aria-hidden="true"])'
            ),
        ].slice(0, 2);

        if (!displayLink || !usernameLink) return;

        // find the nearest common ancestor of the two links
        // we'll use it as our container
        const commonAncestor = findNearestCommonAncestor([
            displayLink,
            usernameLink,
        ]);

        if (!commonAncestor) return;

        // Reuse the unified tag display logic with profile styling
        await displayTagsForContainer(commonAncestor, username, true);
    } catch (error) {
        console.error(
            'Error getting tag for profile username:',
            username,
            error
        );
    }
}

// Find the best container for profile elements
function findProfileContainer(element: Element): Element | null {
    console.log('Finding profile container for:', element);

    // Look for common profile container patterns
    let current = element;
    let depth = 0;
    const maxDepth = 5;

    while (current && depth < maxDepth) {
        // Check for profile-specific containers including hover cards
        if (
            current.matches?.('[data-testid*="Profile"]') ||
            current.matches?.('[data-testid*="User"]') ||
            current.matches?.('[data-testid="hoverCard"]') ||
            current.matches?.('[data-testid="HoverCard"]') ||
            current.matches?.('[role="tooltip"]') ||
            current.classList.contains('profile-header') ||
            current.classList.contains('user-info')
        ) {
            return current;
        }

        // Look for containers that seem to be profile sections
        const textContent = current.textContent || '';
        if (textContent.includes('@') && textContent.length < 500) {
            return current;
        }

        const parent = current.parentElement;
        if (!parent) break;
        current = parent;
        depth++;
    }

    // Fallback to the original element
    return element;
}

// Unified tag display function that works for both tweets and profiles
async function displayTagsForContainer(
    container: Element,
    username: string,
    isProfile = false
) {
    try {
        const tagsByUsername = await messenger.sendMessageToRuntime(
            MessageType.LIST_TAGS_BY_USERNAME,
            { username }
        );

        if (!tagsByUsername || tagsByUsername.length === 0) return;

        // Check if this container has already been processed
        if (container.hasAttribute('data-tags-processed')) {
            return;
        }

        // Check if tags are already displayed for this container
        // Look for existing tags that are siblings of this container
        const existingTags = container.parentElement?.querySelector(
            '.x-account-tag-row[data-username="' + username + '"]'
        );
        if (existingTags) {
            // Mark as processed even if we found existing tags
            container.setAttribute('data-tags-processed', 'true');
            return;
        }

        // Also check if there's already a tag row immediately after this container
        const nextSibling = container.nextSibling;
        if (
            nextSibling &&
            nextSibling.nodeType === Node.ELEMENT_NODE &&
            (nextSibling as Element).classList.contains('x-account-tag-row')
        ) {
            container.setAttribute('data-tags-processed', 'true');
            return;
        }

        // Create a unique identifier for this specific container
        const containerId = generateUniqueId(container, username);

        // Create tag row container
        const tagRowContainer = document.createElement('div');
        tagRowContainer.className = 'x-account-tag-row';
        tagRowContainer.setAttribute('data-username', username);
        tagRowContainer.setAttribute('data-user-instance', containerId);
        // Use different margins for profile vs tweet containers
        const marginTop = isProfile ? '2px' : '4px';
        const marginBottom = isProfile ? '4px' : '0px';

        // Check if this is inside a hover card and needs special positioning
        const isInHoverCard =
            container.closest('[data-testid*="hover"]') !== null;

        if (isInHoverCard) {
            tagRowContainer.style.cssText = `
                margin-top: ${marginTop};
                margin-bottom: ${marginBottom};
                display: flex !important;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                width: calc(100% - 32px) !important;
                position: relative !important;
                z-index: 9999 !important;
                background: transparent;
                padding: 0 16px;
                box-sizing: border-box;
                visibility: visible !important;
                opacity: 1 !important;
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
            `;
        } else {
            tagRowContainer.style.cssText = `
                margin-top: ${marginTop};
                margin-bottom: ${marginBottom};
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                width: 100%;
            `;
        }

        // Create tag elements for all tags using the same styling as tweets
        tagsByUsername.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'x-account-tag';
            tagElement.setAttribute('data-tag-id', tag.id);
            tagElement.textContent = tag.name;
            tagElement.style.cssText = `
                background-color: ${tag.color}BB;
                color: white;
                padding: .3em .75em .2em;
                border-radius: .2em;
                font-size: 12px;
                font-weight: 500;
                display: inline-block;
                line-height: .8em;
                white-space: nowrap;
                margin: 0;
            `;
            tagRowContainer.appendChild(tagElement);
        });

        if (container.parentElement) {
            console.log('Inserting tag row after container:', container);
            console.log('Tag row container:', tagRowContainer);
            container.parentElement.insertBefore(
                tagRowContainer,
                container.nextSibling
            );
            // Mark this container as processed to prevent duplicates
            container.setAttribute('data-tags-processed', 'true');
            console.log(
                'Successfully inserted and marked container as processed'
            );
        } else {
            console.log(
                'Cannot insert tag row - container has no parent element'
            );
        }
    } catch (error) {
        console.error('Error getting tag for username:', username, error);
    }
}

// Display tag for a User-Name element in its own row
async function displayTagForUserNameElement(
    element: Element,
    username: string
) {
    try {
        // Find the user name container that contains both display name and username
        const userNameContainer = element.closest('[data-testid="User-Name"]');
        if (!userNameContainer) return;

        // Use the unified tag display logic
        await displayTagsForContainer(userNameContainer, username);
    } catch (error) {
        console.error('Error getting tag for username:', username, error);
    }
}

// Generate a unique identifier for a user name container instance
function generateUniqueId(
    userNameContainer: Element,
    username: string
): string {
    // Create a unique ID based on container content and DOM path, not position
    const parentText =
        userNameContainer.parentElement?.textContent?.slice(0, 50) || '';
    const containerText = userNameContainer.textContent?.slice(0, 30) || '';
    const siblingCount = userNameContainer.parentElement?.children.length || 0;

    // Use a hash of the content and DOM structure instead of coordinates
    const contentHash = btoa(parentText + containerText).slice(0, 8);
    return `${username}-${siblingCount}-${contentHash}`;
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

                        // Check if the added element or its children contain profile links, profile elements, or hover cards
                        if (
                            element.matches?.(
                                'a[href*="/"], [data-testid="User-Name"], [data-testid="UserName"], [data-testid="UserProfileHeader_Items"], [data-testid="UserDescription"], [data-testid="hoverCard"], [data-testid="HoverCard"], [role="tooltip"], [data-testid="UserCell"]'
                            ) ||
                            element.querySelector?.(
                                'a[href*="/"], [data-testid="User-Name"], [data-testid="UserName"], [data-testid="UserProfileHeader_Items"], [data-testid="UserDescription"], [data-testid="hoverCard"], [data-testid="HoverCard"], [role="tooltip"], [data-testid="UserCell"]'
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
            // Remove existing tag wrappers (which contain the tag rows)
            document.querySelectorAll('.x-account-tag-row').forEach(el => {
                // Remove the wrapper div if it exists
                const wrapper = el.parentElement;
                if (
                    wrapper &&
                    wrapper.children.length === 1 &&
                    wrapper.children[0] === el
                ) {
                    wrapper.remove();
                } else {
                    el.remove();
                }
            });

            // Fallback: remove any remaining individual tags
            document
                .querySelectorAll('.x-account-tag')
                .forEach(el => el.remove());

            // Clear processed flags from all User-Name containers
            document
                .querySelectorAll(
                    '[data-testid="User-Name"][data-tags-processed]'
                )
                .forEach(el => {
                    el.removeAttribute('data-tags-processed');
                });

            // Clear processed flags from all profile containers
            document.querySelectorAll('[data-tags-processed]').forEach(el => {
                el.removeAttribute('data-tags-processed');
            });

            // Reset processing state
            isProcessing = false;
            lastProcessTime = 0;

            processPageForTags();
            break;
        }
    }
});
