# seo-pipeline

A multi-brand SEO and content automation pipeline. Generates blog posts, social copy, ad copy, FAQ pages, and video scripts using a 18.6-billion-combination parameterized content engine; routes everything through a Discord owner-approval gate; and publishes approved content to Instagram, Facebook, YouTube, WordPress/Ghost, and Google Ads on a PM2-managed cron schedule.

---

## Brands

| Slug | Name | Type | Country | Site |
|------|------|------|---------|------|
| `habun-rak` | Habun — Ras Al Khaimah | restaurant | UAE | https://habun.ae |
| `habun-sharjah` | Habun — Sharjah | restaurant | UAE | https://habun.ae |
| `nyrix` | Nyrix | saas | India | https://www.nyrix.aazhara.in |
| `bluemetal-pro` | BlueMetal Pro | saas | India | https://www.blumetal.pro |
| `sahayi` | Sahayi | services | India (Kerala) | https://sahayi.co.in |

---

## Prerequisites

- Node.js 20+
- One of: Azure OpenAI deployment (production) or Ollama running locally (dev)
- PM2 (`npm install -g pm2`)
- Discord bot token + your Discord user ID (for approval gate)
- Google Search Console OAuth2 credentials per brand (for rank tracking)

---

## Quick Start

**1. Clone / copy the repo**

```bash
# Symlink avoids issues with spaces in the path
ln -s "/Volumes/HPB DISC/seo-pipeline" ~/sahayi-seo
cd ~/sahayi-seo
```

**2. Install dependencies**

```bash
npm install
npm run build
```

**3. Fill in `.env`**

```bash
cp .env.example .env
# Edit .env — minimum required fields listed in the Environment Variables section below
```

**4. Start persistent processes with PM2**

```bash
pm2 start ecosystem.config.js
pm2 save
```

This starts the Discord approval bot and the publish scheduler.

**5. Generate content**

```bash
seo generate-content --brand sahayi --type blog-post
# Files land in brands/sahayi/output/review-queue/
# Discord bot will DM you for approval
```

---

## CLI Commands

### Brand management

| Command | Description |
|---------|-------------|
| `seo brand list` | List all brands with GSC credential status |
| `seo brand add` | Interactive wizard to create a new brand |
| `seo brand show <slug>` | Show keyword groups and totals for a brand |

### Content generation

| Command | Description |
|---------|-------------|
| `seo generate-content -b <slug>` | Generate all content types for a brand (lands in review queue) |
| `seo generate-content -b <slug> -t blog-post` | Generate only blog posts |
| `seo generate-content -b <slug> -t social-post` | Generate only social posts |
| `seo generate-content -b <slug> -t ad-copy` | Generate only ad copy |
| `seo generate-content -b <slug> -t faq-page` | Generate only FAQ pages |
| `seo generate-content -b <slug> -k "keyword" -c "city"` | Single keyword with city context |
| `seo generate -b <slug> -t blog-post -k "keyword"` | Legacy generator (direct output, no review queue) |
| `seo generate -b <slug> -t faq --all` | Legacy generator, all brand keywords |

### Parameterized content stats

| Command | Description |
|---------|-------------|
| `seo param-stats -b <slug>` | Show combination coverage (used / remaining / cycle %) |
| `seo param-stats -b <slug> --preview` | Preview next 5 parameter sets |

### Corpus and synthesis

| Command | Description |
|---------|-------------|
| `seo index-corpus` | Index all brands' review-queue output into fragment corpus |
| `seo index-corpus -b <slug>` | Index one brand only |
| `seo synthesis-stats -b <slug>` | Show corpus size, fragment breakdown, unique selection space |

### Approval

| Command | Description |
|---------|-------------|
| `seo review-queue -b <slug>` | List pending review files |
| `seo review-queue -b <slug> --approved` | List approved files |
| `seo approve-bot` | Start Discord approval bot (use PM2 in production) |

### Publishing

| Command | Description |
|---------|-------------|
| `seo publish` | Enqueue approved items and publish due jobs |
| `seo publish --dry-run` | Show what would be published without posting |
| `seo publish --status` | Show publish queue summary |
| `seo scheduler` | Start background publish scheduler (use PM2 in production) |
| `seo reply-drafts -b <slug>` | Fetch unreplied comments and generate draft replies |

### Video

| Command | Description |
|---------|-------------|
| `seo generate-video -b <slug> --all-approved` | Generate videos for all approved content |
| `seo generate-video -b <slug> -k "keyword" -f reel` | Generate video for a specific keyword |

Formats: `reel`, `short`, `ad-15s`, `ad-30s`, `explainer-60s`
Providers: `runway`, `kling`, `pika`, `local-sd`

### Rank tracking

| Command | Description |
|---------|-------------|
| `seo track -b <slug>` | Fetch rankings from Google Search Console |
| `seo track -b <slug> -g "Group Name"` | Track one keyword group |
| `seo track-all` | Track all brands with GSC credentials |
| `seo report -b <slug>` | Print latest rank snapshot |

### SEO assets

| Command | Description |
|---------|-------------|
| `seo sitemap -b <slug>` | Generate sitemap.xml |
| `seo schema -b <slug>` | Generate JSON-LD schema markup |

### Full pipeline

| Command | Description |
|---------|-------------|
| `seo run-all` | generate + track + sitemap + schema for all brands |
| `seo run-all -b <slug>` | Same, for one brand |
| `seo run-all --only-track` | Track only, skip generation |

### Auth

| Command | Description |
|---------|-------------|
| `seo auth -b <slug>` | Authorise Google Search Console via OAuth2 browser login |

---

## Brand Management

