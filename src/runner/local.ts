import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { readManifest } from '../capture/manifest.js';
import { buildPrompts } from '../prompts/builder.js';
import { runHeuristics } from '../judge/heuristics.js';
import type { PageState } from '../crawler/web-crawler.js';

const DEFAULT_CAPTURES_DIR = '.uighost/captures';

// ─── Capture discovery ────────────────────────────────────────────────────────

export async function findLatestCapture(capturesDir = DEFAULT_CAPTURES_DIR): Promise<string> {
  let entries: string[];
  try {
    entries = await fs.readdir(capturesDir);
  } catch {
    throw new Error(`No captures found. Run "uighost capture <url>" first.\n  (looked in ${capturesDir})`);
  }

  const dirs = (
    await Promise.all(
      entries.map(async e => {
        const full = path.join(capturesDir, e);
        const stat = await fs.stat(full);
        return stat.isDirectory() ? e : null;
      })
    )
  )
    .filter((e): e is string => e !== null)
    .sort(); // ISO timestamps sort correctly lexicographically

  if (dirs.length === 0) {
    throw new Error(`No captures found. Run "uighost capture <url>" first.\n  (looked in ${capturesDir})`);
  }

  return path.join(capturesDir, dirs[dirs.length - 1]);
}

// ─── Page data reconstruction ─────────────────────────────────────────────────

export async function loadPageStates(captureDir: string): Promise<PageState[]> {
  const manifest = await readManifest(captureDir);
  const pages: PageState[] = [];

  for (const p of manifest.pages) {
    const dataPath = path.join(captureDir, 'pages', p.dataFile);
    const raw = JSON.parse(await fs.readFile(dataPath, 'utf-8')) as Omit<PageState, 'screenshotPath' | 'screenshotPaths'>;
    pages.push({
      ...raw,
      screenshotPath: path.join(captureDir, 'pages', p.screenshotFile),
      screenshotPaths: p.screenshotFiles.map(sf => ({
        label: sf.label,
        path: path.join(captureDir, 'pages', sf.file),
      })),
    });
  }

  return pages;
}

// ─── Clipboard ───────────────────────────────────────────────────────────────

function copyToClipboard(content: string): Promise<boolean> {
  return new Promise(resolve => {
    let cmd: string;
    let args: string[];

    if (process.platform === 'win32') {
      cmd = 'clip';
      args = [];
    } else if (process.platform === 'darwin') {
      cmd = 'pbcopy';
      args = [];
    } else {
      cmd = 'xclip';
      args = ['-selection', 'clipboard'];
    }

    try {
      const proc = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
      proc.stdin.write(content, 'utf-8');
      proc.stdin.end();
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

// ─── Public entry point ───────────────────────────────────────────────────────

export interface EvaluateOptions {
  capturesDir?: string;
  captureDir?: string; // use a specific capture rather than latest
  page?: number;       // use per-page prompt for page N
  contextFile?: string; // path to .uighost/context.json (auto-detected if omitted)
}

export async function evaluate(options: EvaluateOptions = {}): Promise<void> {
  // 1. Resolve capture directory
  const captureDir = options.captureDir ?? await findLatestCapture(options.capturesDir);
  const manifest = await readManifest(captureDir);

  // 2. Run heuristics against saved page data
  const pages = await loadPageStates(captureDir);
  const findings = await runHeuristics(pages);

  // 3. Build (or rebuild) prompt files
  await buildPrompts(captureDir, findings, options.contextFile);

  // 4. Determine which prompt to show
  let promptFile: string;
  let screenshotFiles: string[];

  if (options.page !== undefined) {
    const idx = String(options.page).padStart(3, '0');
    promptFile = path.join(captureDir, 'prompts', `evaluate-page-${idx}.md`);
    const pageManifest = manifest.pages.find(p => p.index === options.page);
    screenshotFiles = pageManifest
      ? pageManifest.screenshotFiles.map(sf => path.resolve(captureDir, 'pages', sf.file))
      : [];
  } else {
    promptFile = path.join(captureDir, 'prompts', 'evaluate-all.md');
    screenshotFiles = manifest.pages.flatMap(p =>
      p.screenshotFiles.map(sf => path.resolve(captureDir, 'pages', sf.file))
    );
  }

  const promptContent = await fs.readFile(promptFile, 'utf-8');

  // 5. Try clipboard
  const copied = await copyToClipboard(promptContent);

  // 6. Print instructions
  const separator = '─'.repeat(60);
  console.log(`\n${separator}`);
  console.log(`  UIGhost — ${options.page !== undefined ? `Page ${options.page} evaluation` : 'Full site evaluation'}`);
  console.log(`  Capture: ${manifest.captureId}  |  ${manifest.pageCount} page(s)  |  ${findings.length} heuristic finding(s)`);
  console.log(separator);

  if (copied) {
    console.log(`\n  Prompt copied to clipboard.`);
  } else {
    console.log(`\n  --- PROMPT START ---`);
    console.log(promptContent);
    console.log(`  --- PROMPT END ---`);
  }

  console.log(`\n  Attach these screenshots to your claude.ai message:`);
  for (const p of manifest.pages) {
    console.log(`\n  Page ${p.index}: ${p.url}`);
    for (const sf of p.screenshotFiles) {
      console.log(`    [${sf.label}] ${path.resolve(captureDir, 'pages', sf.file)}`);
    }
  }

  console.log(`\n  After Claude responds, copy the response and run:`);
  console.log(`    uighost report --from-clipboard`);
  console.log(`\n${separator}\n`);
}
