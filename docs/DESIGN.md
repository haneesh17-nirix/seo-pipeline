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
