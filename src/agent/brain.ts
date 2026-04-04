import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import type { PageState } from '../crawler/web-crawler.js';
import type { SessionMemory } from './memory.js';

export interface AgentAction {
  type: 'click' | 'type' | 'navigate' | 'scroll' | 'stop';
  target?: string;
  value?: string;
  reasoning: string;
  finding?: string; // optional UX issue noted on this page
}

// ---------------------------------------------------------------------------
// Template loading
// ---------------------------------------------------------------------------

function resolveTemplateDir(): string {
  const thisFile = url.fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), '..', '..', 'prompt-templates');
}

async function loadTemplate(): Promise<string> {
  return fs.readFile(path.join(resolveTemplateDir(), 'explore.md'), 'utf-8');
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function formatElementList(state: PageState): string {
  const els = state.interactiveElements.slice(0, 20);
  if (els.length === 0) return '  (none detected)';
  return els
    .map(el => {
      const label = el.text?.slice(0, 60) ?? el.role ?? el.tag;
      const href = el.href ? ` → ${el.href}` : '';
      return `  - [${el.tag}] "${label}" — selector: \`${el.selector}\`${href}`;
    })
    .join('\n');
}

function formatVisitedUrls(urls: string[]): string {
  if (urls.length === 0) return '  (none yet)';
  return urls.map(u => `  - ${u}`).join('\n');
}

function formatRecentActions(actions: { type: string; target?: string }[]): string {
  if (actions.length === 0) return 'none';
  return actions.map(a => `${a.type}${a.target ? ` → ${a.target}` : ''}`).join(' | ');
}

function formatRecentFindings(findings: string[]): string {
  if (findings.length === 0) return '';
  const list = findings.map(f => `  - ${f}`).join('\n');
  return `## Issues found so far (last ${findings.length})\n\n${list}\n`;
}

function substitute(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

async function buildExplorePrompt(
  state: PageState,
  memory: SessionMemory,
  screenshotAbsPath: string,
  responseAbsPath: string,
): Promise<string> {
  const template = await loadTemplate();
  const summary = memory.getSummary();

  const ariaSnapshot = state.accessibilityTree
    ? state.accessibilityTree.split('\n').slice(0, 40).join('\n')
    : '(not available)';

  return substitute(template, {
    SCREENSHOT_ABS_PATH: screenshotAbsPath,
    RESPONSE_ABS_PATH: responseAbsPath,
    CURRENT_URL: state.url,
    CURRENT_TITLE: state.title,
    ELEMENT_COUNT: String(state.interactiveElements.length),
    ELEMENT_LIST: formatElementList(state),
    ARIA_SNAPSHOT: ariaSnapshot,
    PAGES_VISITED: String(summary.pagesVisited),
    PAGES_BUDGET: String(summary.pagesVisited + summary.pagesRemaining),
    ACTIONS_USED: String(summary.actionsUsed),
    ACTIONS_BUDGET: String(summary.actionsUsed + summary.actionsRemaining),
    FINDINGS_COUNT: String(summary.findingsCount),
    VISITED_URLS: formatVisitedUrls(summary.visitedUrls),
    RECENT_ACTIONS: formatRecentActions(summary.recentActions),
    RECENT_FINDINGS: formatRecentFindings(summary.recentFindings),
  });
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

export function parseActionResponse(response: string): AgentAction {
  const get = (key: string): string | undefined => {
    const m = new RegExp(`^${key}:\\s*(.+)`, 'im').exec(response);
    return m?.[1]?.trim();
  };

  const rawType = (get('ACTION') ?? 'stop').toLowerCase();
  const type = (['click', 'type', 'navigate', 'scroll', 'stop'] as const).find(t => t === rawType)
    ?? 'stop';

  return {
    type,
    target: get('TARGET'),
    value: get('VALUE'),
    reasoning: get('REASONING') ?? 'no reasoning provided',
    finding: get('FINDING'),
  };
}

// ---------------------------------------------------------------------------
// Wait for response file to appear (poll every second)
// ---------------------------------------------------------------------------

async function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(filePath);
      await new Promise(r => setTimeout(r, 500)); // brief pause so the file is fully written
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DecideOptions {
  exploreDir: string;
  step: number;
  stepTimeoutMs: number; // how long to wait for the response file before giving up
}

export async function decideNextAction(
  currentState: PageState,
  memory: SessionMemory,
  opts: DecideOptions,
): Promise<AgentAction> {
  const stopCheck = memory.shouldStop();
  if (stopCheck.stop) {
    return { type: 'stop', reasoning: stopCheck.reason };
  }

  const stepIdx = String(opts.step).padStart(3, '0');
  const promptFile = path.join(opts.exploreDir, `step-${stepIdx}-prompt.md`);
  const responseFile = path.join(opts.exploreDir, `step-${stepIdx}-response.md`);

  const screenshotAbsPath = path.resolve(currentState.screenshotPath);
  const responseAbsPath = path.resolve(responseFile);
  const explorePrompt = await buildExplorePrompt(currentState, memory, screenshotAbsPath, responseAbsPath);
  await fs.writeFile(promptFile, explorePrompt, 'utf-8');

  const sep = '─'.repeat(60);
  const summary = memory.getSummary();
  console.log(`\n${sep}`);
  console.log(`  Step ${opts.step}  |  ${summary.pagesVisited} page(s) visited  |  ${summary.findingsCount} finding(s)`);
  console.log(sep);
  const absPromptFile = path.resolve(promptFile);
  const absScreenshot = path.resolve(currentState.screenshotPath);
  const absResponseFile = path.resolve(responseFile);

  console.log(`\n  ── Claude Code (paste this one line) ───────────────────`);
  console.log(`  Please read the prompt at ${absPromptFile} and follow through.`);
  console.log(`  ────────────────────────────────────────────────────────`);
  console.log(`\n  ── Other LLMs ──────────────────────────────────────────`);
  console.log(`  Prompt:     ${absPromptFile}`);
  console.log(`  Screenshot: ${absScreenshot}`);
  console.log(`  ────────────────────────────────────────────────────────`);
  console.log(`\n  Save Claude's response here (loop resumes automatically):`);
  console.log(`    ${absResponseFile}`);
  console.log(`\n  Waiting...\n`);

  const appeared = await waitForFile(responseFile, opts.stepTimeoutMs);
  if (!appeared) {
    return { type: 'stop', reasoning: `timed out waiting for response file — resume with: node dist/cli.js explore --resume ${path.resolve(opts.exploreDir)}` };
  }

  let responseText: string;
  try {
    responseText = await fs.readFile(responseFile, 'utf-8');
  } catch {
    console.error(`\n  [error] Could not read ${responseFile} — skipping step`);
    return { type: 'stop', reasoning: 'response file not found' };
  }

  const action = parseActionResponse(responseText);

  if (action.finding) {
    memory.addFinding(action.finding);
    console.log(`\n  [finding recorded] ${action.finding}`);
  }

  console.log(`  [action] ${action.type}${action.target ? ` → ${action.target}` : ''} — ${action.reasoning}`);

  return action;
}
