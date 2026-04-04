import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { readManifest } from '../capture/manifest.js';
import type { PageManifest } from '../capture/manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeuristicFinding {
  severity: string;
  category?: string;
  rule?: string;
  check?: string;
  page: string;
  element?: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the prompt-templates directory relative to this source file.
 * Works for both ts-node/tsx (src/prompts/builder.ts → ../../prompt-templates)
 * and compiled output    (dist/prompts/builder.js → ../../prompt-templates).
 */
function resolveTemplateDir(): string {
  const thisFile = url.fileURLToPath(import.meta.url);
  // src/prompts/builder.ts  → up 2 levels → project root
  // dist/prompts/builder.js → up 2 levels → project root
  return path.resolve(path.dirname(thisFile), '..', '..', 'prompt-templates');
}

async function loadTemplate(name: string): Promise<string> {
  const templatePath = path.join(resolveTemplateDir(), name);
  return fs.readFile(templatePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatHeuristicFindings(findings: HeuristicFinding[]): string {
  if (findings.length === 0) return 'None detected.';
  return findings
    .map((f) => {
      const label = f.rule ?? f.check ?? 'finding';
      const parts = [
        `- **[${f.severity.toUpperCase()}]** ${label}`,
        `  - Page: ${f.page}`,
      ];
      if (f.element) parts.push(`  - Element: ${f.element}`);
      if (f.category) parts.push(`  - Category: ${f.category}`);
      parts.push(`  - ${f.description}`);
      return parts.join('\n');
    })
    .join('\n\n');
}

function formatPageSection(page: PageManifest): string {
  return [
    `### Page ${page.index}: ${page.url}`,
    `- **Screenshot**: ${page.screenshotFile}`,
    `- **Elements captured**: ${page.elementCount}`,
  ].join('\n');
}

function screenshotList(pages: PageManifest[]): string {
  return pages.map((p) => `- ${p.screenshotFile}`).join('\n');
}

function totalElements(pages: PageManifest[]): number {
  return pages.reduce((sum, p) => sum + p.elementCount, 0);
}

// ---------------------------------------------------------------------------
// Template substitution
// ---------------------------------------------------------------------------

function substitute(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Legacy type alias kept for compatibility with runner/local.ts stub
// ---------------------------------------------------------------------------

/** @deprecated — use buildPrompts() directly; files are written to disk */
export interface BuiltPrompts {
  evaluateAll: string;
  evaluatePerPage: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildPrompts(
  captureDir: string,
  heuristics: HeuristicFinding[] = [],
): Promise<void> {
  // 1. Read manifest
  const manifest = await readManifest(captureDir);

  // 2. Load template
  const template = await loadTemplate('evaluate.md');

  // 3. Prepare output directory
  const promptsDir = path.join(captureDir, 'prompts');
  await fs.mkdir(promptsDir, { recursive: true });

  // 4. Build shared substitution values
  const findingsText = formatHeuristicFindings(heuristics);
  const totalEls = totalElements(manifest.pages);

  // -------------------------------------------------------------------------
  // evaluate-all.md
  // -------------------------------------------------------------------------
  const allPagesText = manifest.pages.map(formatPageSection).join('\n\n');
  const allScreenshots = screenshotList(manifest.pages);

  const evaluateAll = substitute(template, {
    ENTRY_URL: manifest.entryUrl,
    PAGE_COUNT: String(manifest.pageCount),
    CAPTURED_AT: manifest.capturedAt,
    TOTAL_ELEMENTS: String(totalEls),
    SCREENSHOTS_TO_ATTACH: allScreenshots,
    HEURISTIC_FINDINGS: findingsText,
    PAGES: allPagesText,
  });

  const evaluateAllPath = path.join(promptsDir, 'evaluate-all.md');
  await fs.writeFile(evaluateAllPath, evaluateAll, 'utf-8');
  console.log(`Wrote ${evaluateAllPath}`);

  // -------------------------------------------------------------------------
  // evaluate-page-NNN.md — one file per page
  // -------------------------------------------------------------------------
  for (const page of manifest.pages) {
    const pageFindings = heuristics.filter((f) => f.page === page.url);
    const pageFindingsText = formatHeuristicFindings(pageFindings);

    const pagePrompt = substitute(template, {
      ENTRY_URL: manifest.entryUrl,
      PAGE_COUNT: '1',
      CAPTURED_AT: manifest.capturedAt,
      TOTAL_ELEMENTS: String(page.elementCount),
      SCREENSHOTS_TO_ATTACH: `- ${page.screenshotFile}`,
      HEURISTIC_FINDINGS: pageFindingsText,
      PAGES: formatPageSection(page),
    });

    const paddedIndex = String(page.index).padStart(3, '0');
    const pageFilename = `evaluate-page-${paddedIndex}.md`;
    const pagePromptPath = path.join(promptsDir, pageFilename);
    await fs.writeFile(pagePromptPath, pagePrompt, 'utf-8');
    console.log(`Wrote ${pagePromptPath}`);
  }
}
