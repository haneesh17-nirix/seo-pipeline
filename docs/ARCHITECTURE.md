# Architecture

> Last updated: 2026-06-23 (v2.0.0)

## Overview

**seo-pipeline** is a multi-brand SEO and content automation pipeline. It generates long-form blog posts, social copy, ad copy, FAQ pages, and video scripts using a parameterized 18.6-billion-combination content engine; routes every piece through a Discord owner-approval gate; and publishes approved content to Instagram, Facebook, YouTube, WordPress/Ghost, and Google Ads — all scheduled via PM2 cron. Rank tracking against Google Search Console is included for all brands.

Active brands: `habun-rak`, `habun-sharjah` (restaurant, UAE) · `nyrix`, `bluemetal-pro` (SaaS, India) · `sahayi` (domestic services, Kerala India)

---

## Module Table

| Module | Path | Responsibility |
|--------|------|----------------|
| CLI entry point | `src/cli.ts` | All commands; brand resolver; arg parsing |
| Brand loader | `src/brands/loader.ts` | `BrandConfig` interface, load / list / create per brand |
| Keywords config | `src/keywords/config.ts` | Legacy single-brand defaults (fallback) |
| LLM provider | `src/llm/provider.ts` | Routes inference: Azure OpenAI (production) → Ollama (local dev fallback) |
| Content generator | `src/content/generator.ts` | Brand-aware prompts: blog, landing, meta, FAQ (legacy path) |
| Parameterized generator | `src/content/parameterized-generator.ts` | 14-dimension job builder; synthesis-aware prompt; writes to review queue |
| Parameters | `src/content/parameters.ts` | All 14 parameter arrays; LCG permutation state machine; nextParams / paramStats |
| Corpus | `src/content/corpus.ts` | Indexes review-queue output into typed fragments (hook, metaphor, local-ref, tension, resolution, voice-beat, data-anchor, cta-variant) |
| Synthesizer | `src/content/synthesizer.ts` | Locality-biased fragment selection (6 tiers); MD5 never-repeat tracking; C(n,7) selection space |
| GSC tracker | `src/tracking/gsc.ts` | GSC API + per-brand rank history at brands/<slug>/logs/ |
| Sitemap generator | `src/seo/sitemap.ts` | sitemap.xml from brand pages + keyword groups |
| Schema generator | `src/seo/schema.ts` | JSON-LD: Restaurant / SoftwareApplication from brand type |
| Reporter | `src/reports/reporter.ts` | Console + Markdown rank reports |
| Discord approval bot | `src/approval/discord-bot.ts` | DM approval UI (Approve / Reject / Revision / Skip); /queue, /pending, /next commands |
| Publish scheduler | `src/publishing/scheduler.ts` | Cron every 15 min; enqueues approved items; publishes due jobs |
| Meta publishing | `src/publishing/meta.ts` | Instagram + Facebook Graph API; reply-draft fetcher |
| YouTube publishing | `src/publishing/youtube.ts` | YouTube Data API v3 upload |
| Blog publishing | `src/publishing/blog.ts` | WordPress / Ghost / webhook adapters |
| Google Ads | `src/ads/google-ads.ts` | RSA draft creation, always PAUSED; owner enables spend manually |
| Video generator | `src/video/generator.ts` | Runway Gen-3 / Kling / Pika with fallback to script Markdown |
| PM2 config | `ecosystem.config.js` | Defines sahayi-discord-bot and sahayi-scheduler processes |

---

## Infrastructure

### LLM

| Mode | Provider | Trigger |
|------|----------|---------|
| Production | Azure OpenAI (gpt-4o-mini) | AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY set in .env |
| Local dev | Ollama (llama3.2) | Azure vars absent; OLLAMA_HOST=http://localhost:11434 |

Never use the Anthropic/Claude API. All inference on Azure in production.

### PM2

Two persistent processes managed by `ecosystem.config.js`:

- `sahayi-discord-bot` — runs `seo approve-bot` (Discord DM approval UI)
- `sahayi-scheduler` — runs `seo scheduler` (publish queue, checks every 15 min)

Start with: `pm2 start ecosystem.config.js`

### Path alias

The working directory contains spaces. Use the symlink to avoid shell escaping issues:

```bash
ln -s "/Volumes/HPB DISC/seo-pipeline" ~/sahayi-seo
cd ~/sahayi-seo
```

---

## Data Flow

