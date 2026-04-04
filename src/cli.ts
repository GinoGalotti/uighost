#!/usr/bin/env node
import { program } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';
import { chromium } from 'playwright';
import { crawl } from './crawler/web-crawler.js';
import { saveCapture } from './capture/package.js';
import { saveSession, loadSession } from './auth/session.js';
import { evaluate, findLatestCapture } from './runner/local.js';
import { parseEvaluation, heuristicToFinding } from './judge/parser.js';
import { generateReport } from './reporter/report.js';
import { runHeuristics } from './judge/heuristics.js';
import { readManifest } from './capture/manifest.js';
import { spawn } from 'node:child_process';

program
  .name('uighost')
  .description('AI UI testing agent — capture → prompt → evaluate')
  .version('0.1.0');

// ─── capture ────────────────────────────────────────────────────────────────

program
  .command('capture <url>')
  .description('Crawl a URL and save screenshots + element data locally')
  .option('-d, --depth <number>', 'crawl depth (follow links N levels deep)', '2')
  .option('-m, --max-pages <number>', 'maximum pages to capture', '10')
  .option('-o, --output <dir>', 'base output directory for capture packages', '.uighost/captures')
  .action(async (url: string, options: { depth: string; maxPages: string; output: string }) => {
    const depth = parseInt(options.depth, 10);
    const maxPages = parseInt(options.maxPages, 10);

    const storageStatePath = await loadSession(url);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const captureDir = path.join(options.output, timestamp);
    const screenshotDir = path.join(captureDir, 'pages');

    await fs.mkdir(screenshotDir, { recursive: true });

    console.log(`\nUIGhost capture`);
    console.log(`  URL:       ${url}`);
    console.log(`  Depth:     ${depth}`);
    console.log(`  Max pages: ${maxPages}`);
    if (storageStatePath) {
      console.log(`  Auth:      ${storageStatePath}`);
    }
    console.log(`  Output:    ${captureDir}\n`);

    const result = await crawl(url, { depth, maxPages, screenshotDir, storageStatePath });
    const pkg = await saveCapture(result, captureDir, { maxDepth: depth, maxPages });

    console.log(`\nDone.`);
    console.log(`  Capture ID:     ${pkg.captureId}`);
    console.log(`  Pages captured: ${pkg.pageCount}`);
    console.log(`  Errors:         ${result.errors.length}`);
    console.log(`  Capture saved:  ${pkg.path}`);

    if (result.errors.length > 0) {
      console.log('\nFailed pages:');
      for (const e of result.errors) {
        console.log(`  ${e.url}: ${e.error}`);
      }
    }
  });

// ─── evaluate ────────────────────────────────────────────────────────────────

program
  .command('evaluate')
  .description('Build prompts from the latest capture and print instructions for claude.ai')
  .option('-p, --page <number>', 'use the per-page prompt for page N instead of full-site prompt')
  .option('-c, --capture <dir>', 'path to a specific capture folder (default: latest)')
  .option('--captures-dir <dir>', 'base captures directory', '.uighost/captures')
  .action(async (options: { page?: string; capture?: string; capturesDir: string }) => {
    await evaluate({
      capturesDir: options.capturesDir,
      captureDir: options.capture,
      page: options.page !== undefined ? parseInt(options.page, 10) : undefined,
    });
  });

// ─── report ──────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Parse Claude\'s response and generate an HTML report')
  .option('--from-clipboard', 'read Claude\'s response from clipboard')
  .option('--from-file <path>', 'read Claude\'s response from a text file')
  .option('-c, --capture <dir>', 'path to a specific capture folder (default: latest)')
  .option('--captures-dir <dir>', 'base captures directory', '.uighost/captures')
  .option('--no-open', 'do not open the report in the browser')
  .action(async (options: {
    fromClipboard?: boolean;
    fromFile?: string;
    capture?: string;
    capturesDir: string;
    open: boolean;
  }) => {
    // 1. Resolve capture dir
    const captureDir = options.capture ?? await findLatestCapture(options.capturesDir);
    const manifest = await readManifest(captureDir);

    // 2. Get Claude's response text
    let responseText = '';
    if (options.fromFile) {
      responseText = await fs.readFile(options.fromFile, 'utf-8');
      console.log(`  Reading response from ${options.fromFile}`);
    } else if (options.fromClipboard) {
      responseText = await readClipboard();
      console.log(`  Reading response from clipboard (${responseText.length} chars)`);
    } else {
      console.error('Error: provide --from-clipboard or --from-file <path>');
      process.exit(1);
    }

    // 3. Parse LLM findings
    const llmFindings = parseEvaluation(responseText);
    console.log(`  Parsed ${llmFindings.length} LLM finding(s)`);

    // 4. Re-run heuristics from saved page data
    const { loadPageStates } = await import('./runner/local.js');
    const pages = await loadPageStates(captureDir);
    const heuristicFindings = await runHeuristics(pages);
    const heuristicConverted = heuristicFindings.map(heuristicToFinding);

    // 5. Merge (heuristics first, then LLM)
    const allFindings = [...heuristicConverted, ...llmFindings];
    console.log(`  Total findings: ${allFindings.length} (${heuristicConverted.length} heuristic + ${llmFindings.length} LLM)`);

    // 6. Generate report
    const reportPath = await generateReport(captureDir, allFindings);
    console.log(`\n  Report saved: ${reportPath}`);

    // 7. Open in browser
    if (options.open) {
      openInBrowser(reportPath);
    }
  });

function readClipboard(): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd: string, args: string[];
    if (process.platform === 'win32') {
      cmd = 'powershell.exe';
      args = ['-noprofile', '-command', 'Get-Clipboard'];
    } else if (process.platform === 'darwin') {
      cmd = 'pbpaste'; args = [];
    } else {
      cmd = 'xclip'; args = ['-selection', 'clipboard', '-o'];
    }

    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => resolve(out));
    proc.on('error', reject);
  });
}

function openInBrowser(filePath: string): void {
  const absPath = path.resolve(filePath);
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', absPath], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawn('open', [absPath], { detached: true, stdio: 'ignore' });
  } else {
    spawn('xdg-open', [absPath], { detached: true, stdio: 'ignore' });
  }
}

// ─── login ───────────────────────────────────────────────────────────────────

program
  .command('login <url>')
  .description('Open a browser, let you log in manually, then save the session for future captures')
  .action(async (url: string) => {
    console.log(`\nUIGhost login`);
    console.log(`  Opening ${url} in a browser window.`);
    console.log(`  Log in, then press Enter here to save the session.\n`);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);

    await waitForEnter('Press Enter once you are logged in...');

    const storageState = await context.storageState();
    await context.close();
    await browser.close();

    const savedPath = await saveSession(url, storageState);
    console.log(`\nSession saved to ${savedPath}`);
    console.log(`Run "uighost capture ${url}" — auth will be loaded automatically.\n`);
  });

program.parse();

function waitForEnter(prompt: string): Promise<void> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt + ' ', () => {
      rl.close();
      resolve();
    });
  });
}
