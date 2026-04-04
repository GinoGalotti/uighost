import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { readManifest } from '../capture/manifest.js';
import type { PageManifest } from '../capture/manifest.js';

// ---------------------------------------------------------------------------
// Context file
// ---------------------------------------------------------------------------

interface SiteContext {
  global?: string;
  pages?: Record<string, string>; // URL (exact or prefix) → context note
}

async function loadContext(contextFile: string): Promise<SiteContext> {
  try {
    const raw = await fs.readFile(contextFile, 'utf-8');
    return JSON.parse(raw) as SiteContext;
  } catch {
    return {};
  }
}

function findPageContext(pageUrl: string, context: SiteContext): string | undefined {
  const pages = context.pages ?? {};
  // Exact match first, then longest prefix match
  if (pages[pageUrl]) return pages[pageUrl];
  const prefix = Object.keys(pages)
    .filter(k => pageUrl.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? pages[prefix] : undefined;
}

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

function formatPageSection(page: PageManifest, pageContext?: string): string {
  const lines = [
    `### Page ${page.index}: ${page.url}`,
    ...page.screenshotFiles.map(sf => `- **Screenshot (${sf.label})**: ${sf.file}`),
    `- **Elements captured**: ${page.elementCount}`,
  ];
  if (pageContext) lines.push(`- **Context**: ${pageContext}`);
  return lines.join('\n');
}

function screenshotList(pages: PageManifest[]): string {
  return pages
    .flatMap(p => p.screenshotFiles.map(sf => `- ${sf.file} (${sf.label})`))
    .join('\n');
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
  contextFile?: string,
): Promise<void> {
  // 1. Read manifest + context
  const manifest = await readManifest(captureDir);
  const resolvedContext = contextFile ?? path.join(process.cwd(), '.uighost', 'context.json');
  const context = await loadContext(resolvedContext);

  // 2. Load template
  const template = await loadTemplate('evaluate.md');

  // 3. Prepare output directory
  const promptsDir = path.join(captureDir, 'prompts');
  await fs.mkdir(promptsDir, { recursive: true });

  // 4. Build shared substitution values
  const findingsText = formatHeuristicFindings(heuristics);
  const totalEls = totalElements(manifest.pages);
  const viewportWidth = manifest.options.viewportWidth ?? 1280;
  const globalContext = context.global
    ? `\n> **Site context**: ${context.global}\n`
    : '';

  // -------------------------------------------------------------------------
  // evaluate-all.md
  // -------------------------------------------------------------------------
  const allPagesText = manifest.pages
    .map(p => formatPageSection(p, findPageContext(p.url, context)))
    .join('\n\n');
  const allScreenshots = screenshotList(manifest.pages);

  const evaluateAll = substitute(template, {
    ENTRY_URL: manifest.entryUrl,
    PAGE_COUNT: String(manifest.pageCount),
    CAPTURED_AT: manifest.capturedAt,
    TOTAL_ELEMENTS: String(totalEls),
    VIEWPORT_WIDTH: String(viewportWidth),
    GLOBAL_CONTEXT: globalContext,
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
      VIEWPORT_WIDTH: String(viewportWidth),
      GLOBAL_CONTEXT: globalContext,
      SCREENSHOTS_TO_ATTACH: `- ${page.screenshotFile}`,
      HEURISTIC_FINDINGS: pageFindingsText,
      PAGES: formatPageSection(page, findPageContext(page.url, context)),
    });

    const paddedIndex = String(page.index).padStart(3, '0');
    const pageFilename = `evaluate-page-${paddedIndex}.md`;
    const pagePromptPath = path.join(promptsDir, pageFilename);
    await fs.writeFile(pagePromptPath, pagePrompt, 'utf-8');
    console.log(`Wrote ${pagePromptPath}`);
  }
}
