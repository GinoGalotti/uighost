// TODO: Capture packager — saves a CrawlResult to the local capture folder structure
// Responsibilities:
//   - Create .uighost/captures/<timestamp>/ directory
//   - Write manifest.json (URLs, element counts, crawl metadata)
//   - Write pages/page-NNN.png (screenshots) and pages/page-NNN.json (element data)
//   - Write heuristics.json (populated later by the heuristics engine)
//   - Return the path to the capture folder for downstream use

import type { CrawlResult } from '../crawler/web-crawler.js';

export interface CapturePackage {
  path: string;
  timestamp: string;
  pageCount: number;
}

export async function saveCapture(_result: CrawlResult, _outputDir: string): Promise<CapturePackage> {
  // TODO: create folder, write manifest + per-page files
  throw new Error('Not implemented');
}
