# UIGhost — Claude Code Build Prompts

Ready-to-use prompts for building UIGhost with Claude Code. Organized by phase, with ruflo orchestration where parallelism makes sense.

---

## Phase 1: Scaffolding (sequential)

These run one after another — each depends on the previous.

### Prompt 1.1 — Project init

```
Create a new TypeScript project called "uighost" in ~/projects/uighost with:
- package.json with name "uighost", bin entry pointing to dist/cli.js
- tsconfig.json targeting ES2022, module NodeNext, outDir dist/
- Dependencies: playwright, commander
- Dev dependencies: typescript, @types/node, tsx
- npm scripts: build, dev (tsx), lint
- .gitignore for node_modules, dist, .uighost/
- Empty src/ folder structure:
  src/cli.ts
  src/crawler/web-crawler.ts
  src/extractor/dom-extractor.ts
  src/capture/package.ts
  src/capture/manifest.ts
  src/prompts/builder.ts
  src/judge/heuristics.ts
  src/judge/parser.ts
  src/reporter/report.ts
  src/runner/local.ts

Each file should export a stub with a TODO comment explaining its purpose.
cli.ts should set up commander with a "capture" command that accepts a URL argument
and options --depth (default 2), --max-pages (default 10), --output (default .uighost/captures/).

Run npm install and npx playwright install chromium when done.
Verify it compiles with npm run build.
```

### Prompt 1.2 — DOM extractor

```
Read the project structure in ~/projects/uighost.

Implement src/extractor/dom-extractor.ts. It should export a function:

async function extractPageState(page: Page): Promise<PageState>

Where PageState includes:
- url: string
- title: string
- accessibilityTree: the result of page.accessibility.snapshot() with interestingOnly: false
- interactiveElements: array of { tag, role, text, href?, boundingBox: {x,y,width,height}, visible, selector }
  collected by querying the DOM for all a, button, input, select, textarea, [role="button"], [onclick] elements
- metadata: { lang, viewport, headingStructure: string[], formCount, linkCount, imageCount }

Use page.evaluate() to collect DOM data and page.accessibility.snapshot() for the a11y tree.
Filter out hidden elements (display:none, visibility:hidden, zero dimensions).
Write a test in test/dom-extractor.test.ts that runs against https://example.com.
```

### Prompt 1.3 — Web crawler

```
Read src/extractor/dom-extractor.ts to understand PageState.

Implement src/crawler/web-crawler.ts. It should export:

async function crawlSite(entryUrl: string, options: CrawlOptions): Promise<CrawlResult>

CrawlOptions: { maxDepth: number, maxPages: number, screenshotDir: string }
CrawlResult: { pages: Map<string, { state: PageState, screenshotPath: string }>, errors: string[] }

Behavior:
- Launch Playwright chromium headless
- BFS from entryUrl, same-origin only
- At each page: wait for networkidle, call extractPageState(), take full-page screenshot
- Save screenshot as PNG to screenshotDir/page-NNN.png
- Collect all same-origin href links from interactive elements, add to queue
- Skip URLs ending in common non-page extensions (.png, .jpg, .pdf, .zip, etc.)
- Respect maxDepth and maxPages limits
- Handle errors gracefully: log failed pages, continue crawling
- Close browser when done

Wire it into the CLI "capture" command in cli.ts.
Test by running: npx tsx src/cli.ts capture https://example.com
```

### Prompt 1.4 — Capture package

```
Read src/crawler/web-crawler.ts to understand CrawlResult.

Implement src/capture/package.ts and src/capture/manifest.ts.

After crawling, save a structured capture folder:

.uighost/captures/<timestamp>/
├── manifest.json
├── pages/
│   ├── page-001.png (already saved by crawler)
│   ├── page-001.json (PageState serialized)
│   ├── page-002.png
│   ├── page-002.json
│   └── ...
└── prompts/ (empty dir for now, populated by prompt builder later)

manifest.json should contain:
{
  captureId: timestamp string,
  entryUrl: string,
  capturedAt: ISO date,
  pageCount: number,
  pages: [{ index: number, url: string, screenshotFile: string, dataFile: string, elementCount: number }],
  options: { maxDepth, maxPages },
  duration: milliseconds
}

Wire into CLI so "uighost capture <url>" produces this complete folder.
Test against https://example.com and verify the folder structure is correct.
```

---