```
seo generate-content --brand sahayi
          |
          v
  parameters.ts          LCG permutation, nextParams()
          |
          v  14-dim ContentParams
  synthesizer.ts         locality-biased fragment pick (7 fragments)
          |
          v  fragment context injected into prompt
  llm/provider.ts  ----> Azure OpenAI gpt-4o-mini
                         (Ollama fallback if Azure vars unset)
          |
          v
  brands/<slug>/output/review-queue/   (status: pending_review)
          |
          v
  discord-bot.ts         DM to owner: Approve / Reject / Revision / Skip
          |
          v  approved
  scheduler.ts           cron every 15 min, PM2 managed
          |
    ------+--------+----------+------------
    |              |          |            |
  meta.ts     youtube.ts   blog.ts   google-ads.ts
  IG+FB       YouTube      WP/Ghost   RSA (PAUSED)
```

---

## Content Combination Math

14 dimensions multiplied together:

```
tone(5) x perspective(4) x structure(6) x hook(5) x ctaStyle(4)
x localDepth(4) x length(3) x evidence(4) x literaryInfluence(14)
x languageRegister(6) x experienceTone(5) x annotationStyle(6)
x referenceFrame(8) x postArchitecture(8)

= 18,579,456,000 unique parameter combinations
```

The LCG permutation in `parameters.ts` steps through this space without materialising an array. Each brand x content-type pair has its own state file at `brands/<slug>/logs/param-state-<type>.json`. After exhausting all combinations, a new LCG seed starts a fresh cycle.

---

## Corpus Synthesis System

`index-corpus` scans all review-queue Markdown files and extracts typed fragments:

| Fragment type | What it captures |
|---------------|-----------------|
| hook | Opening sentences and attention grabs |
| metaphor | Figurative language and analogies |
| local-ref | City, neighbourhood, landmark references |
| tension | Problem statements and pain points |
| resolution | Solution framing and outcome statements |
| voice-beat | Characteristic rhythmic phrases |
| data-anchor | Statistics and evidence claims |
| cta-variant | Call-to-action phrasings |

`synthesizer.ts` selects 7 fragments per generation using locality bias:

| Tier | Match | Weight |
|------|-------|--------|
| 1 | same_city_same_category | 38% |
| 2 | same_city_any_category | 22% |
| 3 | same_category_any_city | 18% |
| 4 | same_brand_any | 12% |
| 5 | any_brand_any | 7% |
| 6 | random_wildcard | 3% |

Selection history is hashed (MD5) so no fragment combination repeats until the C(n,7) space is exhausted.

---

## Approval Pipeline Flow

```
review-queue/
pending_review --> [Approve]   --> queued    --> published (scheduler)
               --> [Reject]    --> rejected
               --> [Revision]  --> needs_revision (re-queue after edit)
               --> [Skip]      --> skipped
```

Discord bot commands:
- `/queue` — show full review backlog
- `/pending` — show items awaiting decision
- `/next` — get the next item to review

---

## Publishing Pipeline Flow

```
enqueueApproved()
  scans review-queue for status=approved
  adds to publish-queue.json with scheduledFor timestamp

publishDueJobs()  called every 15 min by scheduler
  for each job where scheduledFor <= now and status=queued:
    social-post  -> meta.ts        (Instagram + Facebook)
    video        -> youtube.ts
    blog-post    -> blog.ts        (WP / Ghost / webhook)
    ad-copy      -> google-ads.ts  (created PAUSED)
```

---

## Change History (v1.x)

### 2026-06-23 — va583e55 — feat: replace Telegram approval bot with Discord
### 2026-06-23 — vf71a3b4 — feat: add referenceFrame + postArchitecture dimensions (18.6B combinations)
### 2026-06-23 — v55afc76 — feat: corpus synthesis engine, locality-biased fragment selection
### 2026-06-23 — vacef807 — feat(sahayi): full automation pipeline, approval, publishing, ads, video
### 2026-06-22 — v9b7b64a — feat(content): literary + register + experience dimensions, LCG permutation engine
### 2026-06-22 — v287fc1a — feat(sahayi): parameterized content engine + brand config
### 2026-06-19 — v33b82b2 — fix(nyrix): GSC site URL trailing slash, reporter brand object fix
### 2026-06-19 — vfdb0589 — feat(nyrix): update domain to nirixtracking.in
### 2026-06-11 — ve8590b5 — feat: automate full SEO pipeline, run-all command, GitHub Actions
### 2026-06-11 — vf4aa4b5 — feat: multi-brand SEO pipeline with per-brand isolation
### 2026-06-11 — v515b7a7 — feat: deploy Ollama to UAE North (habun-seo-rg)
### 2026-06-11 — v34674bd — feat: OAuth2 browser auth flow for GSC
### 2026-06-09 — vdb8c7b4 — docs: add CHANGELOG, architecture/design/API docs
