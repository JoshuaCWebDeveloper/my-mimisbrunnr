import { MessageType, Messenger, type Tag } from '../../messenger.js';
import { XComSelectors } from './xcom-selectors.js';

/**
 * Handles all tag processing logic from element selection through tag display
 */
export class TagProcessor {
    constructor(private messenger: Messenger) {}

    // Main processing entry point
    async processPage(): Promise<void> {
        // Find user name elements specifically - these contain the account names
        await this.processUserNameElements();

        // Also process profile page header elements
        await this.processProfileHeaders();

        // Process profile hover cards (popups)
        await this.processHoverCards();
    }

    // Process different element types
    private async processUserNameElements(): Promise<void> {
        const elements = XComSelectors.getUserNameElements();
        for (const element of elements) {
            const username = this.extractUsernameFromUserNameElement(element);
            if (username) {
                await this.displayTagForUserNameElement(element, username);
            }
        }
    }

    private async processProfileHeaders(): Promise<void> {
        const elements = XComSelectors.getProfileHeaderElements();
        for (const element of elements) {
            const username = this.extractUsernameFromProfileElement(element);
            if (username) {
                await this.displayTagForProfileElement(element, username);
                break; // Only process one profile header per selector
            }
        }
    }

    private async processHoverCards(): Promise<void> {
        // eslint-disable-next-line no-console
        console.log('Processing hover cards for tags...');
        const elements = XComSelectors.getHoverCardElements();

        for (const element of elements) {
            // Check if this looks like a profile hover card
            if (this.isProfileHoverCard(element)) {
                // eslint-disable-next-line no-console
                console.log('Found profile hover card:', element);
                const username =
                    this.extractUsernameFromProfileElement(element);
                // eslint-disable-next-line no-console
                console.log('Extracted username from hover card:', username);
                if (username) {
                    await this.displayTagForProfileCard(element, username);
                }
            }
        }
    }

