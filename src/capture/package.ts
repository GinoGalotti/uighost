import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CrawlResult } from '../crawler/web-crawler.js';
import { buildManifest, type PageManifest } from './manifest.js';

export interface CapturePackage {
  path: string;
  timestamp: string;
  pageCount: number;
}

/**
 * Persists a CrawlResult to disk.
 * Screenshots are already saved in captureDir/pages/ by the crawler —
 * this function writes per-page JSON, manifest.json, and heuristics.json.
 */
export async function saveCapture(
  result: CrawlResult,
  captureDir: string
): Promise<CapturePackage> {
  const pagesDir = path.join(captureDir, 'pages');
  await fs.mkdir(pagesDir, { recursive: true });

  const pageManifests: PageManifest[] = [];

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    const idx = String(i + 1).padStart(3, '0');
    const dataFile = `page-${idx}.json`;
    const screenshotFile = `page-${idx}.png`;

    await fs.writeFile(
      path.join(pagesDir, dataFile),
      JSON.stringify(
        {
          url: page.url,
          title: page.title,
          metadata: page.metadata,
          interactiveElements: page.interactiveElements,
          accessibilityTree: page.accessibilityTree,
        },
        null,
        2
      )
    );

    pageManifests.push({
      url: page.url,
      title: page.title,
      screenshotFile,
      dataFile,
      elementCount: page.interactiveElements.length,
      crawledAt: result.crawledAt,
    });
  }

  const manifest = buildManifest(result.startUrl, pageManifests, result.durationMs);
  await fs.writeFile(
    path.join(captureDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Placeholder — heuristics engine will populate this in Day 3–4
  await fs.writeFile(
    path.join(captureDir, 'heuristics.json'),
    JSON.stringify({ findings: [], checkedAt: new Date().toISOString() }, null, 2)
  );

  const timestamp = path.basename(captureDir);
  return { path: captureDir, timestamp, pageCount: result.pages.length };
}
