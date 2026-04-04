import type { InteractiveElement, PageState } from '../crawler/web-crawler.js';

export type Severity = 'critical' | 'major' | 'minor' | 'suggestion';
export type Category = 'accessibility' | 'content' | 'structure';

export interface HeuristicFinding {
  severity: Severity;
  category: Category;
  rule: string;
  page: string;
  element?: string;
  description: string;
}

// ─── Generic-link-text patterns ──────────────────────────────────────────────

const GENERIC_LINK_TEXTS = new Set(['click here', 'read more', 'learn more', 'here']);

// ─── Individual checks ───────────────────────────────────────────────────────

function checkMissingLang(page: PageState): HeuristicFinding[] {
  if (!page.metadata.lang || page.metadata.lang.trim() === '') {
    return [
      {
        severity: 'critical',
        category: 'accessibility',
        rule: 'missing-lang',
        page: page.url,
        description:
          'The <html> element is missing a lang attribute. Screen readers need this to select the correct language profile.',
      },
    ];
  }
  return [];
}

function checkMissingViewport(page: PageState): HeuristicFinding[] {
  if (page.metadata.viewport === null) {
    return [
      {
        severity: 'major',
        category: 'structure',
        rule: 'missing-viewport',
        page: page.url,
        description:
          'No <meta name="viewport"> tag detected. Without it, mobile browsers render at desktop width and the page will not be responsive.',
      },
    ];
  }
  return [];
}

function checkHeadingStructure(page: PageState): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];
  const headings = page.metadata.headingStructure; // ["h1: Title", "h2: Sub", ...]

  if (headings.length === 0) return findings;

  // Parse level numbers from each entry
  const levels: number[] = headings.map(h => {
    const match = /^h([1-6]):/i.exec(h);
    return match ? parseInt(match[1], 10) : 0;
  }).filter(n => n > 0);

  // Multiple h1 check
  const h1Count = levels.filter(l => l === 1).length;
  if (h1Count > 1) {
    findings.push({
      severity: 'major',
      category: 'structure',
      rule: 'multiple-h1',
      page: page.url,
      description: `Page contains ${h1Count} <h1> elements. There should be exactly one <h1> per page to clearly identify the main topic.`,
    });
  }

  // Heading-level skip check — traverse in document order
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    const curr = levels[i];
    // A skip occurs when heading level increases by more than 1
    if (curr > prev + 1) {
      const prevHeading = headings[i - 1];
      const currHeading = headings[i];
      findings.push({
        severity: 'minor',
        category: 'structure',
        rule: 'heading-skip',
        page: page.url,
        element: currHeading,
        description: `Heading level skipped from h${prev} ("${prevHeading}") to h${curr} ("${currHeading}"). Heading levels should only increase by one at a time.`,
      });
    }
  }

  return findings;
}

function checkGenericLinkText(page: PageState): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];

  for (const el of page.interactiveElements) {
    if (el.tag !== 'a') continue;
    const text = el.text?.trim().toLowerCase() ?? '';
    if (text && GENERIC_LINK_TEXTS.has(text)) {
      findings.push({
        severity: 'minor',
        category: 'content',
        rule: 'generic-link-text',
        page: page.url,
        element: el.selector,
        description: `Link with selector "${el.selector}" has generic text "${el.text}". Use descriptive link text that makes sense out of context.`,
      });
    }
  }

  return findings;
}

function checkButtonNoName(page: PageState): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];

  for (const el of page.interactiveElements) {
    if (el.tag !== 'button') continue;
    const hasText = el.text !== null && el.text.trim() !== '';
    const hasRole = el.role !== null;
    if (!hasText && !hasRole) {
      findings.push({
        severity: 'major',
        category: 'accessibility',
        rule: 'button-no-name',
        page: page.url,
        element: el.selector,
        description: `Button with selector "${el.selector}" has no accessible name. Add visible text, aria-label, or aria-labelledby so assistive technologies can identify the button.`,
      });
    }
  }

  return findings;
}

function checkInputNoLabel(page: PageState): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];

  for (const el of page.interactiveElements) {
    if (el.tag !== 'input') continue;
    // Best-effort: text is populated from aria-label, alt, placeholder in the extractor.
    // If both role and text are null the input has no programmatically determined label.
    if (el.role === null && el.text === null) {
      findings.push({
        severity: 'major',
        category: 'accessibility',
        rule: 'input-no-label',
        page: page.url,
        element: el.selector,
        description: `Input with selector "${el.selector}" has no detectable label (no aria-label, placeholder, or accessible role). Associate a <label> element or add aria-label.`,
      });
    }
  }

  return findings;
}

// ─── Stub checks for data NOT available in PageState ─────────────────────────

/**
 * Stub: checks for images missing alt attributes.
 *
 * To implement this fully, dom-extractor.ts would need to extract img elements
 * with their alt attribute values (e.g. add an `images` field to PageMetadata
 * containing Array<{ src: string; alt: string | null; selector: string }>).
 */
function checkImgMissingAlt(_page: PageState): HeuristicFinding[] {
  return [];
}

/**
 * Stub: checks for duplicate id attributes across the page.
 *
 * To implement this fully, dom-extractor.ts would need to collect all elements
 * that have an `id` attribute and return them in PageState so duplicates can be
 * detected here (e.g. add a `allIds: string[]` field to PageMetadata).
 */
function checkDuplicateIds(_page: PageState): HeuristicFinding[] {
  return [];
}

/**
 * Stub: checks for elements with a positive tabindex (tabindex > 0).
 *
 * To implement this fully, dom-extractor.ts would need to capture the `tabindex`
 * attribute on interactive elements or in a dedicated field so the heuristic can
 * flag any value greater than 0, which disrupts natural tab order.
 */
function checkPositiveTabindex(_page: PageState): HeuristicFinding[] {
  return [];
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runHeuristics(pages: PageState[]): Promise<HeuristicFinding[]> {
  const findings: HeuristicFinding[] = [];

  for (const page of pages) {
    findings.push(
      ...checkMissingLang(page),
      ...checkMissingViewport(page),
      ...checkHeadingStructure(page),
      ...checkGenericLinkText(page),
      ...checkButtonNoName(page),
      ...checkInputNoLabel(page),
      // Stubs — require additional extraction data
      ...checkImgMissingAlt(page),
      ...checkDuplicateIds(page),
      ...checkPositiveTabindex(page),
    );
  }

  return findings;
}
