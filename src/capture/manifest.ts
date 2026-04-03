// TODO: Capture manifest — defines and serialises the manifest.json schema
// Responsibilities:
//   - Define the CaptureManifest type (urls, element counts, timings, tool version)
//   - Build a manifest object from a CrawlResult
//   - Read an existing manifest from disk (for downstream commands like evaluate/report)

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

export function buildManifest(_startUrl: string, _pages: PageManifest[], _durationMs: number): CaptureManifest {
  // TODO: assemble and return manifest object
  throw new Error('Not implemented');
}

export async function readManifest(_captureDir: string): Promise<CaptureManifest> {
  // TODO: read and parse manifest.json from the capture folder
  throw new Error('Not implemented');
}
