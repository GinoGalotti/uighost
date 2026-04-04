#!/usr/bin/env node
import { program } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';
import { chromium } from 'playwright';
import { crawl, type PageState } from './crawler/web-crawler.js';
import { SessionMemory } from './agent/memory.js';
import { decideNextAction } from './agent/brain.js';
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
  .option('--viewport <pixels>', 'browser viewport width in pixels (default: 1280)', '1280')
  .action(async (url: string, options: { depth: string; maxPages: string; output: string; viewport: string }) => {
    const depth = parseInt(options.depth, 10);
    const maxPages = parseInt(options.maxPages, 10);
    const viewportWidth = parseInt(options.viewport, 10);

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
    console.log(`  Viewport:  ${viewportWidth}px`);
    console.log(`  Output:    ${captureDir}\n`);

    const result = await crawl(url, { depth, maxPages, screenshotDir, storageStatePath, viewportWidth });
    const pkg = await saveCapture(result, captureDir, { maxDepth: depth, maxPages, viewportWidth });

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

    // Auto-generate context file if it doesn't exist
    const contextPath = path.join('.uighost', 'context.json');
    const created = await generateContextFile(contextPath, url, result.pages);
    const separator = '─'.repeat(60);
    console.log(`\n${separator}`);
    if (created) {
      console.log(`  Context file created: ${contextPath}`);
      console.log(`\n  We crawled ${pkg.pageCount} page(s) and drafted a context file.`);
      console.log(`  Review it and add notes about each page's purpose,`);
      console.log(`  then run:\n`);
    } else {
      console.log(`  Using existing context: ${contextPath}`);
      console.log(`\n  Run:\n`);
    }
    console.log(`    uighost evaluate`);
    console.log(`\n${separator}\n`);
  });

// ─── evaluate ────────────────────────────────────────────────────────────────

