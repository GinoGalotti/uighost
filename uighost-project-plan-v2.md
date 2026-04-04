# UIGhost — AI UI Testing Agent

**Project plan: 4 weeks from zero to shippable product**

An autonomous agent that navigates UIs, captures state, and prepares structured prompts for Claude to evaluate — locally, no API key required. Optional API mode for automation.

---

## Core concept: capture → prompt → evaluate

The tool does the **browser automation and data capture** locally. It then packages everything into a prompt you feed to whatever Claude you have access to:

```
Mode 1 (local):    Playwright crawl → screenshots + prompt file → paste into claude.ai / Claude Code
Mode 2 (CLI pipe): Playwright crawl → pipe prompt into Claude Code (`cat prompt.md | claude`)
Mode 3 (API):      Playwright crawl → call Claude API directly (BYOK)
```

**Why this matters:**
- Zero cost during development — use your Max subscription
- Zero friction for users — no API key signup, no billing
- Claude Code users get the tightest loop (`uighost capture` → `claude` in the same terminal)
- API mode exists for CI/CD integration and managed service later

---

## Architecture

```
CLI entrypoint
  → Crawler (Playwright — navigate, screenshot, extract)
    → Capture Package (local folder with screenshots + context)
      → Prompt Builder (assembles markdown prompt referencing captures)
        → Runner (one of):
            ├── local:  saves prompt + images for manual use
            ├── pipe:   feeds into Claude Code via stdin
            └── api:    calls Claude API directly (BYOK)
      → Report Parser (structures Claude's response into HTML report)
```

**Capture package** (saved to `.uighost/captures/<timestamp>/`):
```
captures/2026-04-03_143022/
├── manifest.json                # URLs, element counts, viewport width, crawl metadata
├── pages/
│   ├── page-001-desktop.png     # Full-page screenshot at desktop viewport (default 1280px)
│   ├── page-001-mobile.png      # Full-page screenshot at mobile viewport (390px)
│   ├── page-001.json            # Accessibility tree + interactive elements
│   ├── page-002-desktop.png
│   ├── page-002-mobile.png
│   ├── page-002.json
│   └── ...
├── prompts/
│   ├── evaluate-all.md          # Full audit prompt — references desktop + mobile screenshots
│   ├── evaluate-page-001.md     # Per-page prompt (smaller, for iterating)
│   └── explore-next.md          # Agent decision prompt (for autonomous mode)
└── report/                      # Final report output (after evaluation)
    └── report.html
```

**Project-level state** (persists across captures, gitignored except context.json):
```
.uighost/
├── context.json             # Site context annotations — auto-generated after first capture,
│                            # reviewed and edited by user before evaluating.
│                            # Injected per-page into the Claude prompt.
├── auth/
│   └── <domain>.json        # Playwright storageState (session cookies, gitignored)
└── captures/
    └── ...
```

**Repo structure:**
```
uighost/
├── src/
│   ├── cli.ts                 # CLI entrypoint
│   ├── crawler/
│   │   ├── web-crawler.ts     # Playwright-based navigation + capture
│   │   └── screen-crawler.ts  # Screenshot+coords for native/games (week 3)
│   ├── extractor/
│   │   ├── dom-extractor.ts   # A11y tree, interactive elements, computed styles
│   │   └── vision-extractor.ts # Screenshot-based element detection (week 3)
│   ├── capture/
│   │   ├── package.ts         # Build the capture folder structure
│   │   └── manifest.ts        # Crawl metadata
│   ├── prompts/
│   │   ├── builder.ts         # Assemble prompts from capture data
│   │   ├── templates/         # Prompt templates (evaluate, explore, persona)
│   │   └── personas.ts        # Persona prompt modifiers
│   ├── runner/
│   │   ├── local.ts           # Save prompt files for manual use
│   │   ├── pipe.ts            # Feed into Claude Code stdin
│   │   └── api.ts             # Direct API call (BYOK)
│   ├── judge/
│   │   ├── parser.ts          # Parse Claude's response into findings
│   │   └── heuristics.ts      # Programmatic checks (no LLM)
│   └── reporter/
│       ├── report.ts          # Compile findings into HTML
│       └── templates/         # HTML report templates
├── prompt-templates/
│   ├── evaluate.md            # UX evaluation prompt template
│   ├── explore.md             # Agent exploration prompt template
│   └── personas/
│       ├── first-time-user.md
│       ├── accessibility.md
│       ├── task-completer.md
│       └── impatient-user.md
├── test/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Auth / Login design

**Problem:** most real apps are behind auth. The crawler needs a way to carry a logged-in session without storing credentials in code or config.

**Solution: Playwright storageState persistence**

Playwright's `context.storageState()` snapshots all cookies + localStorage for a browser context. We save that to disk keyed by domain and reload it on the next crawl.

```
.uighost/auth/<domain>.json   ← storageState snapshot (gitignored)
```

### Commands

```bash
uighost login https://app.example.com
# Opens headed Chromium at the URL.
# You log in however the site requires (password, SSO, 2FA — anything).
# Press Enter → saves storageState to .uighost/auth/app.example.com.json

