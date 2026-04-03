// TODO: Prompt builder — assembles Claude-ready markdown prompts from capture data
// Responsibilities:
//   - Read a capture folder (manifest + heuristics.json)
//   - Generate evaluate-all.md: full-site audit prompt with all pages + heuristic findings
//   - Generate evaluate-page-NNN.md: per-page prompts (smaller, for iterating)
//   - Generate explore-next.md: agent exploration prompt for autonomous mode
//   - Screenshot references by filename so users can drag-and-drop into claude.ai
//   - Smart truncation: summarise pages with 200+ elements rather than listing all

import type { CaptureManifest } from '../capture/manifest.js';
import type { HeuristicResults } from '../judge/heuristics.js';

export interface BuiltPrompts {
  evaluateAll: string;
  evaluatePerPage: string[];
  exploreNext: string;
}

export function buildPrompts(_manifest: CaptureManifest, _heuristics: HeuristicResults): BuiltPrompts {
  // TODO: load templates and interpolate capture data
  throw new Error('Not implemented');
}
