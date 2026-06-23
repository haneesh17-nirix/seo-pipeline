# Changelog

All notable changes to seo-pipeline are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org/).

## [2.1.0] — 2026-06-23

### Added
- **Azure Blob Storage static blog** (`src/publishing/blog.ts` — `azure-blob` adapter) — `$web` container, branded HTML with Article JSON-LD schema, OG tags, Kerala IST date, reading time, Noto Serif Malayalam font, CTA box; index auto-updated
- **Human-behaviour publish scheduler** — Kerala IST timezone, seeded LCG randomness, WEEKDAY/WEEKEND posting windows with weights, cluster events, dead zone 2am–6am IST; 5-minute cron check
- **Video production suites** — `generateVideoSuite()` in `src/video/generator.ts`; 40 scripts across 6 services in English/Malayalam/Manglish; Azure OpenAI for all generation
- **Ghost CMS on Azure Container Apps** (`sahayi-ghost-blog.icyhill-15e4b439.centralindia.azurecontainerapps.io`) — Container App in `rg-sahayi-prod` reusing `sahayi-prod-env`; running with ephemeral SQLite until persistence is resolved
- **`src/publishing/types.ts`** — shared `PublishItem` interface replacing the old `ReviewItem` from `telegram-bot`

### Changed
- `BLOG_ADAPTER` switched to `azure-blob` (Ghost uses ephemeral SQLite — data lost on container restart; switch back to `ghost` once PostgreSQL persistence is solved)
- `src/video/generator.ts` — removed `telegram-bot` import; new `ContentItem` interface; `callLLM()` replaces direct Ollama fetch; Malayalam/Manglish language instruction builder
- `src/publishing/meta.ts` and `youtube.ts` — import `PublishItem` from `./types` instead of telegram-bot
- `src/cli.ts` — `generate-video --suite --language` flags; `parseReviewFile` imported from `discord-bot`
- `infra/azure-openai.bicep` — model updated to `gpt-4.1-mini / 2025-04-14` (old gpt-4o-mini deprecated)
- Azure OpenAI deployment name kept as `gpt-4o-mini` for API compatibility

### Infrastructure
- **`sahayi-seo-pipeline-rg`** (East US) — Azure OpenAI (`sahayi-seo-openai`) + blog storage (`sahayiblog3024`)
- **`rg-sahayi-prod`** (Central India) — Container Apps env (`sahayi-prod-env`), PostgreSQL (`sahayi-prod-pg`), ACR (`sahayiprodacr`), Ghost Container App
- `infra/deploy-static-blog.sh` — provisions `sahayiblog3024` storage account and enables static website
- Custom Ghost Docker image (`sahayiprodacr.azurecr.io/ghost-pg:5-alpine`) — adds `pg` module via `--legacy-peer-deps`

### Known Issues
- Ghost Container App is running with **ephemeral SQLite** only. SQLite over Azure Files SMB fails (POSIX locking). PostgreSQL migration races on Ghost 5.130 (`knex-migrator` sets `locked=1` then `getState()` sees it and crashes). Fix: run a Container Apps Job to pre-init the DB before Ghost starts, or wait for an upstream Ghost fix.

### Security
- Discord bot token regenerated (old token was exposed in session logs)
- `.env` gitignored; no credentials committed

---

## [2.0.0] — 2026-06-23

### Added
- **Sahayi brand** — domestic services marketplace, Kerala India, `sahayi.co.in`
- **Parameterized content engine** (`src/content/parameterized-generator.ts`) — 14 dimensions, 18.6 billion combinations, LCG permutation (no array materialised), synthesis-aware prompt builder
- **Content parameters** (`src/content/parameters.ts`) — all 14 dimensions including `literaryInfluence` (14 authors), `languageRegister` (6 registers), `experienceTone` (5 tones), `annotationStyle` (6 styles), `referenceFrame` (8 frames), `postArchitecture` (8 architectures)
- **Corpus system** (`src/content/corpus.ts`) — indexes generated content into typed fragments: hook, metaphor, local-ref, tension, resolution, voice-beat, data-anchor, cta-variant
- **Synthesizer** (`src/content/synthesizer.ts`) — locality-biased fragment selection (6 tiers, same_city_same_category 38% down to random_wildcard 3%), never-repeat tracking via MD5 hash, C(n,7) combination space
- **Discord approval bot** (`src/approval/discord-bot.ts`) — DM-based approval with Approve/Reject/Revision/Skip buttons; commands: /queue, /pending, /next
- **Publish scheduler** (`src/publishing/scheduler.ts`) — cron-based, PM2-managed background process
- **Meta publishing** (`src/publishing/meta.ts`) — Instagram + Facebook via Meta Graph API; reply-draft workflow for comment responses
- **YouTube publishing** (`src/publishing/youtube.ts`) — upload via YouTube Data API v3
- **Blog publishing** (`src/publishing/blog.ts`) — WordPress, Ghost, and webhook adapters
- **Google Ads drafts** (`src/ads/google-ads.ts`) — RSA drafts created PAUSED; owner enables spend manually
- **Video generation** (`src/video/generator.ts`) — Runway Gen-3, Kling, Pika with fallback to script Markdown
- **LLM provider router** (`src/llm/provider.ts`) — Azure OpenAI (production) with Ollama fallback when Azure vars unset
- **PM2 config** (`ecosystem.config.js`) — manages `sahayi-discord-bot` and `sahayi-scheduler` as persistent processes
- **New CLI commands**: `generate-content`, `review-queue`, `param-stats`, `index-corpus`, `synthesis-stats`, `approve-bot`, `publish`, `scheduler`, `reply-drafts`, `generate-video`

### Changed
- Primary LLM provider changed from Ollama-only to Azure OpenAI (gpt-4o-mini); Ollama retained as local dev fallback
- Approval channel changed from Telegram to Discord (local network restrictions on Telegram)
- Content generation now routes through a review queue with mandatory owner approval before any publishing
- `package.json` description updated to reflect multi-brand content automation scope

### Infrastructure
- Azure OpenAI (gpt-4o-mini) via `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` — all production inference
- Ollama (`http://localhost:11434`) — local dev fallback when Azure vars are absent
- PM2 manages Discord bot and publish scheduler as persistent background processes
- Symlink `~/sahayi-seo` → `/Volumes/HPB DISC/seo-pipeline` recommended to avoid spaces in path

### Security
- All content gated behind Discord owner approval before publishing
- Google Ads always created PAUSED — no automated spend
- No automated liking (platform ToS)
- `.env` gitignored; no credentials committed

---

## [1.14.0] and earlier

See the change history section in `docs/ARCHITECTURE.md` for the detailed commit log from the v1.x series (2026-06-09 through 2026-06-22).
