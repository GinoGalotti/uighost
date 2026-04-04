import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { runHeuristics } from '../src/judge/heuristics.js';
import type { PageState } from '../src/crawler/web-crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Build a minimal PageState from the fixture HTML ──────────────────────────
//
// We manually parse the HTML to construct the PageState rather than launching
// Playwright, keeping the test fast and self-contained.

function buildPageStateFromFixture(): PageState {
  const html = readFileSync(
    path.join(__dirname, 'fixtures/violations.html'),
    'utf8'
  );

  // ── metadata ────────────────────────────────────────────────────────────────

  // lang: no lang attribute on <html>
  const langMatch = /<html[^>]*\slang\s*=\s*["']([^"']*)["']/i.exec(html);
  const lang: string | null = langMatch ? langMatch[1] : null;

  // viewport: no <meta name="viewport">
  const hasViewport = /<meta[^>]*name\s*=\s*["']viewport["']/i.test(html);
  const viewport = hasViewport ? { width: 1280, height: 800 } : null;

  // heading structure: parse in document order
  const headingStructure: string[] = [];
  const headingRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(html)) !== null) {
    const tag = hm[1].toLowerCase();
    const text = hm[2].replace(/<[^>]+>/g, '').trim();
    headingStructure.push(`${tag}: ${text}`);
  }

  // ── interactive elements ─────────────────────────────────────────────────────

  // Links
  const links: PageState['interactiveElements'] = [];
  const anchorRe = /<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  let linkIdx = 0;
  while ((am = anchorRe.exec(html)) !== null) {
    const attrs = am[1];
    const innerText = am[2].replace(/<[^>]+>/g, '').trim() || null;
    const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const href = hrefMatch ? hrefMatch[1] : undefined;
    const roleMatch = /role\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const role: string | null = roleMatch ? roleMatch[1] : null;
    links.push({
      tag: 'a',
      role,
      text: innerText,
      href,
      boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      visible: true,
      selector: `a:nth-of-type(${++linkIdx})`,
    });
  }

  // Buttons
  const buttons: PageState['interactiveElements'] = [];
  const buttonRe = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  let bm: RegExpExecArray | null;
  let btnIdx = 0;
  while ((bm = buttonRe.exec(html)) !== null) {
    const attrs = bm[1];
    const innerText = bm[2].replace(/<[^>]+>/g, '').trim() || null;
    const roleMatch = /role\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const role: string | null = roleMatch ? roleMatch[1] : null;
    buttons.push({
      tag: 'button',
      role,
      text: innerText,
      boundingBox: { x: 0, y: 0, width: 80, height: 30 },
      visible: true,
      selector: `button:nth-of-type(${++btnIdx})`,
    });
  }

  // Inputs (self-closing)
  const inputs: PageState['interactiveElements'] = [];
  const inputRe = /<input\s([^>]*)\/?>/gi;
  let im: RegExpExecArray | null;
  let inputIdx = 0;
  while ((im = inputRe.exec(html)) !== null) {
    const attrs = im[1];
    const roleMatch = /role\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const role: string | null = roleMatch ? roleMatch[1] : null;
    // aria-label / placeholder / alt would populate text in the real extractor
    const ariaLabel = /aria-label\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? null;
    const placeholder = /placeholder\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? null;
    const text: string | null = ariaLabel ?? placeholder ?? null;
    inputs.push({
      tag: 'input',
      role,
      text,
      boundingBox: { x: 0, y: 0, width: 200, height: 24 },
      visible: true,
      selector: `input:nth-of-type(${++inputIdx})`,
    });
  }

  return {
    url: 'file:///test/fixtures/violations.html',
    title: 'Violations Fixture',
    screenshotPath: '',
    accessibilityTree: null,
    interactiveElements: [...links, ...buttons, ...inputs],
    metadata: {
      lang,
      viewport,
      headingStructure,
      formCount: 0,
      linkCount: links.length,
      imageCount: 0,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const pageState = buildPageStateFromFixture();

test('runHeuristics: missing-lang is reported (critical, accessibility)', async () => {
  const findings = await runHeuristics([pageState]);
  const found = findings.find(f => f.rule === 'missing-lang');
  assert.ok(found, 'expected a missing-lang finding');
  assert.equal(found.severity, 'critical');
  assert.equal(found.category, 'accessibility');
  assert.equal(found.page, pageState.url);
});

test('runHeuristics: missing-viewport is reported (major, structure)', async () => {
  const findings = await runHeuristics([pageState]);
  const found = findings.find(f => f.rule === 'missing-viewport');
  assert.ok(found, 'expected a missing-viewport finding');
  assert.equal(found.severity, 'major');
  assert.equal(found.category, 'structure');
});

test('runHeuristics: multiple-h1 is reported (major, structure)', async () => {
  const findings = await runHeuristics([pageState]);
  const found = findings.find(f => f.rule === 'multiple-h1');
  assert.ok(found, 'expected a multiple-h1 finding');
  assert.equal(found.severity, 'major');
  assert.equal(found.category, 'structure');
});

test('runHeuristics: heading-skip (h1 → h3) is reported (minor, structure)', async () => {
  const findings = await runHeuristics([pageState]);
  const found = findings.find(f => f.rule === 'heading-skip');
  assert.ok(found, 'expected a heading-skip finding');
  assert.equal(found.severity, 'minor');
  assert.equal(found.category, 'structure');
});

test('runHeuristics: generic-link-text is reported for all four generic links', async () => {
  const findings = await runHeuristics([pageState]);
  const all = findings.filter(f => f.rule === 'generic-link-text');
  assert.ok(all.length >= 4, `expected at least 4 generic-link-text findings, got ${all.length}`);
});

test('runHeuristics: button-no-name is reported for unlabelled buttons', async () => {
  const findings = await runHeuristics([pageState]);
  const all = findings.filter(f => f.rule === 'button-no-name');
  assert.ok(all.length >= 2, `expected at least 2 button-no-name findings, got ${all.length}`);
  for (const f of all) {
    assert.equal(f.severity, 'major');
    assert.equal(f.category, 'accessibility');
  }
});

test('runHeuristics: input-no-label is reported for unlabelled input', async () => {
  const findings = await runHeuristics([pageState]);
  const all = findings.filter(f => f.rule === 'input-no-label');
  assert.ok(all.length >= 1, `expected at least 1 input-no-label finding, got ${all.length}`);
  for (const f of all) {
    assert.equal(f.severity, 'major');
    assert.equal(f.category, 'accessibility');
  }
});

test('runHeuristics: returns empty array for a clean page', async () => {
  const cleanPage: PageState = {
    url: 'https://example.com/',
    title: 'Clean',
    screenshotPath: '',
    accessibilityTree: null,
    interactiveElements: [
      {
        tag: 'a',
        role: null,
        text: 'Documentation',
        href: '/docs',
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
        visible: true,
        selector: 'a',
      },
    ],
    metadata: {
      lang: 'en',
      viewport: { width: 1280, height: 800 },
      headingStructure: ['h1: Welcome', 'h2: Overview', 'h3: Details'],
      formCount: 0,
      linkCount: 1,
      imageCount: 0,
    },
  };

  const findings = await runHeuristics([cleanPage]);
  assert.deepEqual(findings, [], `expected no findings for clean page, got: ${JSON.stringify(findings)}`);
});
