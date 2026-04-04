import { chromium } from 'playwright';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { extractPageState } from '../extractor/dom-extractor.js';

const NON_PAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|ico|webp|pdf|zip|tar|gz|exe|dmg|mp4|mp3|webm|woff|woff2|ttf|eot|css|js|json|xml|txt|csv)$/i;

export interface CrawlOptions {
  depth: number;
  maxPages: number;
  screenshotDir: string;
  storageStatePath?: string;
}

export interface InteractiveElement {
  tag: string;
  role: string | null;
  text: string | null;
  href?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  visible: boolean;
  selector: string;
}

export interface PageMetadata {
  lang: string | null;
  viewport: { width: number; height: number } | null;
  headingStructure: string[];
  formCount: number;
  linkCount: number;
  imageCount: number;
}

export interface PageState {
  url: string;
  title: string;
  screenshotPath: string;
  accessibilityTree: string | null;
  interactiveElements: InteractiveElement[];
  metadata: PageMetadata;
}

export interface CrawlResult {
  startUrl: string;
  pages: PageState[];
  crawledAt: string;
  durationMs: number;
  errors: Array<{ url: string; error: string }>;
}

interface QueueItem {
  url: string;
  depth: number;
}

export async function crawl(entryUrl: string, options: CrawlOptions): Promise<CrawlResult> {
  const { depth: maxDepth, maxPages, screenshotDir } = options;
  const startedAt = Date.now();

  await fs.mkdir(screenshotDir, { recursive: true });

  const origin = new URL(entryUrl).origin;
  const visited = new Set<string>();
  const queue: QueueItem[] = [{ url: normalizeUrl(entryUrl), depth: 0 }];
  const pages: PageState[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    options.storageStatePath ? { storageState: options.storageStatePath } : {}
  );

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const item = queue.shift()!;
      const { url, depth } = item;

      if (visited.has(url)) continue;
      visited.add(url);

      const pageIndex = String(pages.length + 1).padStart(3, '0');
      const screenshotPath = path.join(screenshotDir, `page-${pageIndex}.png`);

      console.log(`  [${pageIndex}] ${url}`);

      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        const extracted = await extractPageState(page);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        pages.push({ ...extracted, screenshotPath });

        if (depth < maxDepth) {
          for (const el of extracted.interactiveElements) {
            if (!el.href) continue;
            try {
              const linkUrl = new URL(el.href);
              if (linkUrl.origin !== origin) continue;
              if (NON_PAGE_EXTENSIONS.test(linkUrl.pathname)) continue;
              const normalized = normalizeUrl(el.href);
              if (!visited.has(normalized) && !queue.some(q => q.url === normalized)) {
                queue.push({ url: normalized, depth: depth + 1 });
              }
            } catch {
              // unparseable URL — skip
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ url, error: message });
        console.error(`  [error] ${url}: ${message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    startUrl: entryUrl,
    pages,
    crawledAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    errors,
  };
}

function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  return u.origin + u.pathname; // strip query + hash for dedup
}
