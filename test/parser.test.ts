import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { parseEvaluation, heuristicToFinding } from '../src/judge/parser.js';
import type { HeuristicFinding } from '../src/judge/heuristics.js';

const FIXTURE_DIR = path.join(url.fileURLToPath(import.meta.url), '..', 'fixtures');

test('parseEvaluation: returns all 5 findings from fixture', async () => {
  const response = await fs.readFile(path.join(FIXTURE_DIR, 'claude-response.md'), 'utf-8');
  const findings = parseEvaluation(response);

  assert.equal(findings.length, 5, `expected 5 findings, got ${findings.length}`);
  assert.ok(findings.every(f => f.source === 'llm'), 'all parsed findings should have source=llm');
});

test('parseEvaluation: severity values are normalised', async () => {
  const response = await fs.readFile(path.join(FIXTURE_DIR, 'claude-response.md'), 'utf-8');
  const findings = parseEvaluation(response);

  const severities = findings.map(f => f.severity);
  assert.ok(severities.includes('critical'), 'should include critical');
  assert.ok(severities.includes('major'), 'should include major');
  assert.ok(severities.includes('minor'), 'should include minor');
  assert.ok(severities.includes('suggestion'), 'should include suggestion');
});

test('parseEvaluation: extracts page, description, suggestion', async () => {
  const response = await fs.readFile(path.join(FIXTURE_DIR, 'claude-response.md'), 'utf-8');
  const findings = parseEvaluation(response);

  const critical = findings.find(f => f.severity === 'critical')!;
  assert.ok(critical, 'should have a critical finding');
  assert.ok(critical.page.includes('example.com'), `page should contain example.com, got: ${critical.page}`);
  assert.ok(critical.description.length > 0, 'description should be non-empty');
  assert.ok(critical.suggestion.length > 0, 'suggestion should be non-empty');
});

test('parseEvaluation: element field is undefined when N/A', async () => {
  const response = await fs.readFile(path.join(FIXTURE_DIR, 'claude-response.md'), 'utf-8');
  const findings = parseEvaluation(response);

  const minor = findings.find(f => f.severity === 'minor')!;
  assert.equal(minor.element, undefined, 'element should be undefined when marked N/A');
});

test('parseEvaluation: handles empty response gracefully', () => {
  assert.deepEqual(parseEvaluation(''), []);
  assert.deepEqual(parseEvaluation('Some preamble text with no issue blocks.'), []);
});

test('heuristicToFinding: converts correctly with source=heuristic', () => {
  const h: HeuristicFinding = {
    severity: 'critical',
    category: 'accessibility',
    rule: 'missing-lang',
    page: 'https://example.com/',
    description: 'The <html> element is missing a lang attribute.',
  };

  const f = heuristicToFinding(h);
  assert.equal(f.source, 'heuristic');
  assert.equal(f.severity, 'critical');
  assert.equal(f.page, 'https://example.com/');
  assert.equal(f.title, 'missing-lang');
  assert.ok(f.suggestion.length > 0, 'suggestion should be auto-generated');
});
