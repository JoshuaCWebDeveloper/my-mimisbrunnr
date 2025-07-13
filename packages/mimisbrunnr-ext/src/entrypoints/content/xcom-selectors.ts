/**
 * Pure DOM query functions for X.com UI elements
 * All X.com-specific selectors in one place for easy maintenance
 */

export class XComSelectors {
    // Tweet elements
    static getUserNameElements(): NodeListOf<Element> {
        return document.querySelectorAll('[data-testid="User-Name"]');
    }

    // Profile page elements
    static getProfileHeaderElements(): Element[] {
        const selectors = [
            '[data-testid="UserName"]',
            '[data-testid="UserProfileHeader_Items"]',
            '[data-testid="UserDescription"]',
        ];
        return selectors.flatMap(sel => [...document.querySelectorAll(sel)]);
    }

    // Hover card elements
    static getHoverCardElements(): Element[] {
        const selectors = [
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
        return selectors.flatMap(sel => [...document.querySelectorAll(sel)]);
    }

    // Container finding
    static findUserNameContainer(element: Element): Element | null {
        return element.closest('[data-testid="User-Name"]') ?? null;
    }

    static findNearestCommonAncestor(
        elements: [Element, Element]
    ): Element | null {
        const [elementA, elementB] = elements;
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
    }

    // Find profile links in hover cards
    static getProfileLinksFromHoverCard(element: Element): Element[] {
        return [
            ...element.querySelectorAll(
                'a[role="link"]:not([aria-hidden="true"])'
            ),
        ].slice(0, 2);
    }

    // Tag container queries
    static getExistingTagRow(
        container: Element,
        username: string
    ): Element | null {
        return (
            container.parentElement?.querySelector(
                `.x-account-tag-row[data-username="${username}"]`
            ) ?? null
        );
    }

    static getAllTagRows(): NodeListOf<Element> {
        return document.querySelectorAll('.x-account-tag-row');
    }

    static getAllProcessedContainers(): NodeListOf<Element> {
        return document.querySelectorAll('[data-tags-processed]');
    }

    // Check for relevant selectors in mutations
    static hasRelevantSelector(element: Element): boolean {
        const relevantSelectors = [
            'a[href*="/"]',
            '[data-testid="User-Name"]',
            '[data-testid="UserName"]',
            '[data-testid="UserProfileHeader_Items"]',
            '[data-testid="UserDescription"]',
            '[data-testid="hoverCard"]',
            '[data-testid="HoverCard"]',
            '[role="tooltip"]',
            '[data-testid="UserCell"]',
        ].join(', ');

        return !!(
            element.matches?.(relevantSelectors) ||
            element.querySelector?.(relevantSelectors)
        );
    }
}
