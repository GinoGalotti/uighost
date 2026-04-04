import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface PageManifest {
  index: number;
  url: string;
  screenshotFile: string;
  dataFile: string;
  elementCount: number;
}

export interface CaptureManifest {
  captureId: string;
  entryUrl: string;
  capturedAt: string;
  pageCount: number;
  pages: PageManifest[];
  options: { maxDepth: number; maxPages: number };
  duration: number;
}

export function buildManifest(
  captureId: string,
  entryUrl: string,
  pages: PageManifest[],
  options: { maxDepth: number; maxPages: number },
  duration: number
): CaptureManifest {
  return {
    captureId,
    entryUrl,
    capturedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages,
    options,
    duration,
  };
}

export async function readManifest(captureDir: string): Promise<CaptureManifest> {
  const raw = await fs.readFile(path.join(captureDir, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as CaptureManifest;
}
