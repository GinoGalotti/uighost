import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readManifest } from '../capture/manifest.js';
import type { Finding } from '../judge/parser.js';

// ─── Severity / source metadata ──────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  critical:   '#dc2626',
  major:      '#ea580c',
  minor:      '#d97706',
  suggestion: '#2563eb',
};

const SEVERITY_BG: Record<string, string> = {
  critical:   '#fef2f2',
  major:      '#fff7ed',
  minor:      '#fffbeb',
  suggestion: '#eff6ff',
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(text: string, color: string, bg: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${color};background:${bg};border:1px solid ${color}40;">${esc(text)}</span>`;
}

function severityBadge(s: string): string {
  return badge(s, SEVERITY_COLOR[s] ?? '#6b7280', SEVERITY_BG[s] ?? '#f9fafb');
}

function sourceBadge(source: 'llm' | 'heuristic'): string {
  return source === 'heuristic'
    ? badge('auto-detected', '#065f46', '#ecfdf5')
    : badge('AI review', '#4c1d95', '#f5f3ff');
}

async function screenshotDataUrl(imgPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(imgPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ─── HTML document ────────────────────────────────────────────────────────────

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return `<p style="color:#6b7280;font-style:italic;padding:12px 0;">No issues found for this page.</p>`;
  }

  return findings
    .map(f => {
      const borderColor = SEVERITY_COLOR[f.severity] ?? '#e5e7eb';
      return `
      <div style="border-left:4px solid ${borderColor};padding:12px 16px;margin-bottom:12px;background:#fff;border-radius:0 6px 6px 0;box-shadow:0 1px 2px #0001;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
          ${severityBadge(f.severity)}
          ${badge(esc(f.category), '#374151', '#f3f4f6')}
          ${sourceBadge(f.source)}
          <strong style="font-size:14px;">${esc(f.title)}</strong>
        </div>
        ${f.element ? `<div style="font-size:12px;color:#6b7280;font-family:monospace;margin-bottom:4px;">Element: ${esc(f.element)}</div>` : ''}
        <p style="margin-bottom:6px;font-size:14px;">${esc(f.description)}</p>
        ${f.suggestion ? `<p style="font-size:13px;color:#059669;"><strong>Fix:</strong> ${esc(f.suggestion)}</p>` : ''}
      </div>`;
    })
    .join('');
}

function summaryCounts(findings: Finding[]): string {
  const counts: Record<string, number> = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  return Object.entries(counts)
    .map(([sev, count]) => {
      const color = SEVERITY_COLOR[sev] ?? '#6b7280';
      const bg = SEVERITY_BG[sev] ?? '#f9fafb';
      return `
      <div style="text-align:center;padding:16px 24px;background:${bg};border:1px solid ${color}30;border-radius:8px;min-width:100px;">
        <div style="font-size:32px;font-weight:800;color:${color};">${count}</div>
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${color};">${sev}</div>
      </div>`;
    })
    .join('');
}

async function renderPageSection(
  index: number,
  url: string,
  screenshotFile: string,
  screenshotDir: string,
  findings: Finding[]
): Promise<string> {
  const imgSrc = await screenshotDataUrl(path.join(screenshotDir, screenshotFile));
  const imgTag = imgSrc
    ? `<img src="${imgSrc}" alt="Screenshot of ${esc(url)}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:16px;" />`
    : `<div style="padding:32px;background:#f3f4f6;border-radius:6px;text-align:center;color:#9ca3af;margin-bottom:16px;">Screenshot not available</div>`;

  return `
  <section style="margin-bottom:40px;">
    <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;color:#111827;">Page ${index}</h2>
    <a href="${esc(url)}" style="font-size:13px;color:#6b7280;word-break:break-all;">${esc(url)}</a>
    <div style="margin-top:16px;">${imgTag}</div>
    <h3 style="font-size:15px;font-weight:600;margin-bottom:10px;color:#374151;">
      ${findings.length} issue${findings.length !== 1 ? 's' : ''}
    </h3>
    ${renderFindings(findings)}
  </section>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateReport(
  captureDir: string,
  findings: Finding[]
): Promise<string> {
  const manifest = await readManifest(captureDir);
  const screenshotDir = path.join(captureDir, 'pages');
  const reportDir = path.join(captureDir, 'report');
  await fs.mkdir(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, 'report.html');
  const generatedAt = new Date().toLocaleString();
  const total = findings.length;
  const sourceBreakdown = `${findings.filter(f => f.source === 'heuristic').length} auto-detected, ${findings.filter(f => f.source === 'llm').length} from AI review`;

  // Per-page findings
  const pageSections = await Promise.all(
    manifest.pages.map(p =>
      renderPageSection(
        p.index,
        p.url,
        p.screenshotFile,
        screenshotDir,
        findings.filter(f => f.page === p.url || findings.indexOf(f) < 0)
          // findings without a matched page go on the first page
          .concat(
            p.index === 1
              ? findings.filter(f => !manifest.pages.some(mp => mp.url === f.page))
              : []
          )
      )
    )
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UIGhost Report — ${esc(manifest.entryUrl)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #111827; line-height: 1.5; }
    a { color: inherit; }
  </style>
</head>
<body>
  <header style="background:#111827;color:#fff;padding:24px 32px;">
    <div style="max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;">UIGhost</div>
        <div style="font-size:13px;color:#9ca3af;">UX Audit Report</div>
      </div>
      <div style="text-align:right;font-size:13px;color:#9ca3af;">
        <div>${esc(manifest.entryUrl)}</div>
        <div>${manifest.pageCount} page${manifest.pageCount !== 1 ? 's' : ''} &middot; generated ${generatedAt}</div>
      </div>
    </div>
  </header>

  <main style="max-width:960px;margin:0 auto;padding:32px 24px;">

    <section style="margin-bottom:40px;">
      <h1 style="font-size:22px;font-weight:700;margin-bottom:4px;">Summary</h1>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px;">${total} total issue${total !== 1 ? 's' : ''} &middot; ${sourceBreakdown}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${summaryCounts(findings)}
      </div>
    </section>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:40px;">

    ${pageSections.join('\n')}

  </main>

  <footer style="text-align:center;padding:24px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
    Generated by <strong>UIGhost</strong> &middot; ${generatedAt}
  </footer>
</body>
</html>`;

  await fs.writeFile(reportPath, html, 'utf-8');
  return reportPath;
}
