# Pipeline

> End-to-end walkthrough: from content generation to published post.

---

## Overview

```
generate-content
      |
      v
review-queue  (brands/<slug>/output/review-queue/)
      |
      v
Discord approval bot  (DM to owner)
      |
      v  approved
publish queue  (publish-queue.json)
      |
      v
scheduler  (cron every 15 min, PM2)
      |
      +---> Meta (Instagram + Facebook)
      +---> YouTube
      +---> Blog (WordPress / Ghost / webhook)
      +---> Google Ads (RSA, created PAUSED)
```

---

## Stage 1 — Content Generation

### Command

```bash
seo generate-content --brand sahayi --type blog-post
```

Options: `--type` accepts `blog-post | social-post | ad-copy | faq-page | all`
Add `--keyword "keyword" --city "Kochi"` for a single targeted piece.

### What happens

1. `parameterized-generator.ts` builds a list of `GenerateJob` objects from the brand's keyword groups.
2. For each job, `parameters.ts` calls `nextParams()` which advances a per-brand LCG state machine and returns a unique 14-dimension `ContentParams` object. State is saved to `brands/<slug>/logs/param-state-<type>.json`.
3. If a corpus exists (from a prior `index-corpus` run), `synthesizer.ts` selects 7 locality-biased fragments to inject as additional context into the prompt.
4. `llm/provider.ts` sends the assembled prompt to Azure OpenAI (gpt-4o-mini). Falls back to Ollama if Azure vars are absent.
5. The response is written to `brands/<slug>/output/review-queue/<timestamp>-<keyword>.md` with front-matter: `status: pending_review`, `contentType`, `keyword`, `tone`, and the full `ContentParams`.

### Output directory

```
brands/<slug>/output/review-queue/
├── 2026-06-23T10-00-00-best-plumber-kochi.md
├── 2026-06-23T10-00-05-house-cleaning-thrissur.md
└── ...
```

---

## Stage 2 — Review Queue

### Inspect pending files

```bash
seo review-queue --brand sahayi           # list pending_review items
seo review-queue --brand sahayi --approved  # list approved items
```

Each file is a Markdown document with a YAML front-matter block:

```yaml
---
brand: sahayi
contentType: blog-post
keyword: "best plumber in Kochi"
status: pending_review
tone: "conversational and warm"
structure: "problem → cause → solution narrative"
literaryInfluence: "R.K. Narayan — gentle, unhurried..."
generatedAt: 2026-06-23T10:00:00.000Z
---
```

You can edit the body of any file before approving it. The front-matter `status` field is what the bot and scheduler read.

---

## Stage 3 — Discord Approval

### Setup (one time)

1. Create a Discord app at https://discord.com/developers/applications
2. Bot tab → Add Bot → copy the token → set `DISCORD_BOT_TOKEN` in `.env`
3. Enable Developer Mode in Discord Settings → Advanced, then right-click your username → Copy User ID → set `DISCORD_OWNER_ID` in `.env`
4. Add the bot to your server (or enable DMs from server members)

### Running the bot

In production, PM2 manages it:

```bash
pm2 start ecosystem.config.js
# starts sahayi-discord-bot and sahayi-scheduler
```

For a one-off run:

```bash
seo approve-bot
```

### Approval flow

The bot sends you a DM for each `pending_review` item. Each message shows the content type, keyword, tone summary, and a truncated preview of the body. Four buttons:

| Button | Result |
|--------|--------|
| Approve | Sets `status: approved` — scheduler will pick it up |
| Reject | Sets `status: rejected` — item stays in review-queue, not published |
| Revision | Sets `status: needs_revision` — edit the file, then re-run the bot to re-queue it |
| Skip | Sets `status: skipped` — ignores for now, revisit later |

### Bot commands

| Command | Description |
|---------|-------------|
| `/queue` | Show all items in the review queue with their status |
| `/pending` | Show only items awaiting a decision |
| `/next` | Get the next pending item to review |

---

## Stage 4 — Publish Queue

### Enqueue approved items

```bash
seo publish
```

This calls `enqueueApproved()` which scans all brands' review queues for `status: approved` items that are not yet in the publish queue. Each item is added to `publish-queue.json` with a `scheduledFor` timestamp (immediate by default; the scheduler spaces posts if you configure a gap).

Check the queue status:

```bash
seo publish --status
```

Output:

