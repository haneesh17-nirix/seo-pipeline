import * as fs from "fs";
import * as path from "path";
import { GscRow, getHistory, getPositionDelta } from "../tracking/gsc";
import type { BrandConfig } from "../brands/loader";

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

export function generateMarkdownReport(results: GscRow[], brand?: BrandConfig): string {
  const date = new Date().toISOString().split("T")[0];
  const title = brand ? `${brand.name} SEO Report` : "SEO Report";
  const groups = brand?.keywordGroups ?? [];

  const lines = [
    `# ${title} — ${date}`,
    ``,
    `> Source: Google Search Console${brand ? ` | Country: ${brand.targetCountry.toUpperCase()}` : ""}`,
    ``,
  ];

  if (groups.length) {
    for (const group of groups) {
      lines.push(`## ${group.group}`);
      lines.push(`| Keyword | Position | Δ | Clicks | Impressions | CTR |`);
      lines.push(`|---------|----------|---|--------|-------------|-----|`);
      for (const kw of group.keywords) {
        const r = results.find((x) => x.keyword.toLowerCase() === kw.toLowerCase());
        if (!r) continue;
        const delta = getPositionDelta(kw, brand?.slug);
        lines.push(
          `| ${kw} | ${posIcon(r.position)} | ${deltaStr(delta)} | ${r.clicks} | ${r.impressions} | ${r.ctr}% |`
        );
      }
      lines.push("");
    }
  } else {
    lines.push(`| Keyword | Position | Clicks | Impressions | CTR |`);
    lines.push(`|---------|----------|--------|-------------|-----|`);
    for (const r of results) {
      lines.push(`| ${r.keyword} | ${posIcon(r.position)} | ${r.clicks} | ${r.impressions} | ${r.ctr}% |`);
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

export function saveReport(results: GscRow[], reportDir?: string, brandName?: string): string {
  const date = new Date().toISOString().split("T")[0];
  const dir = reportDir ?? path.join(process.cwd(), "reports");
  fs.mkdirSync(dir, { recursive: true });

  const mdPath = path.join(dir, `report-${date}.md`);
  const brand = brandName ? ({ name: brandName } as Partial<BrandConfig>) : undefined;
  fs.writeFileSync(mdPath, generateMarkdownReport(results, brand as BrandConfig | undefined), "utf8");

  const jsonPath = path.join(dir, `data-${date}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");

  return mdPath;
}

export function printConsoleReport(results: GscRow[], brand?: BrandConfig): void {
  const title = brand ? `${brand.name} — Keyword Performance` : "SEO Keyword Performance";
  console.log(`\n┌──────────────────────────────────────────────────────────────┐`);
  console.log(`│  ${title.padEnd(60)}│`);
  console.log(`└──────────────────────────────────────────────────────────────┘\n`);

  const groups = brand?.keywordGroups ?? [];

  if (groups.length) {
    for (const group of groups) {
      console.log(`  ◈ ${group.group}`);
      for (const kw of group.keywords) {
        const r = results.find((x) => x.keyword.toLowerCase() === kw.toLowerCase());
        if (!r) continue;
        const delta = getPositionDelta(kw, brand?.slug);
        const pos = r.position > 0 ? `#${r.position}` : "no data";
        const change = delta !== null ? ` (${deltaStr(delta)})` : "";
        console.log(`    ${kw.padEnd(42)} ${pos.padEnd(8)}${change.padEnd(8)} ${r.clicks} clicks  ${r.impressions} impr`);
      }
      console.log();
    }
  } else {
    for (const r of results) {
      const pos = r.position > 0 ? `#${r.position}` : "no data";
      console.log(`  ${r.keyword.padEnd(42)} ${pos.padEnd(8)} ${r.clicks} clicks  ${r.impressions} impr`);
    }
    console.log();
  }
}