## Phase 2: Heuristics + Prompts (parallel with ruflo)

These two are independent — perfect for ruflo parallel execution.

### Ruflo orchestration prompt:

```
Use the Task tool to run these two agents in parallel:

Agent 1 - "heuristics-builder":
  Scope: src/judge/heuristics.ts
  Context: Read src/extractor/dom-extractor.ts to understand PageState.
  Task: Implement heuristic UX/accessibility checks that run against PageState without any LLM.
  Checks to implement:
  - Images missing alt attributes
  - Form inputs without associated labels (for attribute or aria-label)
  - Links with generic text (exact match: "click here", "read more", "learn more", "here")
  - Missing html lang attribute
  - Missing viewport meta tag
  - Heading hierarchy violations (h1→h3 skip, multiple h1s)
  - Duplicate element IDs
  - Buttons without accessible names
  - Positive tabindex values (tabindex > 0)
  Export: async function runHeuristics(pages: Map<string, PageState>): Promise<HeuristicFinding[]>
  Where HeuristicFinding: { severity, category: 'accessibility'|'content'|'structure', rule: string, page: string, element?: string, description: string }
  Write tests in test/heuristics.test.ts against a local HTML fixture with known violations.
  When done, save output to file and run ruflo memory store.

Agent 2 - "prompt-builder":
  Scope: src/prompts/builder.ts and prompt-templates/
  Context: Read src/capture/manifest.ts and src/judge/heuristics.ts to understand data shapes.
  Task: Implement the prompt builder that takes a capture folder and generates evaluation prompts.
  Create prompt-templates/evaluate.md as a Handlebars-style template with placeholders.
  The generated prompt should:
  - Start with clear instructions for Claude (role: UX auditor)
  - List what to evaluate (visual hierarchy, readability, contrast, navigation, consistency, accessibility)
  - Include heuristic findings already detected (so Claude doesn't duplicate)
  - For each page: reference the screenshot filename, summarize interactive elements
  - Request structured output format (severity/category/page/element/description/suggestion)
  - Be optimized for claude.ai usage: tell the user which screenshots to attach
  Generate two variants:
  - evaluate-all.md: full audit prompt for all pages
  - evaluate-page-NNN.md: per-page prompt for large sites
  Export: async function buildPrompts(captureDir: string, heuristics?: HeuristicFinding[]): Promise<void>
  Saves prompts to the captures prompts/ subfolder.
  When done, save output to file and run ruflo memory store.
```

---

## Phase 3: Runner + Report (sequential)

### Prompt 3.1 — Local runner + clipboard workflow

```
Read src/prompts/builder.ts and the capture folder structure.

Implement src/runner/local.ts:

When user runs "uighost evaluate", it should:
1. Find the most recent capture in .uighost/captures/
2. Print a clear instruction block:
   "📋 Copy the prompt below and paste it into claude.ai
    📎 Attach these screenshots: [list of files with full paths]
    📝 When Claude responds, copy the response and run: uighost report --from-clipboard"
3. Print the full prompt content to stdout (or copy to clipboard if pbcopy/xclip available)
4. If --page N flag is given, use the per-page prompt instead

Wire into CLI as "uighost evaluate" command.
Test the full flow: capture a site, then run evaluate, verify the output makes sense.
```

### Prompt 3.2 — Response parser + HTML report

```
Read the prompt template in prompt-templates/evaluate.md to understand the expected response format.

Implement src/judge/parser.ts:
- Parse Claude's text response into structured findings
- Expected format from Claude: markdown with severity/category/page/element/description/suggestion per finding
- Be forgiving: handle variations in formatting, missing fields, extra text
- Export: function parseEvaluation(response: string): Finding[]
- Finding: { severity: 'critical'|'major'|'minor'|'suggestion', category: string, page: string, element?: string, description: string, suggestion: string, source: 'llm'|'heuristic' }

Implement src/reporter/report.ts:
- Generate an HTML report from findings + capture data
- Sections: summary (counts by severity, pages audited), per-page (screenshot embed + findings)
- Each finding: severity badge (color-coded), category tag, description, suggestion
- Embed screenshots as base64 images in the HTML (single self-contained file)
- Include heuristic findings merged with LLM findings, marked differently
- Clean, professional design — this is what users share with stakeholders
- Export: async function generateReport(captureDir: string, findings: Finding[]): Promise<string>
- Save to captures/report/report.html

Wire into CLI:
- "uighost report --from-clipboard" reads clipboard, parses, generates report
- "uighost report --from-file response.txt" reads from file instead
- Opens the report in default browser when done

Test with a sample Claude response (write a realistic fixture in test/fixtures/).
```