```
Publish queue: 12 total
  Queued:    8
  Published: 3
  Failed:    1

Next 5 scheduled:
  23/06/2026, 11:00:00 am — [sahayi] blog-post
  23/06/2026, 11:15:00 am — [sahayi] social-post
  ...
```

---

## Stage 5 — Scheduler

The scheduler runs `publishDueJobs()` every 15 minutes. It picks up all items in `publish-queue.json` where `scheduledFor <= now` and `status = queued`, then dispatches each to the correct publishing adapter.

In production, PM2 keeps it alive:

```bash
pm2 start ecosystem.config.js   # sahayi-scheduler runs seo scheduler
pm2 logs sahayi-scheduler       # watch publish log
```

For a one-off dry run:

```bash
seo publish --dry-run   # shows what would be published without posting
```

---

## Stage 6 — Publishing Adapters

### Meta (Instagram + Facebook)

Adapter: `src/publishing/meta.ts`

Required env vars: `META_ACCESS_TOKEN`, `META_IG_ACCOUNT_ID`, `META_FB_PAGE_ID`
Per-brand overrides: `SAHAYI_META_TOKEN`, `SAHAYI_IG_ACCOUNT_ID`, `SAHAYI_FB_PAGE_ID`

Social posts are published via the Meta Graph API. After publishing, you can fetch unreplied comments and generate draft replies for manual approval:

```bash
seo reply-drafts --brand sahayi
# Saves drafts to brands/sahayi/output/reply-drafts/
# Edit and approve each before posting — no automated replies
```

### YouTube

Adapter: `src/publishing/youtube.ts`

Credentials: `brands/<slug>/yt-credentials.json` (OAuth2, gitignored)
Scopes needed: `youtube.upload`, `youtube.force-ssl`

### Blog

Adapter: `src/publishing/blog.ts`

Set `BLOG_ADAPTER` to one of:
- `wordpress` — uses WP REST API + application password (`BLOG_API_TOKEN`)
- `ghost` — uses Ghost Admin API (`BLOG_API_TOKEN`)
- `webhook` — POSTs JSON to `BLOG_WEBHOOK_URL` (your CMS handles it)

Per-brand: `SAHAYI_BLOG_ADAPTER`, `SAHAYI_BLOG_URL`, `SAHAYI_BLOG_TOKEN`

### Google Ads

Adapter: `src/ads/google-ads.ts`

Creates RSA (Responsive Search Ad) drafts with `status: PAUSED`. You review and enable spend manually in the Google Ads UI. The pipeline never enables spend automatically.

Required env vars: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`

---

## Video Generation (optional)

Video generation is a separate step. It produces a video script Markdown file in all cases; if a provider API key is set, it also submits to that provider and downloads the result.

```bash
# Generate videos for all approved content
seo generate-video --brand sahayi --all-approved --format reel

# Generate for a specific keyword
seo generate-video --brand sahayi --keyword "house cleaning Kochi" --format short --provider runway
```

Providers tried in order: `runway` → `kling` → `pika` → `local-sd` (script markdown only)

---

## Rank Tracking

Rank tracking is independent of the content pipeline. Run it on demand or via the weekly GitHub Actions workflow.

```bash
seo auth --brand sahayi          # one-time OAuth2 browser login
seo track --brand sahayi         # fetch latest rankings
seo track-all                    # all brands with GSC credentials
seo report --brand sahayi        # print last snapshot
```

History is stored at `brands/<slug>/logs/rank-history.json` (rolling 90 days). Reports saved to `brands/<slug>/reports/report-YYYY-MM-DD.md`.

---

## Corpus Growth Loop

The corpus improves generation quality over time:

```
generate-content  -->  review-queue  -->  approval  -->  index-corpus
                                                               |
                                          synthesizer.ts  <---+
                                          (fragments injected into next prompts)
```

After accumulating approved content, run:

```bash
seo index-corpus                  # index all brands
seo synthesis-stats --brand sahayi  # check corpus size and fragment breakdown
```

Subsequent `generate-content` runs will automatically use the corpus for locality-biased fragment injection.

---

## Security Checklist

- All content requires Discord owner approval before publishing
- Google Ads RSAs always created PAUSED — manual spend activation only
- No automated liking or commenting (platform ToS)
- `.env` is gitignored — never commit credentials
- YouTube and GSC credentials stored per-brand in `brands/<slug>/` (gitignored)
- Never use the Anthropic/Claude API — all inference on Azure OpenAI
