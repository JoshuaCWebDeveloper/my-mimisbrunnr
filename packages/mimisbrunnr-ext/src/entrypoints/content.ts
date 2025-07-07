import { defineContentScript } from '#imports';

const runtime =
    typeof window !== 'undefined' && window.browser
        ? window.browser.runtime
        : typeof window !== 'undefined' && window.chrome
        ? window.chrome.runtime
        : undefined;

export default defineContentScript({
    matches: ['*://*.twitter.com/*', '*://*.x.com/*'],
    main() {
        console.log('X.com Account Tagger loaded');

        // Watch for dynamic content changes
        // const observer = new MutationObserver(() => {
        //     processPageForTags();
        // });

        // observer.observe(document.body, {
        //     childList: true,
        //     subtree: true,
        // });

        // Initial processing
        processPageForTags();
    },
});

interface UserTag {
    username: string;
    tag: string;
    color: string;
}

interface MessageRequest {
    type: 'GET_TAG' | 'REFRESH_TAGS';
    username?: string;
}

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
    if (!runtime) return;

    try {
        const response = await new Promise<{ tag?: UserTag }>(
            (resolve, reject) => {
                runtime.sendMessage(
                    { type: 'GET_TAG', username },
                    (response: { tag?: UserTag }) => {
                        if (runtime.lastError) {
                            reject(runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    }
                );
            }
        );

        const tag = response.tag;
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
        tagElement.textContent = tag.tag;
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

// Listen for messages from background script
if (runtime) {
    runtime.onMessage.addListener((message: MessageRequest) => {
        if (message.type === 'REFRESH_TAGS') {
            // Remove existing tags and reprocess
            document
                .querySelectorAll('.x-account-tag')
                .forEach(el => el.remove());
            processPageForTags();
        }
    });
}
