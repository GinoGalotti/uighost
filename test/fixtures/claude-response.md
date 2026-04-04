# Claude UX Audit Response (fixture for parser tests)

## Issue: No skip navigation link
- **Severity**: major
- **Category**: accessibility
- **Page**: https://example.com/
- **Element**: body > header
- **Description**: The page has no "skip to main content" link. Keyboard users must tab through the entire navigation on every page load before reaching the main content.
- **Suggestion**: Add a visually-hidden anchor as the first focusable element: `<a href="#main" class="skip-link">Skip to main content</a>`. Make it visible on focus.

## Issue: Insufficient touch target size on mobile nav items
- **Severity**: major
- **Category**: interaction
- **Page**: https://example.com/
- **Element**: nav a
- **Description**: Navigation links have a click area of approximately 28×18px, well below the WCAG 2.5.5 recommended 44×44px minimum. Mobile users, particularly those with motor impairments, will find these difficult to tap accurately.
- **Suggestion**: Increase padding on nav links so each item has at least 44px height. Use `padding: 12px 16px;` as a starting point.

## Issue: Missing focus indicator on primary CTA button
- **Severity**: critical
- **Category**: accessibility
- **Page**: https://example.com/
- **Element**: button.primary-cta
- **Description**: The primary call-to-action button has `outline: none` in its CSS, removing the browser's default focus indicator. Keyboard users cannot determine which element has focus.
- **Suggestion**: Remove `outline: none` and instead style the focus state with a high-contrast ring: `button:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }`.

## Issue: Low contrast on secondary text
- **Severity**: minor
- **Category**: visual
- **Page**: https://example.com/about
- **Element**: N/A
- **Description**: Subtitle text and caption text appear to use #9ca3af (gray-400) on a white background, giving a contrast ratio of approximately 2.5:1. WCAG AA requires 4.5:1 for normal text.
- **Suggestion**: Use #6b7280 (gray-500) at minimum for body-weight text, or darken to #374151 (gray-700) for guaranteed WCAG AA compliance.

## Issue: Hero heading does not communicate value proposition
- **Severity**: suggestion
- **Category**: content
- **Page**: https://example.com/
- **Element**: h1
- **Description**: The main heading reads "Welcome" with no further context visible above the fold. A first-time visitor cannot immediately understand what the product does or why they should stay.
- **Suggestion**: Replace or augment the heading with a concrete benefit statement, e.g. "Audit any website's UX in minutes — no account required." Follow immediately with one or two supporting points.
