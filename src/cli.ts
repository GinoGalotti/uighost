#!/usr/bin/env node
// CLI entrypoint — wires up all commands via commander
import { program } from 'commander';

program
  .name('uighost')
  .description('AI UI testing agent — capture → prompt → evaluate')
  .version('0.1.0');

program
  .command('capture <url>')
  .description('Crawl a URL and save screenshots + element data locally')
  .option('-d, --depth <number>', 'crawl depth (follow links N levels deep)', '2')
  .option('-m, --max-pages <number>', 'maximum pages to capture', '10')
  .option('-o, --output <dir>', 'output directory for capture packages', '.uighost/captures/')
  .action(async (url: string, options: { depth: string; maxPages: string; output: string }) => {
    // TODO: import and call the web crawler + capture package builder
    console.log(`Capturing ${url} (depth=${options.depth}, max-pages=${options.maxPages}) → ${options.output}`);
  });

program.parse();
