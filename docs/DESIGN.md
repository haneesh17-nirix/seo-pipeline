# Design Document

> Auto-maintained. New features and breaking changes are appended here by the pipeline.

## Goals

1. **Zero subscription cost** — Ollama for LLM, GSC API for tracking, both free
2. **Keyword-driven content** — all content generation and site structure derives from `keywords/config.ts`
3. **Append-only history** — rank history, reports, and logs accumulate over time
4. **Low maintenance** — weekly tracking runs automatically via GitHub Actions

## Decisions

### 2026-06-10 — Ollama over hosted LLM APIs
Claude/OpenAI APIs cost per token. For bulk content generation across 24 keywords × 4 content
types = 96 documents, a local Ollama instance on a deallocate-when-idle Azure VM is significantly
cheaper (VM cost only when running, ~$0 otherwise).

### 2026-06-10 — Google Search Console over SerpAPI
GSC gives first-party data (real impressions and clicks on YOUR site) vs SerpAPI which
simulates a Google search. GSC is free and more accurate for your own domain.

### 2026-06-10 — SSH tunnel for Ollama
Ollama is bound to 127.0.0.1 on the Azure VM. Access from the developer's Mac is via
SSH port forwarding. This avoids exposing the inference API to the public internet.

### 2026-06-11 — feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG

feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG

### 2026-06-11 — feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG

feat: deploy Ollama to UAE North (habun-seo-rg), add Habun restaurant keywords, fix IPv6 NSG

### 2026-06-11 — feat: Habun restaurant SEO strategy — UAE white-hat, GEO/AEO, 90-day plan

feat: Habun restaurant SEO strategy — UAE white-hat, GEO/AEO, 90-day plan

### 2026-06-11 — feat: Habun restaurant SEO strategy — UAE white-hat, GEO/AEO, 90-day plan

feat: Habun restaurant SEO strategy — UAE white-hat, GEO/AEO, 90-day plan

### 2026-06-11 — feat: multi-brand SEO pipeline with per-brand isolation

feat: multi-brand SEO pipeline with per-brand isolation

### 2026-06-11 — feat: multi-brand SEO pipeline with per-brand isolation

feat: multi-brand SEO pipeline with per-brand isolation

### 2026-06-11 — feat: automate full SEO pipeline — run-all command, shell script, cron, GitHub Actions

feat: automate full SEO pipeline — run-all command, shell script, cron, GitHub Actions

### 2026-06-11 — feat: automate full SEO pipeline — run-all command, shell script, cron, GitHub Actions

feat: automate full SEO pipeline — run-all command, shell script, cron, GitHub Actions

### 2026-06-11 — feat: OAuth2 browser auth flow for GSC — bypasses service account key org policy

feat: OAuth2 browser auth flow for GSC — bypasses service account key org policy

### 2026-06-11 — feat: OAuth2 browser auth flow for GSC — bypasses service account key org policy

feat: OAuth2 browser auth flow for GSC — bypasses service account key org policy

### 2026-06-15 — feat(habun): GBP setup guides, outreach emails, Arabic location pages

feat(habun): GBP setup guides, outreach emails, Arabic location pages

### 2026-06-15 — feat(habun): GBP setup guides, outreach emails, Arabic location pages

feat(habun): GBP setup guides, outreach emails, Arabic location pages