uighost capture https://app.example.com
# Automatically detects .uighost/auth/app.example.com.json
# Loads it into browser context before crawling
# Prints "Auth: .uighost/auth/app.example.com.json" in output
```

### Implementation

- `src/auth/session.ts` — `saveSession(url, storageState)` / `loadSession(url): string | undefined`
- `CrawlOptions.storageStatePath?: string` — passed to `browser.newContext({ storageState })`
- Auth files live under `.uighost/auth/` which is gitignored — credentials never committed

### Limitations / future work

- StorageState expires when the site's session cookie expires — user reruns `login` to refresh
- Does not handle apps that require a fresh login on every visit (short-lived tokens)
- Future: `--auth-script <file>` option for scripted login flows (OAuth, SAML) that can't be done interactively

---

## Site Context Design

**Problem:** Claude has no knowledge of the site's purpose, intended audience, or deliberate design choices. Without context it flags intentional decisions as bugs — "dark terminal aesthetic" as a contrast failure, "dense data tables" as a hierarchy problem, etc.

**Solution: `.uighost/context.json`**

A project-level file (gitignore-safe, not inside the capture folder) that the user reviews and edits once per site, then reuses across multiple captures.

### Format

```json
{
  "global": "One paragraph: site purpose, audience, design intent the AI should know.",
  "pages": {
    "https://example.com/dashboard": "This page is a GM reference tool, not user-facing. Dense data is intentional.",
    "https://example.com/feed":      "Two-panel layout. Left: shared feed. Right: admin-only broadcast. Inputs are separate by design."
  }
}
```

URL matching is prefix-based — `"https://example.com/operatives/"` matches all operative detail pages.

### Workflow

1. `uighost capture <url>` — crawls the site, auto-generates a draft `context.json` with page titles and heading structure as hints if the file doesn't exist
2. User reviews and fills in the TODOs in `context.json`
3. `uighost evaluate` — injects context per-page into the Claude prompt

The prompt template includes a note per page: `> **Context**: [user's annotation]`, and the global note at the top of the site overview section. The AI uses this to skip intentional patterns and focus on genuine usability problems.

---

## Week 1 — Capture pipeline MVP

**Goal:** `uighost capture https://example.com` produces a folder with screenshots, element data, and a ready-to-paste prompt. You copy the prompt into claude.ai with the screenshots and get UX feedback.

### Day 1–2: Crawler + capture

- [ ] Init repo: TypeScript, Playwright, commander
- [ ] `web-crawler.ts`:
  - Load URL in Playwright
  - `page.accessibility.snapshot()` → extract element tree
  - Collect all interactive elements: tag, role, text content, bounding box, visible/hidden
  - Full-page screenshot as PNG
  - Follow same-origin links, BFS, configurable depth (default: 2)
  - Respect robots.txt, skip obvious non-pages (images, PDFs, etc.)
- [ ] `package.ts`: save everything to `.uighost/captures/<timestamp>/`
  - `manifest.json`: URLs crawled, element counts, timings
  - Per-page: screenshot PNG + JSON with element data
- [ ] CLI: `uighost capture https://example.com --depth 2 --max-pages 10`
- [ ] Test against your own projects (PORTAL, Stonewalker) — free, no auth walls

**Deliverable:** Capture folder with screenshots and structured element data.

### Day 3–4: Heuristic checks (free, no LLM)

- [ ] `heuristics.ts`: programmatic checks against the captured element data
  - Images missing `alt` attributes
  - Form inputs without associated labels
  - Links with generic text ("click here", "read more", "learn more")
  - Missing `<html lang="...">`
  - Missing viewport meta tag
  - Heading hierarchy violations (h1 → h3 skip)
  - Duplicate IDs
  - Buttons without accessible names
  - Tab order issues (positive tabindex)
  - Color contrast (extract computed styles from Playwright, check WCAG AA)
- [ ] Save results to `heuristics.json` in the capture folder
- [ ] These findings are free, instant, and don't need Claude at all

**Deliverable:** Capture now includes concrete, checkable accessibility findings.

### Day 5–6: Prompt builder

- [ ] `builder.ts`: take a capture folder and assemble a Claude-ready prompt
- [ ] **Full audit prompt** (`evaluate-all.md`):
  ```markdown
  # UX Audit Request

  I've captured screenshots and element data from [URL].
  Please review each page and identify UX issues.

  ## What to evaluate:
  - Visual hierarchy and layout clarity
  - Text readability and contrast
  - Interactive element discoverability
  - Navigation coherence
  - Consistency across pages
  - Mobile readiness (viewport handling)
  - Accessibility (beyond the heuristic checks below)

  ## Heuristic findings (already detected):
  [auto-inserted from heuristics.json]

  ## Pages captured:

  ### Page 1: [URL]
  **Screenshot:** [reference to page-001.png]
  **Interactive elements:** [summarized from page-001.json]
  **Element count:** X buttons, Y links, Z form fields

  ### Page 2: [URL]
  ...

  ## Response format:
  For each issue found, provide:
  - severity: critical / major / minor / suggestion
  - category: navigation / accessibility / visual / content / interaction
  - page: which page
  - element: which element (if applicable)
  - description: what's wrong
  - suggestion: how to fix it
  ```
- [ ] **Per-page prompts** (`evaluate-page-NNN.md`): same but for a single page — useful when the full audit is too large for one context window
- [ ] Prompt references screenshots by filename so you can drag-and-drop them into claude.ai alongside the prompt text
- [ ] Smart truncation: if a page has 200+ elements, summarize rather than list all

**Deliverable:** Capture folder now includes ready-to-use prompts.

### Day 7: Report parser + HTML output

- [ ] `parser.ts`: parse Claude's response (pasted back or piped) into structured findings
  - Expect the structured format from the prompt
  - Handle variations (Claude won't always be perfectly consistent)
  - Merge with heuristic findings, deduplicate
- [ ] `report.ts`: generate HTML report from findings
  - Summary: pages audited, issue counts by severity
  - Per-page: screenshot + findings list with severity badges
  - Heuristic vs. LLM-detected distinction
  - WCAG reference links
- [ ] Two workflows:
  ```bash
  # Workflow A: manual (claude.ai)
  uighost capture https://example.com
  # → manually paste prompt + screenshots into claude.ai
  # → copy Claude's response
  uighost report --from-clipboard
  # → generates report.html

  # Workflow B: Claude Code pipe
  uighost capture https://example.com
  uighost evaluate --pipe
  # → pipes prompt into Claude Code, captures response, generates report
  ```

**Deliverable:** End-to-end MVP. Capture → prompt → evaluate → report. Zero API cost.

---

## Week 2 — Agent mode + personas

**Goal:** The agent explores autonomously. Still local-first — the agent loop runs through Claude Code or optional API.

### Day 1–2: Agent loop via Claude Code

- [ ] `explore.md` prompt template:
  ```markdown
  You're a QA tester exploring this application.

  Current page: [screenshot + elements]
  Pages visited: [list with summaries]
  Issues found so far: [count by severity]
  Actions taken: [last 10 actions]
  Budget remaining: [X pages, Y actions]

  What should you do next?
  Respond with exactly one action:
  - CLICK [element description]
  - TYPE [element description] [text]
  - NAVIGATE [url]
  - SCROLL [direction]
  - STOP [reason]
  ```
- [ ] Agent loop in pipe mode:
  1. Capture current page
  2. Build explore prompt
  3. Send to Claude Code / API
  4. Parse action from response
  5. Execute action in Playwright
  6. Repeat until STOP or budget exhausted
- [ ] Session memory: `memory.ts` tracks visited pages, actions, findings
- [ ] Budget controls: `--max-pages 20 --max-actions 50 --timeout 5m`

**Deliverable:** `uighost explore https://example.com` — autonomous crawl + evaluation.

### Day 3–4: Personas

- [ ] Persona prompt templates in `prompt-templates/personas/`:
  - **First-time visitor:** "You've never seen this site. Can you figure out what it does and how to use it within 60 seconds?"
  - **Task completer:** "Your goal is: [user-specified]. Try to complete it, noting every friction point."
  - **Accessibility tester:** "Navigate using only keyboard. Evaluate screen reader compatibility. Check ARIA usage."
  - **Impatient user:** "You have 30 seconds. Flag anything that wastes time: slow loads, unnecessary steps, confusing modals, walls of text."
- [ ] CLI: `uighost explore https://example.com --persona accessibility`
- [ ] Persona affects both exploration strategy and evaluation criteria

**Deliverable:** Same site, different perspectives in the report.

### Day 5: Goal-directed flow testing

- [ ] `uighost flow https://example.com --goal "sign up for a free account"`
- [ ] Agent tries to complete the goal, recording each step
- [ ] Report includes: step-by-step flow with screenshots, where it got stuck, friction score
- [ ] If the agent can't complete the goal, that's a finding in itself

**Deliverable:** Task completion testing — the feature QA leads care about most.

### Day 6–7: Comparison mode + polish

- [ ] `uighost compare capture-A/ capture-B/` — diff two captures
- [ ] Use cases: before/after redesign, you vs. competitor
- [ ] Improve prompt templates based on real usage from week 1
- [ ] Edge cases: SPAs (wait for hydration), cookie banners (dismiss or flag), auth walls (stop and note)

---

## Week 3 — Game/native UI via pure vision

**Goal:** Same agent, but for non-web UIs. No DOM, no a11y tree — just screenshots.

### Day 1–2: Screen crawler

- [ ] `screen-crawler.ts`: generic screenshot-based crawler
  - Capture active window screenshot
  - Send to Claude: "Identify all UI elements: buttons, text fields, menus, labels. For each, give approximate bounding box as {x, y, width, height} in pixels"
  - Parse response into same `Element[]` format as web crawler
  - Click at coordinates using `nut.js` (cross-platform input simulation)
- [ ] Abstract crawler interface:
  ```ts
  interface Crawler {
    capture(): Promise<PageState>
    click(x: number, y: number): Promise<void>
    type(text: string): Promise<void>
    scroll(direction: 'up' | 'down'): Promise<void>
  }
  ```
- [ ] Web crawler and screen crawler both implement this interface
- [ ] Agent brain doesn't care which crawler it's using

**Deliverable:** `uighost capture --window "My Game"` works like the web version.

### Day 3–4: Godot game UI testing

- [ ] Pick a Godot demo project with menus (settings, inventory, dialog)
- [ ] Run screen crawler against it
- [ ] Agent navigates: main menu → settings → adjust options → back → start game → in-game UI
- [ ] Evaluation focus for games:
  - Button sizing (touch-friendly? readable?)
  - Contrast against dynamic backgrounds
  - Menu depth (too many clicks to reach settings?)
  - Consistency (do all menus use the same style?)
  - Controller/keyboard navigation support
- [ ] Record a GIF of the agent navigating — this is your viral demo

### Day 5–7: Polish + desktop app testing

- [ ] Test against an Electron app (VS Code, Discord)
- [ ] Improve coordinate accuracy: retry if click doesn't change state
- [ ] Wait for stable frames (skip transition animations)
- [ ] CLI unified: `uighost capture <url>` (web) vs `uighost capture --window <title>` (native)

---

## Week 4 — Ship it

### Day 1–2: Package + docs

- [ ] npm publish: `npx uighost capture https://example.com`
- [ ] README: problem, install, usage, example reports, architecture diagram
- [ ] Sample captures and reports in repo
- [ ] GitHub Actions: lint, test, build

### Day 3–4: Demo content

- [ ] 2-min demo video: URL → capture → paste into Claude → report
- [ ] Game UI demo: agent navigating Godot menus
- [ ] Blog post: "I built a free AI UX auditor that works with your existing Claude subscription"
- [ ] Frame the local-first angle: "no API key, no billing, no data leaving your machine"

### Day 5–6: Landing page + managed service

- [ ] Landing page (use your Vite + React stack, deploy to GitHub Pages)
- [ ] Three tiers:
  - **Free / open source:** run locally with your own Claude (claude.ai or Claude Code)
  - **API mode:** BYOK for automation / CI integration
  - **Managed service:** submit URL, get report in 24h — $29–49 per audit
- [ ] For managed service: simple form (URL + email + Stripe checkout)
- [ ] You run the tool yourself and email the report — zero infrastructure needed

### Day 7: Launch

- [ ] Hacker News (lead with the game UI angle — it's novel)
- [ ] r/gamedev, r/indiedev (game UI testing for teams without UX designers)
- [ ] r/webdev, r/QualityAssurance
- [ ] dev.to, LinkedIn, X
- [ ] QA community Slacks and Discord servers

---

## CLI command summary

```bash
# Auth (one-time, only needed for protected sites)
uighost login https://app.example.com            # opens browser, you log in, session saved to .uighost/auth/<domain>.json
                                                  # future captures for that domain load it automatically

# Capture (always local, always free)
uighost capture https://example.com              # crawl + screenshot at desktop + mobile viewports
uighost capture https://example.com --depth 3    # deeper crawl
uighost capture https://example.com --viewport 1440  # custom desktop width (default: 1280)
uighost capture --window "My Godot Game"         # native/game UI (week 3)

# Full local workflow (no API key needed)
uighost login https://app.example.com            # (optional) save session for auth-protected sites
uighost capture https://app.example.com          # crawl at desktop (1280px) + mobile (390px) viewports
                                                  # if .uighost/context.json doesn't exist, generates a draft
                                                  # with page titles and headings as hints

# Before evaluating — review and edit the context file:
#   .uighost/context.json
# Add notes about each page's purpose and any design decisions the AI should treat as intentional.
# This context is injected per-page into the Claude prompt.

uighost evaluate                                  # runs heuristics, injects context, builds prompt
                                                  # lists desktop + mobile screenshots to attach per page
                                                  # paste into claude.ai with all screenshots
                                                  # save Claude's response as a .md file (large responses
                                                  # don't fit clipboard reliably), then:
uighost report --from-file claude-response.md    # generates report.html (preferred)
uighost report --from-clipboard                  # alternative for shorter responses

# Evaluate (choose your runner)
uighost evaluate                                  # show prompt, you paste into claude.ai (Mode 1)
uighost evaluate --page 1                        # per-page prompt for large sites
uighost evaluate --pipe                           # pipe into Claude Code (Mode 2, week 2)
uighost evaluate --api                            # call Claude API (BYOK, Mode 3, week 2)
uighost evaluate --persona accessibility          # persona-specific evaluation (week 2)

# Agent mode (requires pipe or API)
uighost explore https://example.com               # autonomous exploration
uighost flow https://example.com --goal "sign up" # goal-directed testing

# Report
uighost report                                    # generate HTML from latest evaluation
uighost report --from-clipboard                   # parse Claude's response from clipboard
uighost compare capture-A/ capture-B/             # diff two captures
```

---

## Why local-first wins

| | Local (claude.ai) | Pipe (Claude Code) | API (BYOK) |
|---|---|---|---|
| Cost | Free (Max sub) | Free (Max sub) | ~$0.50–1/audit |
| Setup | Zero | Claude Code installed | API key |
| Automation | Manual | Semi-auto | Full auto |
| CI/CD | No | Possible | Yes |
| User friction | Lowest | Low | Medium |

Most users will start with local mode. Power users graduate to pipe. CI/CD users need API. Cover all three and you remove every objection.

---

## Project name

**UIGhost** — an invisible tester haunting your UI.

Alternatives: Haunt, Specter, LensQA, PixelProbe, GlitchWalk, Phantom QA.
