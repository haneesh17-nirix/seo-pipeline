# Architecture

> Auto-maintained. The pipeline appends a note here whenever structural files change.

## Overview

**seo-pipeline** is a free multi-brand SEO automation toolkit built on:
- **Ollama** (local LLM on Azure VM UAE North) for AI content generation — zero API cost
- **Google Search Console API** (free) for real keyword ranking data
- **Node.js / TypeScript** CLI with full `--brand <slug>` isolation

**Active brands:** habun-rak, habun-sharjah (restaurant, UAE) · nyrix, bluemetal-pro (SaaS, India)

## Components

| Module | Path | Responsibility |
|--------|------|----------------|
| Brand loader | `src/brands/loader.ts` | `BrandConfig` interface, load/list/create per brand |
| Keywords config | `src/keywords/config.ts` | Legacy single-brand defaults (still used as fallback) |
| Content generator | `src/content/generator.ts` | Brand-aware Ollama prompts: blog, landing, meta, FAQ |
| GSC tracker | `src/tracking/gsc.ts` | GSC API + per-brand rank history at `brands/<slug>/logs/` |
| Sitemap generator | `src/seo/sitemap.ts` | `sitemap.xml` from brand's pages + keyword groups |
| Schema generator | `src/seo/schema.ts` | JSON-LD: Restaurant / SoftwareApplication from brand type |
| Reporter | `src/reports/reporter.ts` | Brand-headed console + Markdown rank reports |
| CLI | `src/cli.ts` | All commands — `--brand` flag on everything |

## Infrastructure

- Azure VM (`infra/main.bicep`): Standard_D2s_v3, Ubuntu 22.04, UAE North (`uaenorth`)
- VM IP: `20.216.5.173` — Ollama bound to 127.0.0.1, accessed via SSH tunnel
- SSH key: `~/.ssh/id_rsa_habun_seo`
- GitHub Actions (`.github/workflows/weekly-track.yml`): weekly `seo track-all`

## Data Flow

```
CLI --brand <slug>
  │
  ├─► Ollama (Azure VM UAE North via SSH tunnel)
  │     └─► brands/<slug>/output/  (blog posts, meta tags, landing pages, FAQs)
  │
  ├─► Google Search Console API (per-brand credentials)
  │     └─► brands/<slug>/logs/rank-history.json  (90-day rolling)
  │         brands/<slug>/reports/report-YYYY-MM-DD.md
  │
  ├─► sitemap.xml → brands/<slug>/output/sitemap.xml
  └─► JSON-LD    → brands/<slug>/output/schema/*.jsonld
```

## Change History

### 2026-06-10 — initial architecture
- Bootstrapped content generation (Ollama), GSC tracking, sitemap, schema modules
- Azure Bicep infra for Ollama VM
- GitHub Actions for weekly automated rank tracking

### 2026-06-09 — vdb8c7b4 — docs: add CHANGELOG, architecture/design/API/change-log docs, test and log dirs, fix gitignore

- docs: add CHANGELOG, architecture/design/API/change-log docs, test and log dirs, fix gitignore (files: src/reports/reporter.ts)

### 2026-06-09 — vdb8c7b4 — docs: add CHANGELOG, architecture/design/API/change-log docs, test and log dirs, fix gitignore

- docs: add CHANGELOG, architecture/design/API/change-log docs, test and log dirs, fix gitignore (files: src/reports/reporter.ts)

### 2026-06-09 — vdb8c7b4 — docs: add CHANGELOG, architecture/design/API/change-log docs, test and log dirs, fix gitignore

- docs: add CHANGELOG, architecture/design/API/change-log docs, test and log dirs, fix gitignore (files: src/reports/reporter.ts)

### 2026-06-11 — v6864aee — chore: sync local automation output

- chore: sync local automation output (files: package.json)

### 2026-06-11 — v6864aee — chore: sync local automation output

- chore: sync local automation output (files: package.json)

### 2026-06-11 — v515b7a7 — feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG

- feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG (files: src/keywords/habun.ts, infra/main.bicep)

### 2026-06-11 — v515b7a7 — feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG

- feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG (files: src/keywords/habun.ts, infra/main.bicep)

### 2026-06-11 — vf4aa4b5 — feat: multi-brand SEO pipeline with per-brand isolation

- feat: multi-brand SEO pipeline with per-brand isolation (files: brands/bluemetal-pro/brand.json, brands/habun-rak/brand.json, brands/habun-sharjah/brand.json, brands/nyrix/brand.json, src/brands/loader.ts)

### 2026-06-11 — vf4aa4b5 — feat: multi-brand SEO pipeline with per-brand isolation

- feat: multi-brand SEO pipeline with per-brand isolation (files: brands/bluemetal-pro/brand.json, brands/habun-rak/brand.json, brands/habun-sharjah/brand.json, brands/nyrix/brand.json, src/brands/loader.ts)
