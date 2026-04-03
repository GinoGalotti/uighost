// TODO: Local runner — saves prompt files for manual use with claude.ai
// Responsibilities:
//   - Write evaluate-all.md, evaluate-page-NNN.md, explore-next.md to the capture folder
//   - Print instructions to stdout: which files to open, which screenshots to attach
//   - Optionally open the capture folder in the OS file explorer
//   - This is Mode 1: zero automation, maximum compatibility (any Claude access)

import type { BuiltPrompts } from '../prompts/builder.js';

export interface LocalRunnerOptions {
  captureDir: string;
  openFolder?: boolean;
}

export async function runLocal(_prompts: BuiltPrompts, _options: LocalRunnerOptions): Promise<void> {
  // TODO: write prompt files and print usage instructions
  throw new Error('Not implemented');
}
