import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface PageManifest {
  url: string;
  title: string;
  screenshotFile: string;
  dataFile: string;
  elementCount: number;
  crawledAt: string;
}

export interface CaptureManifest {
  version: string;
  startUrl: string;
  capturedAt: string;
  durationMs: number;
  pages: PageManifest[];
}

export function buildManifest(
  startUrl: string,
  pages: PageManifest[],
  durationMs: number
): CaptureManifest {
  return {
    version: '1.0.0',
    startUrl,
    capturedAt: new Date().toISOString(),
    durationMs,
    pages,
  };
}

export async function readManifest(captureDir: string): Promise<CaptureManifest> {
  const raw = await fs.readFile(path.join(captureDir, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as CaptureManifest;
}
