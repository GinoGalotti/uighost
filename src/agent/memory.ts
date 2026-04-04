export interface ActionRecord {
  type: string;
  target?: string;
  value?: string;
  timestamp: number;
}

export interface SessionSummary {
  pagesVisited: number;
  pagesRemaining: number;
  actionsUsed: number;
  actionsRemaining: number;
  findingsCount: number;
  elapsedMs: number;
  visitedUrls: string[];
  recentActions: ActionRecord[];
  recentFindings: string[];
}

export interface SessionMemoryOptions {
  maxPages: number;
  maxActions: number;
  timeoutMs?: number;
}

export interface PersistedState {
  startUrl: string;
  maxPages: number;
  maxActions: number;
  timeoutMs: number;
  startedAt: number;
  visitedUrls: string[];
  actions: ActionRecord[];
  findings: string[];
  consecutiveEmptyPages: number;
  nextStep: number;
}

export class SessionMemory {
  readonly maxPages: number;
  readonly maxActions: number;
  readonly timeoutMs: number;

  private _visitedUrls: Set<string> = new Set();
  private _actions: ActionRecord[] = [];
  private _findings: string[] = [];
  private _startedAt: number = Date.now();
  private _consecutiveEmptyPages: number = 0;
  private _findingsAtLastPageStart: number = 0;

  constructor(options: SessionMemoryOptions) {
    this.maxPages = options.maxPages;
    this.maxActions = options.maxActions;
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  }

  /** Call when navigating to a new page. Snaps the findings count for later comparison. */
  addVisit(url: string): void {
    this._findingsAtLastPageStart = this._findings.length;
    this._visitedUrls.add(url);
  }

  /** Call after finishing exploration of a page to update the consecutive-empty counter. */
  markPageComplete(): void {
    if (this._findings.length > this._findingsAtLastPageStart) {
      this._consecutiveEmptyPages = 0;
    } else {
      this._consecutiveEmptyPages++;
    }
  }

  addAction(action: Omit<ActionRecord, 'timestamp'>): void {
    this._actions.push({ ...action, timestamp: Date.now() });
  }

  /** Add a finding (plain-English description). */
  addFinding(description: string): void {
    this._findings.push(description);
  }

  hasVisited(url: string): boolean {
    return this._visitedUrls.has(url);
  }

  shouldStop(): { stop: boolean; reason: string } {
    if (this._visitedUrls.size >= this.maxPages) {
      return { stop: true, reason: `max pages reached (${this.maxPages})` };
    }
    if (this._actions.length >= this.maxActions) {
      return { stop: true, reason: `max actions reached (${this.maxActions})` };
    }
    if (Date.now() - this._startedAt > this.timeoutMs) {
      return { stop: true, reason: `timeout (${Math.round(this.timeoutMs / 1000)}s)` };
    }
    if (this._consecutiveEmptyPages >= 3) {
      return { stop: true, reason: '3 consecutive pages with no new findings' };
    }
    return { stop: false, reason: '' };
  }

  getSummary(): SessionSummary {
    return {
      pagesVisited: this._visitedUrls.size,
      pagesRemaining: Math.max(0, this.maxPages - this._visitedUrls.size),
      actionsUsed: this._actions.length,
      actionsRemaining: Math.max(0, this.maxActions - this._actions.length),
      findingsCount: this._findings.length,
      elapsedMs: Date.now() - this._startedAt,
      visitedUrls: Array.from(this._visitedUrls),
      recentActions: this._actions.slice(-5),
      recentFindings: this._findings.slice(-5),
    };
  }

  persist(startUrl: string, nextStep: number): PersistedState {
    return {
      startUrl,
      maxPages: this.maxPages,
      maxActions: this.maxActions,
      timeoutMs: this.timeoutMs,
      startedAt: this._startedAt,
      visitedUrls: Array.from(this._visitedUrls),
      actions: [...this._actions],
      findings: [...this._findings],
      consecutiveEmptyPages: this._consecutiveEmptyPages,
      nextStep,
    };
  }

  static restore(state: PersistedState): SessionMemory {
    const m = new SessionMemory({
      maxPages: state.maxPages,
      maxActions: state.maxActions,
      timeoutMs: state.timeoutMs,
    });
    m._startedAt = state.startedAt;
    m._visitedUrls = new Set(state.visitedUrls);
    m._actions = state.actions;
    m._findings = state.findings;
    m._consecutiveEmptyPages = state.consecutiveEmptyPages;
    m._findingsAtLastPageStart = state.findings.length;
    return m;
  }
}