Each brand lives in `brands/<slug>/`:

```
brands/sahayi/
├── brand.json              # Config: keywords, pages, API endpoints
├── gsc-credentials.json    # GSC OAuth2 token — gitignored
├── yt-credentials.json     # YouTube OAuth2 token — gitignored
├── output/
│   └── review-queue/       # Generated content awaiting approval
├── reports/                # GSC rank reports (Markdown + JSON)
└── logs/
    ├── rank-history.json   # 90-day rolling keyword positions
    └── param-state-*.json  # LCG permutation state per content type
```

To add a brand: `seo brand add` then edit the resulting `brand.json`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_OPENAI_ENDPOINT` | Production | Azure OpenAI resource URL |
| `AZURE_OPENAI_KEY` | Production | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Production | Model deployment name (default: `gpt-4o-mini`) |
| `AZURE_OPENAI_API_VERSION` | Production | API version (default: `2024-08-01-preview`) |
| `OLLAMA_HOST` | Dev | Ollama base URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Dev | Model name (default: `llama3.2`) |
| `GSC_CLIENT_ID` | GSC tracking | OAuth2 client ID from Google Cloud Console |
| `GSC_CLIENT_SECRET` | GSC tracking | OAuth2 client secret |
| `DISCORD_BOT_TOKEN` | Approval | Bot token from Discord Developer Portal |
| `DISCORD_OWNER_ID` | Approval | Your Discord user ID (enable Developer Mode to copy) |
| `META_ACCESS_TOKEN` | Meta publishing | Long-lived token from Graph API |
| `META_IG_ACCOUNT_ID` | Meta publishing | Instagram Business Account ID |
| `META_FB_PAGE_ID` | Meta publishing | Facebook Page ID |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads | Developer token from Google Ads API Center |
| `GOOGLE_ADS_CLIENT_ID` | Google Ads | OAuth2 client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Google Ads | OAuth2 client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | Google Ads | Refresh token |
| `GOOGLE_ADS_CUSTOMER_ID` | Google Ads | Google Ads customer ID |
| `BLOG_ADAPTER` | Blog publishing | `wordpress`, `ghost`, or `webhook` |
| `BLOG_WEBHOOK_URL` | Blog publishing | Webhook URL (if adapter = webhook) |
| `BLOG_API_TOKEN` | Blog publishing | WP application password or Ghost Admin API key |
| `RUNWAY_API_KEY` | Video | Runway Gen-3 API key |
| `KLING_API_KEY` | Video | Kling API key |
| `PIKA_API_KEY` | Video | Pika API key |

Per-brand overrides use a prefix: `SAHAYI_META_TOKEN`, `SAHAYI_IG_ACCOUNT_ID`, etc.

---

## Architecture Overview

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full module table, data flow diagram, corpus synthesis system, and approval/publishing pipeline details.

Short version:

```
generate-content  -->  review-queue  -->  Discord DM approval
     |
  parameters.ts (LCG, 18.6B combos)
  synthesizer.ts (locality-biased fragment selection)
  llm/provider.ts (Azure OpenAI / Ollama fallback)
                                              |
                                     approved |
                                              v
                                    scheduler (PM2, cron 15min)
                                              |
                             ┌────────────────┼──────────────┐
                        IG+FB          YouTube       WP/Ghost/Ads
```

---

## Content Dimensions

18.6 billion unique parameter combinations across 14 dimensions:

| Dimension | Values | Description |
|-----------|--------|-------------|
| `tone` | 5 | conversational, authoritative, empathetic, direct, storytelling |
| `perspective` | 4 | brand, satisfied customer, expert advisor, community member |
| `structure` | 6 | how-to, problem-solution, listicle, case study, Q&A, DIY comparison |
| `hook` | 5 | statistic, question, pain point, anecdote, bold claim |
| `ctaStyle` | 4 | soft, direct, urgency, social proof |
| `localDepth` | 4 | city, neighbourhood, seasonal, cultural event |
| `length` | 3 | concise (550-650w), standard (850-1000w), in-depth (1100-1300w) |
| `evidence` | 4 | statistics, testimonial-style quotes, before/after, expert perspective |
| `literaryInfluence` | 14 | R.K. Narayan, Ruskin Bond, Hemingway, Toni Morrison, and 10 others |
| `languageRegister` | 6 | formal prose to Gen Z; Hinglish natural option |
| `experienceTone` | 5 | awed, understated, cheesy-fun, earnest, irreverent |
| `annotationStyle` | 6 | clean prose, em-dash, parenthetical, emoji, ellipsis, asterisk emphasis |
| `referenceFrame` | 8 | movie-mirror, political-lens, empathy-first, helper-view, and 4 others |
| `postArchitecture` | 8 | mirror-pivot, day-in-life, before-after-bridge, question-ladder, and 4 others |

---

## Approval Workflow

All generated content requires owner approval before publishing. No exceptions.

1. `seo generate-content` writes files to `brands/<slug>/output/review-queue/` with `status: pending_review`
2. Discord bot (running via PM2) DMs you each item with four buttons: **Approve**, **Reject**, **Revision**, **Skip**
3. Approved items are picked up by the scheduler (every 15 min) and published to the configured channels
4. Google Ads RSAs are always created **PAUSED** — you enable spend manually in Google Ads UI

Discord bot commands while reviewing: `/queue`, `/pending`, `/next`

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full module table, data flow, corpus synthesis, approval and publishing pipeline |
| [docs/PIPELINE.md](docs/PIPELINE.md) | End-to-end pipeline walkthrough |
| [docs/gsc-setup.md](docs/gsc-setup.md) | Google Search Console OAuth2 setup per brand |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