program
  .command('evaluate')
  .description('Build prompts from the latest capture and print instructions for claude.ai')
  .option('-p, --page <number>', 'use the per-page prompt for page N instead of full-site prompt')
  .option('-c, --capture <dir>', 'path to a specific capture folder (default: latest)')
  .option('--captures-dir <dir>', 'base captures directory', '.uighost/captures')
  .option('--context <file>', 'path to context JSON file (default: .uighost/context.json)')
  .action(async (options: { page?: string; capture?: string; capturesDir: string; context?: string }) => {
    await evaluate({
      capturesDir: options.capturesDir,
      captureDir: options.capture,
      page: options.page !== undefined ? parseInt(options.page, 10) : undefined,
      contextFile: options.context,
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

// ─── explore ─────────────────────────────────────────────────────────────────

program
  .command('explore <url>')
  .description('Interactively explore a site step-by-step, with Claude deciding each action')
  .option('--max-pages <number>', 'max pages to visit', '10')
  .option('--max-actions <number>', 'max actions to take', '20')
  .option('--timeout <seconds>', 'total session timeout in seconds', '1800')
  .option('--resume <dir>', 'resume a previous explore session from its directory')
  .action(async (startUrl: string, options: { maxPages: string; maxActions: string; timeout: string; resume?: string }) => {
    const timeoutMs = parseInt(options.timeout, 10) * 1000;

    let memory: SessionMemory;
    let exploreDir: string;
    let step = 0;

    if (options.resume) {
      exploreDir = options.resume;
      const stateFile = path.join(exploreDir, 'session-state.json');
      const raw = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
      memory = SessionMemory.restore(raw);
      step = raw.nextStep - 1; // will be incremented at loop start
      startUrl = raw.startUrl;
      console.log(`\nUIGhost explore (resuming)`);
      console.log(`  Session dir: ${exploreDir}`);
      console.log(`  Resuming at step ${raw.nextStep}  |  ${raw.visitedUrls.length} page(s) visited  |  ${raw.findings.length} finding(s)\n`);
    } else {
      memory = new SessionMemory({
        maxPages: parseInt(options.maxPages, 10),
        maxActions: parseInt(options.maxActions, 10),
        timeoutMs,
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      exploreDir = path.join('.uighost', 'explore', timestamp);
      await fs.mkdir(exploreDir, { recursive: true });
      console.log(`\nUIGhost explore`);
      console.log(`  Start URL:   ${startUrl}`);
      console.log(`  Max pages:   ${options.maxPages}`);
      console.log(`  Max actions: ${options.maxActions}`);
      console.log(`  Session dir: ${exploreDir}\n`);
    }

    const storageStatePath = await loadSession(startUrl);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ...(storageStatePath ? { storageState: storageStatePath } : {}),
    });
    const page = await context.newPage();

    const { extractPageState } = await import('./extractor/dom-extractor.js');

    console.log(`\nUIGhost explore`);
    console.log(`  Start URL:   ${startUrl}`);
    console.log(`  Max pages:   ${options.maxPages}`);
    console.log(`  Max actions: ${options.maxActions}`);
    console.log(`  Session dir: ${exploreDir}\n`);

    let currentUrl = startUrl;

    try {
      while (true) {
        step++;
        const stepIdx = String(step).padStart(3, '0');

        await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30_000 });
        const extracted = await extractPageState(page);
        const screenshotPath = path.join(exploreDir, `step-${stepIdx}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false }); // viewport only for speed

        const currentState: PageState = {
          ...extracted,
          screenshotPath,
          screenshotPaths: [{ label: 'step', path: screenshotPath }],
        };

        memory.addVisit(currentUrl);

        // Save state before waiting — so the session is resumable even on timeout
        const stateFile = path.join(exploreDir, 'session-state.json');
        await fs.writeFile(stateFile, JSON.stringify(memory.persist(startUrl, step), null, 2));

        const action = await decideNextAction(currentState, memory, {
          exploreDir,
          step,
          stepTimeoutMs: timeoutMs,
        });
        memory.markPageComplete();

        if (action.type === 'stop') {
          console.log(`\n  Stopping: ${action.reasoning}`);
          break;
        }

        memory.addAction({ type: action.type, target: action.target, value: action.value });

        // Execute action
        try {
          if (action.type === 'click' && action.target) {
            // Use the target as a CSS selector only — text fallback caused wrong-element matches
            await page.locator(action.target).first().click({ timeout: 5_000 });
            currentUrl = page.url();
          } else if (action.type === 'type' && action.target) {
            await page.locator(action.target).fill(action.value ?? '');
            currentUrl = page.url();
          } else if (action.type === 'navigate' && action.target) {
            currentUrl = action.target;
          } else if (action.type === 'scroll') {
            const dir = action.target?.toLowerCase();
            await page.keyboard.press(dir === 'up' ? 'PageUp' : 'PageDown');
            currentUrl = page.url();
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [action failed] ${msg} — continuing to next step`);
          currentUrl = page.url();
        }
      }
    } finally {
      await context.close();
      await browser.close();
    }

    const summary = memory.getSummary();
    const separator = '─'.repeat(60);
    console.log(`\n${separator}`);
    console.log(`  Explore session complete`);
    console.log(`  Pages visited: ${summary.pagesVisited}  |  Actions: ${summary.actionsUsed}  |  Findings: ${summary.findingsCount}`);
    console.log(`  Screenshots:   ${exploreDir}`);
    console.log(separator + '\n');
  });

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

async function generateContextFile(
  contextPath: string,
  entryUrl: string,
  pages: PageState[],
): Promise<boolean> {
  // Don't overwrite existing context file
  try {
    await fs.access(contextPath);
    return false;
  } catch {
    // file doesn't exist — create it
  }

  const pagesContext: Record<string, string> = {};
  for (const page of pages) {
    const headings = page.metadata.headingStructure.slice(0, 3).join('; ');
    const hint = headings ? ` Headings: ${headings}.` : '';
    pagesContext[page.url] =
      `Title: "${page.title}".${hint} TODO: describe this page's purpose and any design decisions the AI should treat as intentional.`;
  }

  const context = {
    global: `Site crawled from ${entryUrl}. TODO: describe the site's purpose, intended audience, and any design decisions the AI should not flag as issues (e.g. "dark terminal aesthetic is intentional brand design").`,
    pages: pagesContext,
  };

  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(contextPath, JSON.stringify(context, null, 2), 'utf-8');
  return true;
}
