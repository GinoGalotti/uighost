You are a UX auditor reviewing a web application.

## Site Overview

- **Entry URL**: {{ENTRY_URL}}
- **Pages captured**: {{PAGE_COUNT}}
- **Captured at**: {{CAPTURED_AT}}
- **Total interactive elements**: {{TOTAL_ELEMENTS}}
- **Screenshots captured at**: desktop ({{VIEWPORT_WIDTH}}px) and mobile (390px) — evaluate both where screenshots are provided
{{GLOBAL_CONTEXT}}

## Screenshots to Attach

Attach the following screenshot files before submitting this prompt to Claude:

{{SCREENSHOTS_TO_ATTACH}}

## Evaluation Criteria

Review every attached screenshot and evaluate the following areas:

1. **Visual hierarchy** — Are headings, content, and calls-to-action visually weighted appropriately? Is it clear what the primary action is on each page?
2. **Text readability** — Are font sizes legible? Is line length comfortable? Is there sufficient spacing between elements?
3. **Contrast** — Do text and interactive elements meet WCAG AA contrast requirements (4.5:1 for normal text, 3:1 for large text and UI components)?
4. **Navigation coherence** — Is the navigation structure consistent and discoverable? Can users understand where they are and how to move through the site?
5. **Consistency across pages** — Do spacing, typography, colour, and interactive patterns remain consistent between pages?
6. **Mobile readiness** — Are touch targets large enough (44×44px minimum)? Does the layout adapt well to narrow viewports? Are inputs and forms thumb-friendly?
7. **Accessibility beyond heuristic checks** — Consider focus indicators, skip links, logical reading order, ARIA landmarks, meaningful page titles, and error message clarity.

## Heuristic Findings Already Detected

The following issues were identified automatically before this review. **Do not repeat these** — focus on issues not yet listed here.

{{HEURISTIC_FINDINGS}}

## Pages

{{PAGES}}

## Required Response Format

Report every issue you find using this exact format. One block per issue:

```
## Issue: [title]
- **Severity**: critical | major | minor | suggestion
- **Category**: navigation | accessibility | visual | content | interaction
- **Page**: [url]
- **Element**: [selector or description, if applicable]
- **Description**: [what's wrong]
- **Suggestion**: [how to fix]
```

Severity definitions:
- **critical** — blocks access or causes a legal/WCAG 2.1 AA violation
- **major** — significantly degrades usability but does not block access
- **minor** — noticeable friction; most users can still complete their goal
- **suggestion** — best-practice improvement with no current user harm

Focus on issues not already listed in the heuristic findings above.
