// TODO: Claude response parser — structured finding extraction
// Responsibilities:
//   - Parse Claude's markdown response into typed Finding[]
//   - Handle format variations (Claude won't always be perfectly consistent)
//   - Merge LLM findings with heuristic findings, deduplicate overlaps
//   - Accept input from: piped stdout, clipboard text, or a response file

import type { HeuristicFinding, Severity } from './heuristics.js';

export interface LLMFinding {
  severity: Severity;
  category: 'navigation' | 'accessibility' | 'visual' | 'content' | 'interaction';
  page: string;
  element?: string;
  description: string;
  suggestion: string;
}

export interface ParsedReport {
  llmFindings: LLMFinding[];
  heuristicFindings: HeuristicFinding[];
  mergedFindings: Array<LLMFinding | HeuristicFinding>;
}

export function parseClaudeResponse(_responseText: string): LLMFinding[] {
  // TODO: extract structured findings from Claude's markdown output
  throw new Error('Not implemented');
}

export function mergeFindings(
  _llm: LLMFinding[],
  _heuristics: HeuristicFinding[]
): Array<LLMFinding | HeuristicFinding> {
  // TODO: merge and deduplicate findings by page + element + description
  throw new Error('Not implemented');
}
