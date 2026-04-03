// TODO: HTML report generator — compiles all findings into a browsable report
// Responsibilities:
//   - Generate report.html in the capture folder's report/ subfolder
//   - Summary section: pages audited, issue counts by severity
//   - Per-page section: screenshot + findings list with severity badges
//   - Distinguish heuristic vs LLM-detected findings
//   - Include WCAG reference links for accessibility findings
//   - Self-contained HTML (inline CSS, base64 screenshots optional)

import type { ParsedReport } from '../judge/parser.js';
import type { CaptureManifest } from '../capture/manifest.js';

export interface ReportOptions {
  captureDir: string;
  openAfterGenerate?: boolean;
}

export async function generateReport(
  _manifest: CaptureManifest,
  _findings: ParsedReport,
  _options: ReportOptions
): Promise<string> {
  // TODO: render HTML template with findings and write to report/report.html
  // Returns the path to the generated report
  throw new Error('Not implemented');
}
