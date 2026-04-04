import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CrawlResult } from '../crawler/web-crawler.js';
import { buildManifest, type PageManifest } from './manifest.js';

export interface CapturePackage {
  path: string;
  captureId: string;
  pageCount: number;
}

export interface SaveCaptureOptions {
  maxDepth: number;
  maxPages: number;
}

/**
 * Persists a CrawlResult to disk.
 * Screenshots are already saved in captureDir/pages/ by the crawler.
 * This function writes per-page JSON, manifest.json, and placeholder dirs.
 *
 * Folder structure:
 *   captureDir/
 *   ├── manifest.json
 *   ├── pages/
 *   │   ├── page-001.png  (written by crawler)
 *   │   ├── page-001.json (written here)
 *   │   └── ...
 *   └── prompts/          (empty — populated by prompt builder)
 */
export async function saveCapture(
  result: CrawlResult,
  captureDir: string,
  options: SaveCaptureOptions
): Promise<CapturePackage> {
  const pagesDir = path.join(captureDir, 'pages');
  const promptsDir = path.join(captureDir, 'prompts');

  await Promise.all([
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(promptsDir, { recursive: true }),
  ]);

  const captureId = path.basename(captureDir);
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
      index: i + 1,
      url: page.url,
      screenshotFile,
      dataFile,
      elementCount: page.interactiveElements.length,
    });
  }

  const manifest = buildManifest(captureId, result.startUrl, pageManifests, options, result.durationMs);
  await fs.writeFile(
    path.join(captureDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  return { path: captureDir, captureId, pageCount: result.pages.length };
}