---

## Phase 4: Agent loop (sequential, builds on everything)

### Prompt 4.1 — Exploration agent

```
Read src/crawler/web-crawler.ts, src/extractor/dom-extractor.ts, src/prompts/builder.ts.

Implement src/agent/brain.ts and src/agent/memory.ts.

memory.ts:
- SessionMemory class tracking: visited URLs, actions taken, findings so far, page summaries
- Methods: addVisit(), addAction(), addFinding(), getSummary(), shouldStop()
- Stop conditions: maxPages reached, maxActions reached, timeout, or 3 consecutive pages with no new findings

brain.ts:
- Export: async function decideNextAction(currentState: PageState, memory: SessionMemory): Promise<AgentAction>
- AgentAction: { type: 'click'|'type'|'navigate'|'scroll'|'stop', target?: string, value?: string, reasoning: string }
- Builds an exploration prompt from current state + memory summary
- The prompt template (prompt-templates/explore.md) should give Claude:
  current page screenshot reference + element list, visited pages summary,
  issues found count, remaining budget, and ask for exactly one next action
- For local mode: print the decision prompt and wait for user to paste Claude's response
- For pipe/API mode: send directly (implement later)

Wire into CLI as "uighost explore <url>" with --max-pages and --max-actions flags.
The explore loop: capture → decide → act → repeat.
For now, implement only the prompt generation side (local mode).
```

### Prompt 4.2 — Personas

```
Read src/agent/brain.ts and prompt-templates/explore.md.

Create persona prompt modifiers in src/prompts/personas.ts and prompt-templates/personas/:

Each persona is a system prompt prefix that changes exploration priorities and evaluation criteria.

first-time-user.md:
"You are visiting this website for the first time. You don't know what it does.
Focus on: Is the purpose clear within 10 seconds? Can you find the main action?
Is the navigation intuitive? Are there any dead ends? Rate your confusion level at each step."

task-completer.md:
"Your goal is: {{goal}}. Try to complete this task.
Focus on: How many steps does it take? Are there unnecessary steps? Where do you get stuck?
Is the progress clear? Can you recover from mistakes? Note every friction point."

accessibility.md:
"You are testing this site for accessibility compliance.
Focus on: Can all actions be completed with keyboard only? Are ARIA roles correct?
Is the heading structure logical? Do images have meaningful alt text?
Are color contrasts sufficient? Is focus state visible?"

impatient-user.md:
"You have 30 seconds of patience. Flag anything that wastes time.
Focus on: Unnecessary modals, cookie banners that require effort, slow-loading elements,
walls of text before the actual content, required account creation for simple actions."

Export: function getPersonaPrompt(persona: string, options?: { goal?: string }): string

Wire into CLI: --persona flag on both "evaluate" and "explore" commands.
```

---

## Handy single-shot prompts (no ruflo needed)

### README polish
```
Read the entire ~/projects/uighost codebase.
Write a README.md that sells the project:
- One-line description
- "Why?" section (3 sentences max)
- Animated GIF placeholder
- Quick start: npm install, capture, evaluate, report (4 commands)
- CLI reference table
- Architecture diagram (mermaid)
- Three modes explained (local/pipe/API)
- Contributing section
- License MIT
Keep it under 200 lines. No fluff.
```

### Sample report generator
```
Read the report template in src/reporter/report.ts.
Create a script at scripts/generate-sample-report.ts that:
1. Runs uighost capture against https://example.com
2. Creates realistic mock findings (mix of critical, major, minor, suggestion)
3. Generates a report to samples/example-com-report.html
This is for the README and demo — make the findings realistic and the report look professional.
```

---

## Ruflo tips for this project

- Phase 2 (heuristics + prompts) is the clearest parallelism win — no shared dependencies
- Phase 1 is strictly sequential — each step needs the previous
- When using ruflo, always have agents read relevant source files before writing
- Name agents descriptively: "heuristics-builder", "prompt-builder", not "agent-1"
- End every ruflo agent with `ruflo memory store` so context persists
- Max 2 parallel agents for this project — the files are interconnected enough that more would cause conflicts
