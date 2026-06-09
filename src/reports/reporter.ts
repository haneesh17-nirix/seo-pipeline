import * as fs from "fs";
import * as path from "path";
import { GscRow, getHistory, getPositionDelta } from "../tracking/gsc";
import { KEYWORD_GROUPS, ALL_KEYWORDS } from "../keywords/config";

function posIcon(pos: number): string {
  if (pos === 0) return "—";
  if (pos <= 3) return `#${pos} 🟢`;
  if (pos <= 10) return `#${pos} 🟡`;
  if (pos <= 30) return `#${pos} 🟠`;
  return `#${pos} 🔴`;
}

function deltaStr(delta: number | null): string {
  if (delta === null) return "new";
  if (delta === 0) return "=";
  if (delta < 0) return `▲${Math.abs(delta)}`;
  return `▼${delta}`;
}

export function generateMarkdownReport(results: GscRow[]): string {
  const date = new Date().toISOString().split("T")[0];
  const lines = [
    `# SEO Report — ${date}`,
    ``,
    `> Source: Google Search Console`,
    ``,
  ];

  for (const group of KEYWORD_GROUPS) {
    lines.push(`## ${group.group}`);
    lines.push(`| Keyword | Position | Δ | Clicks | Impressions | CTR |`);
    lines.push(`|---------|----------|---|--------|-------------|-----|`);

    for (const kw of group.keywords) {
      const r = results.find((x) => x.keyword.toLowerCase() === kw.toLowerCase());
      if (!r) continue;
      const delta = getPositionDelta(kw);
      lines.push(
        `| ${kw} | ${posIcon(r.position)} | ${deltaStr(delta)} | ${r.clicks} | ${r.impressions} | ${r.ctr}% |`
      );
    }
    lines.push("");
  }

  const ranked = results.filter((r) => r.position > 0);
  const top10 = ranked.filter((r) => r.position <= 10).length;
  const totalClicks = ranked.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = ranked.reduce((s, r) => s + r.impressions, 0);

  lines.push(`## Summary`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Keywords tracked | ${results.length} |`);
  lines.push(`| Keywords with GSC data | ${ranked.length} |`);
  lines.push(`| Keywords in top 10 | ${top10} |`);
  lines.push(`| Total clicks (7 days) | ${totalClicks} |`);
  lines.push(`| Total impressions (7 days) | ${totalImpressions} |`);

  return lines.join("\n");
}

export function saveReport(results: GscRow[]): string {
  const date = new Date().toISOString().split("T")[0];
  const dir = path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });

  const mdPath = path.join(dir, `report-${date}.md`);
  fs.writeFileSync(mdPath, generateMarkdownReport(results), "utf8");

  const jsonPath = path.join(dir, `data-${date}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");

  return mdPath;
}

export function printConsoleReport(results: GscRow[]): void {
  console.log("\n┌──────────────────────────────────────────────────────────────┐");
  console.log("│            SEO Keyword Performance (Google Search Console)   │");
  console.log("└──────────────────────────────────────────────────────────────┘\n");

  for (const group of KEYWORD_GROUPS) {
    console.log(`  ◈ ${group.group}`);
    for (const kw of group.keywords) {
      const r = results.find((x) => x.keyword.toLowerCase() === kw.toLowerCase());
      if (!r) continue;
      const delta = getPositionDelta(kw);
      const pos = r.position > 0 ? `#${r.position}` : "no data";
      const change = delta !== null ? ` (${deltaStr(delta)})` : "";
      const clicks = `${r.clicks} clicks`;
      const imp = `${r.impressions} impr`;
      console.log(`    ${kw.padEnd(42)} ${pos.padEnd(8)}${change.padEnd(8)} ${clicks.padEnd(12)} ${imp}`);
    }
    console.log();
  }
}
