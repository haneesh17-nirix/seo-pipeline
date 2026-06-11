# Architecture

> Auto-maintained. The pipeline appends a note here whenever structural files change.

## Overview

**seo-pipeline** is a free SEO automation toolkit for Nyrix / BlueMetal Pro built on:
- **Ollama** (local LLM on Azure VM) for AI content generation — zero API cost
- **Google Search Console API** (free) for real keyword ranking data
- **Node.js / TypeScript** CLI for all operations

## Components

| Module | Path | Responsibility |
|--------|------|----------------|
| Keywords config | `src/keywords/config.ts` | All target keywords, brand names, page mappings |
| Content generator | `src/content/generator.ts` | Calls Ollama to write blog posts, landing pages, meta tags, FAQs |
| GSC tracker | `src/tracking/gsc.ts` | Fetches real positions from Google Search Console API |
| Sitemap generator | `src/seo/sitemap.ts` | Builds sitemap.xml from keyword groups |
| Schema generator | `src/seo/schema.ts` | Builds JSON-LD schema markup for each page |
| Reporter | `src/reports/reporter.ts` | Renders rank snapshots to console and Markdown |
| CLI | `src/cli.ts` | Entry point: generate / track / sitemap / schema / report |

## Infrastructure

- Azure VM (`infra/main.bicep`): Standard_D4s_v3, Ubuntu 22.04, Ollama pre-installed
- Ollama port 11434 bound to localhost only — access via SSH tunnel
- GitHub Actions (`.github/workflows/weekly-track.yml`): weekly GSC rank pull

## Data Flow

```
Developer → CLI → Ollama (Azure VM via SSH tunnel) → output/
Google Search Console API → data/rank-history.json → reports/
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
