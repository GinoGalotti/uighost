// TODO: Programmatic heuristic checks — free, instant, no LLM required
// Checks to implement:
//   - Images missing alt attributes
//   - Form inputs without associated labels
//   - Links with generic text ("click here", "read more", "learn more")
//   - Missing <html lang="...">
//   - Missing viewport meta tag
//   - Heading hierarchy violations (h1 → h3 skip)
//   - Duplicate IDs
//   - Buttons without accessible names
//   - Positive tabindex (tab order issues)
//   - Color contrast (computed styles vs WCAG AA thresholds)
// Results are saved to heuristics.json in the capture folder

import type { InteractiveElement, PageState } from '../crawler/web-crawler.js';

export type Severity = 'critical' | 'major' | 'minor' | 'suggestion';

export interface HeuristicFinding {
  check: string;
  severity: Severity;
  page: string;
  element?: string;
  description: string;
}

export interface HeuristicResults {
  findings: HeuristicFinding[];
  checkedAt: string;
}

export function runHeuristics(_pages: PageState[]): HeuristicResults {
  // TODO: run all checks against extracted element data
  throw new Error('Not implemented');
}

// Individual check stubs
export function checkMissingAlt(_elements: InteractiveElement[]): HeuristicFinding[] {
  // TODO: find img elements where alt is null or empty
  return [];
}

export function checkUnlabelledInputs(_elements: InteractiveElement[]): HeuristicFinding[] {
  // TODO: find inputs without aria-label or associated <label>
  return [];
}

export function checkGenericLinkText(_elements: InteractiveElement[]): HeuristicFinding[] {
  // TODO: find links with text matching generic phrases
  return [];
}
