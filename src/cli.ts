#!/usr/bin/env node
import { program } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';
import { chromium } from 'playwright';
import { crawl } from './crawler/web-crawler.js';
import { saveCapture } from './capture/package.js';
import { saveSession, loadSession } from './auth/session.js';

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
    const pkg = await saveCapture(result, captureDir);

    console.log(`\nDone.`);
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
