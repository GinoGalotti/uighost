// TODO: Playwright-based web crawler
// Responsibilities:
//   - Load URL in Playwright (Chromium)
//   - Call page.accessibility.snapshot() to extract the accessibility element tree
//   - Collect all interactive elements: tag, role, text, bounding box, visibility
//   - Take a full-page screenshot as PNG
//   - Follow same-origin links (BFS), respecting configurable depth + max-pages
//   - Skip non-page resources (images, PDFs, external domains)
//   - Return a CrawlResult per page for the capture packager

export interface CrawlOptions {
  depth: number;
  maxPages: number;
  outputDir: string;
}

export interface ElementInfo {
  tag: string;
  role: string | null;
  text: string | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  visible: boolean;
}

export interface PageState {
  url: string;
  title: string;
  screenshotPath: string;
  elements: ElementInfo[];
  accessibilityTree: unknown;
}

export interface CrawlResult {
  startUrl: string;
  pages: PageState[];
  crawledAt: string;
}

export async function crawl(_url: string, _options: CrawlOptions): Promise<CrawlResult> {
  // TODO: implement BFS crawl with Playwright
  throw new Error('Not implemented');
}
