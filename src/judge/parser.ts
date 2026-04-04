import type { HeuristicFinding } from './heuristics.js';

export interface Finding {
  title: string;
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  category: string;
  page: string;
  element?: string;
  description: string;
  suggestion: string;
  source: 'llm' | 'heuristic';
}

const VALID_SEVERITIES = new Set<string>(['critical', 'major', 'minor', 'suggestion']);

function normalizeSeverity(raw: string): Finding['severity'] {
  const lower = raw.trim().toLowerCase().split(/[\s|]/)[0];
  return VALID_SEVERITIES.has(lower) ? (lower as Finding['severity']) : 'minor';
}

/**
 * Extract a named field from a markdown issue block.
 * Handles: "- **Field**: value", "**Field**: value", "Field: value"
 */
function extractField(block: string, field: string): string | undefined {
  const patterns = [
    new RegExp(`\\*\\*${field}\\*\\*\\s*:([^\\n]+)`, 'i'),
    new RegExp(`^[-*]\\s+${field}\\s*:([^\\n]+)`, 'im'),
    new RegExp(`^${field}\\s*:([^\\n]+)`, 'im'),
  ];
  for (const re of patterns) {
    const m = re.exec(block);
    if (m) return m[1].trim();
  }
  return undefined;
}

/**
 * Parse Claude's markdown evaluation response into structured Finding[].
 * Forgiving: handles missing fields, extra text, formatting variations.
 */
export function parseEvaluation(response: string): Finding[] {
  const findings: Finding[] = [];

  // Split on ## Issue: or ### Issue: headers
  const parts = response.split(/^#{2,3}\s+Issue:\s*/im);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const firstNewline = part.indexOf('\n');
    const title = (firstNewline > -1 ? part.slice(0, firstNewline) : part).trim();
    const block = firstNewline > -1 ? part.slice(firstNewline) : '';

    const page = extractField(block, 'Page') ?? '';
    const description = extractField(block, 'Description') ?? '';

    // Skip blocks that have no meaningful content
    if (!description && !page) continue;

    const elementRaw = extractField(block, 'Element');
    const element =
      elementRaw && !['n/a', 'none', '-'].includes(elementRaw.toLowerCase())
        ? elementRaw
        : undefined;

    findings.push({
      title: title || `Finding ${i}`,
      severity: normalizeSeverity(extractField(block, 'Severity') ?? 'minor'),
      category: extractField(block, 'Category') ?? 'general',
      page,
      element,
      description,
      suggestion: extractField(block, 'Suggestion') ?? '',
      source: 'llm',
    });
  }

  return findings;
}

/** Convert a HeuristicFinding to the unified Finding format. */
export function heuristicToFinding(h: HeuristicFinding): Finding {
  return {
    title: h.rule,
    severity: h.severity,
    category: h.category,
    page: h.page,
    element: h.element,
    description: h.description,
    suggestion: `Fix the ${h.rule} violation on this page.`,
    source: 'heuristic',
  };
}
