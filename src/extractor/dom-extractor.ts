// TODO: DOM data extractor — runs inside Playwright page context
// Responsibilities:
//   - Extract all interactive elements (buttons, links, inputs, selects, textareas)
//   - Pull computed styles (color, background-color, font-size) for contrast checks
//   - Extract accessibility attributes: aria-label, aria-role, alt, lang
//   - Detect visibility: offsetWidth > 0, not display:none, not visibility:hidden
//   - Return structured ElementInfo[] for the heuristics engine and prompt builder

import type { ElementInfo } from '../crawler/web-crawler.js';
import type { Page } from 'playwright';

export async function extractElements(_page: Page): Promise<ElementInfo[]> {
  // TODO: use page.evaluate() to collect element data from the DOM
  throw new Error('Not implemented');
}

export async function extractAccessibilityTree(_page: Page): Promise<unknown> {
  // TODO: call page.accessibility.snapshot() and return the tree
  throw new Error('Not implemented');
}
