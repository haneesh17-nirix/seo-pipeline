# SEO Pipeline — System Documentation

> Free, self-hosted SEO automation for multiple brands.
> Zero subscription cost: Ollama (local LLM) + Google Search Console API (free quota).

---

## Table of Contents

1. [Architecture](#architecture)
2. [Brands](#brands)
3. [CLI Reference](#cli-reference)
4. [Infrastructure](#infrastructure)
5. [Workflow](#workflow)
6. [Adding a New Brand](#adding-a-new-brand)
7. [GitHub Actions](#github-actions)

---

## Architecture

```
seo-pipeline/
├── brands/                     # One directory per brand
│   ├── habun-rak/
│   │   ├── brand.json          # Brand config (keywords, pages, API endpoints)
│   │   ├── gsc-credentials.json  ← gitignored (sensitive)
│   │   ├── output/             # Generated content (sitemap, schema, blog posts)
│   │   ├── reports/            # GSC rank reports (markdown + JSON)
│   │   └── logs/               # rank-history.json (90-day rolling)
│   ├── habun-sharjah/
│   ├── nyrix/
│   └── bluemetal-pro/
├── src/
│   ├── brands/loader.ts        # BrandConfig interface, load/list/create helpers
│   ├── cli.ts                  # CLI entry point (all commands)
│   ├── content/generator.ts    # LLM content generation (blog, landing, meta, FAQ)
│   ├── tracking/gsc.ts         # Google Search Console API + rank history
│   ├── reports/reporter.ts     # Console + Markdown rank reports
│   ├── seo/sitemap.ts          # sitemap.xml generation
│   └── seo/schema.ts           # JSON-LD schema markup generation
├── infra/
│   ├── main.bicep              # Azure VM (Ollama host, UAE North)
│   └── deploy.sh               # Provision script
└── docs/                       # All documentation
```

### Data flow

```
CLI command
  │
  ├─► Ollama (Azure VM UAE North, via SSH tunnel)
  │     └─► Generated content → brands/<slug>/output/
  │
  ├─► Google Search Console API
  │     └─► Rank data → brands/<slug>/logs/rank-history.json
  │                   → brands/<slug>/reports/report-YYYY-MM-DD.md
  │
  ├─► sitemap.xml → brands/<slug>/output/sitemap.xml
  └─► JSON-LD     → brands/<slug>/output/schema/*.jsonld
```

---

## Brands

| Slug | Name | Type | Country | Site |
|------|------|------|---------|------|
| `habun-rak` | Habun — Ras Al Khaimah | restaurant | UAE (ae) | https://habun.ae |
| `habun-sharjah` | Habun — Sharjah | restaurant | UAE (ae) | https://habun.ae |
| `nyrix` | Nyrix | saas | India (in) | https://www.nyrix.aazhara.in |
| `bluemetal-pro` | BlueMetal Pro | saas | India (in) | https://www.blumetal.pro |

Full documentation for each brand:
- [brands/habun-rak/README.md](../brands/habun-rak/README.md)
- [brands/habun-sharjah/README.md](../brands/habun-sharjah/README.md)
- [brands/nyrix/README.md](../brands/nyrix/README.md)
- [brands/bluemetal-pro/README.md](../brands/bluemetal-pro/README.md)

---

## CLI Reference

### Brand management

```bash
seo brand list                        # List all brands with GSC status
seo brand add                         # Interactive wizard to create a new brand
seo brand show <slug>                 # Show keyword groups for a brand
```

### Content generation

Requires Ollama reachable (local or via SSH tunnel to Azure VM).

```bash
# Single keyword
seo generate --brand habun-rak --type blog-post --keyword "restaurant in RAK"

# Keyword group
seo generate --brand habun-rak --type meta-tags --group "Local RAK"

# All keywords for a brand
seo generate --brand bluemetal-pro --type faq --all

# Content types: blog-post | landing-page | meta-tags | faq
```

Output lands in `brands/<slug>/output/`.

### Rank tracking

Requires `brands/<slug>/gsc-credentials.json` (see [gsc-setup.md](gsc-setup.md)).

```bash
seo track --brand habun-rak           # Track all keywords for one brand
seo track --brand habun-rak --group "Local RAK"   # One group only
seo track-all                         # Track every brand that has GSC credentials
```

History is stored at `brands/<slug>/logs/rank-history.json` (rolling 90 days).
Reports are saved to `brands/<slug>/reports/report-YYYY-MM-DD.md`.

### Sitemap & schema

```bash
seo sitemap --brand habun-rak         # → brands/habun-rak/output/sitemap.xml
seo schema  --brand habun-rak         # → brands/habun-rak/output/schema/*.jsonld
```

### Reports

```bash
seo report --brand habun-rak          # Print latest snapshot from history
```

---

## Infrastructure

### Azure VM — Ollama host

| Setting | Value |
|---------|-------|
| Resource group | `habun-seo-rg` |
| Location | `uaenorth` (UAE North) |
| VM | `habun-seo-ollama` — Standard_D2s_v3 |
| OS | Ubuntu 22.04 LTS |
| Public IP | `20.216.5.173` |
| SSH key | `~/.ssh/id_rsa_habun_seo` |
| Ollama model | `llama3.2` |

**Why UAE North?** All content generation and GSC requests originate from a UAE IP, ensuring location-accurate keyword tracking for Habun (Ras Al Khaimah + Sharjah).

### SSH tunnel (required for content generation)

```bash
# Open tunnel (background)
ssh -i ~/.ssh/id_rsa_habun_seo \
    -L 11434:localhost:11434 \
    seouser@20.216.5.173 -N &

# Verify
curl http://localhost:11434/api/tags
```

Set in `.env`:
```
OLLAMA_HOST=http://localhost:11434
```

For India brands (Nyrix, BlueMetal Pro), Ollama can run locally — no tunnel needed.

### Provision / redeploy

```bash
cd infra && ./deploy.sh
```

---

## Workflow

### Daily / on-demand

1. Open SSH tunnel to Azure VM
2. Run `seo generate --brand <slug> --type blog-post --all`
3. Review output in `brands/<slug>/output/`
4. Publish content to site

### Weekly (automated via GitHub Actions)

- `.github/workflows/weekly-track.yml` runs `seo track-all` every Monday
- Pushes updated reports and rank history back to the repo

### Pre-push gate

Every `git push` triggers the dev-automation pipeline:
- Runs tests
- Checks API endpoints and page links (warnings only if site not live)
- Updates CHANGELOG, ARCHITECTURE, DESIGN docs
- Blocks push if hard failures occur

---

## Adding a New Brand

```bash
seo brand add
# Follow the interactive prompts
```

Then:

1. Edit `brands/<slug>/brand.json` to add keyword groups, pages, and API endpoints
2. Follow [gsc-setup.md](gsc-setup.md) to create `brands/<slug>/gsc-credentials.json`
3. Run `seo sitemap --brand <slug>` and `seo schema --brand <slug>`
4. Add the brand to `.github/workflows/weekly-track.yml` if GSC credentials are available in CI

### Brand config schema

```jsonc
{
  "slug": "my-brand",               // unique identifier, kebab-case
  "name": "My Brand",               // display name
  "type": "restaurant|saas|ecommerce|other",
  "siteUrl": "https://example.com",
  "gscSiteUrl": "https://example.com",  // as registered in GSC (may differ)
  "gscCredentialsFile": "./brands/my-brand/gsc-credentials.json",
  "targetCountry": "ae",            // 2-letter ISO code
  "gscCountryCode": "are",          // 3-letter GSC code (ae→are, in→ind, us→usa)
  "languages": ["en", "ar"],
  "ollamaModel": "llama3.2",
  "keywordGroups": [
    {
      "group": "Group Name",
      "keywords": ["keyword 1", "keyword 2"],
      "targetPage": "/page-path",
      "schemaType": "Restaurant|SoftwareApplication|Product"
    }
  ],
  "pages": [
    { "path": "/", "label": "Home" }
  ],
  "apiEndpoints": [
    { "method": "GET", "path": "/api/health", "expect": 200, "label": "Health" }
  ]
}
```

---

## GitHub Actions

### Weekly rank tracking

File: `.github/workflows/weekly-track.yml`

Runs every Monday at 06:00 UTC. Requires these repository secrets:

| Secret | Description |
|--------|-------------|
| `GSC_CREDENTIALS_HABUN` | Contents of `brands/habun-rak/gsc-credentials.json` |
| `GSC_CREDENTIALS_NYRIX` | Contents of `brands/nyrix/gsc-credentials.json` |
| `GSC_CREDENTIALS_BLUEMETAL` | Contents of `brands/bluemetal-pro/gsc-credentials.json` |

Add secrets at: `https://github.com/<owner>/seo-pipeline/settings/secrets/actions`