    // Username extraction methods
    private extractUsernameFromUserNameElement(
        element: Element
    ): string | null {
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

    private extractUsernameFromProfileElement(element: Element): string | null {
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

    // Check if an element is a profile hover card
    private isProfileHoverCard(element: Element): boolean {
        // eslint-disable-next-line no-console
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

        // eslint-disable-next-line no-console
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

    // Tag display methods
    private async displayTagForUserNameElement(
        element: Element,
        username: string
    ): Promise<void> {
        try {
            // Find the user name container that contains both display name and username
            const userNameContainer =
                XComSelectors.findUserNameContainer(element);
            if (!userNameContainer) return;

            // Use the unified tag display logic
            await this.displayTagsForContainer(userNameContainer, username);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error getting tag for username:', username, error);
        }
    }

    private async displayTagForProfileElement(
        element: Element,
        username: string
    ): Promise<void> {
        try {
            // Find the best container for the profile element
            const profileContainer = this.findProfileContainer(element);
            if (!profileContainer) return;

            // Reuse the unified tag display logic with profile styling
            await this.displayTagsForContainer(
                profileContainer,
                username,
                true
            );
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
                'Error getting tag for profile username:',
                username,
                error
            );
        }
    }

    private async displayTagForProfileCard(
        element: Element,
        username: string
    ): Promise<void> {
        try {
            // start by finding the two profile links (should be display name and username)
            const [displayLink, usernameLink] =
                XComSelectors.getProfileLinksFromHoverCard(element);

            if (!displayLink || !usernameLink) return;

            // find the nearest common ancestor of the two links
            // we'll use it as our container
            const commonAncestor = XComSelectors.findNearestCommonAncestor([
                displayLink,
                usernameLink,
            ]);

            if (!commonAncestor) return;

            // Reuse the unified tag display logic with profile styling
            await this.displayTagsForContainer(commonAncestor, username, true);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
                'Error getting tag for profile username:',
                username,
                error
            );
        }
    }

    // Find the best container for profile elements
    private findProfileContainer(element: Element): Element | null {
        // eslint-disable-next-line no-console
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
    private async displayTagsForContainer(
        container: Element,
        username: string,
        isProfile = false
    ): Promise<void> {
        try {
            const tagsByUsername = await this.messenger.sendMessageToRuntime(
                MessageType.LIST_TAGS_BY_USERNAME,
                { username }
            );

            if (!tagsByUsername || tagsByUsername.length === 0) return;

            // Check if this container has already been processed
            if (this.isProcessed(container)) {
                return;
            }

            // Check if tags are already displayed for this container
            if (this.hasExistingTags(container, username)) {
                // Mark as processed even if we found existing tags
                this.markAsProcessed(container);
                return;
            }

            // Also check if there's already a tag row immediately after this container
            const nextSibling = container.nextSibling;
            if (
                nextSibling &&
                nextSibling.nodeType === Node.ELEMENT_NODE &&
                (nextSibling as Element).classList.contains('x-account-tag-row')
            ) {
                this.markAsProcessed(container);
                return;
            }

            // Create a unique identifier for this specific container
            const containerId = this.generateUniqueId(container, username);

            // Create tag row and insert it
            const tagRowContainer = this.createTagRow(
                tagsByUsername,
                username,
                containerId,
                isProfile
            );

            if (container.parentElement) {
                // eslint-disable-next-line no-console
                console.log('Inserting tag row after container:', container);
                // eslint-disable-next-line no-console
                console.log('Tag row container:', tagRowContainer);
                container.parentElement.insertBefore(
                    tagRowContainer,
                    container.nextSibling
                );
                // Mark this container as processed to prevent duplicates
                this.markAsProcessed(container);
                // eslint-disable-next-line no-console
                console.log(
                    'Successfully inserted and marked container as processed'
                );
            } else {
                // eslint-disable-next-line no-console
                console.log(
                    'Cannot insert tag row - container has no parent element'
                );
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error getting tag for username:', username, error);
        }
    }

    // Helper methods
    private isProcessed(container: Element): boolean {
        return container.hasAttribute('data-tags-processed');
    }

    private hasExistingTags(container: Element, username: string): boolean {
        const existingTags = XComSelectors.getExistingTagRow(
            container,
            username
        );
        return !!existingTags;
    }

    private markAsProcessed(container: Element): void {
        container.setAttribute('data-tags-processed', 'true');
    }

    // Generate a unique identifier for a user name container instance
    private generateUniqueId(
        userNameContainer: Element,
        username: string
    ): string {
        // Create a unique ID based on container content and DOM path, not position
        const parentText =
            userNameContainer.parentElement?.textContent?.slice(0, 50) || '';
        const containerText = userNameContainer.textContent?.slice(0, 30) || '';
        const siblingCount =
            userNameContainer.parentElement?.children.length || 0;

        // Use a hash of the content and DOM structure instead of coordinates
        const contentHash = btoa(parentText + containerText).slice(0, 8);
        return `${username}-${siblingCount}-${contentHash}`;
    }

    // Tag creation and styling
    private createTagRow(
        tags: Tag[],
        username: string,
        containerId: string,
        isProfile: boolean
    ): HTMLDivElement {
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
            tagRowContainer.closest('[data-testid*="hover"]') !== null;

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
        tags.forEach(tag => {
            const tagElement = this.createTagElement(tag);
            tagRowContainer.appendChild(tagElement);
        });

        return tagRowContainer;
    }

    private createTagElement(tag: Tag): HTMLSpanElement {
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
        return tagElement;
    }

    // Cleanup methods
    removeAllTags(): void {
        // Remove existing tag wrappers (which contain the tag rows)
        XComSelectors.getAllTagRows().forEach(el => {
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
        document.querySelectorAll('.x-account-tag').forEach(el => el.remove());

        // Clear processed flags from all User-Name containers
        document
            .querySelectorAll('[data-testid="User-Name"][data-tags-processed]')
            .forEach(el => {
                el.removeAttribute('data-tags-processed');
            });

        // Clear processed flags from all profile containers
        XComSelectors.getAllProcessedContainers().forEach(el => {
            el.removeAttribute('data-tags-processed');
        });
    }

    // Reset processing state (used when refreshing tags)
    resetProcessingState(): void {
        // Just delegate to removeAllTags which already does everything we need
        this.removeAllTags();
    }
}
