#!/usr/bin/env node
import { program } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { crawl } from './crawler/web-crawler.js';
import { saveCapture } from './capture/package.js';

program
  .name('uighost')
  .description('AI UI testing agent — capture → prompt → evaluate')
  .version('0.1.0');

program
  .command('capture <url>')
  .description('Crawl a URL and save screenshots + element data locally')
  .option('-d, --depth <number>', 'crawl depth (follow links N levels deep)', '2')
  .option('-m, --max-pages <number>', 'maximum pages to capture', '10')
  .option('-o, --output <dir>', 'base output directory for capture packages', '.uighost/captures')
  .action(async (url: string, options: { depth: string; maxPages: string; output: string }) => {
    const depth = parseInt(options.depth, 10);
    const maxPages = parseInt(options.maxPages, 10);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const captureDir = path.join(options.output, timestamp);
    const screenshotDir = path.join(captureDir, 'pages');

    await fs.mkdir(screenshotDir, { recursive: true });

    console.log(`\nUIGhost capture`);
    console.log(`  URL:       ${url}`);
    console.log(`  Depth:     ${depth}`);
    console.log(`  Max pages: ${maxPages}`);
    console.log(`  Output:    ${captureDir}\n`);

    const result = await crawl(url, { depth, maxPages, screenshotDir });

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

program.parse();
