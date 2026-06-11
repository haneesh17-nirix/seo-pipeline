# SEO Pipeline

**100% free. Multi-brand. Self-hosted.**
No paid APIs — Ollama (local LLM) + Google Search Console API (free quota).

| Module | Tool | Cost |
|--------|------|------|
| Content generation | Ollama + Llama 3.2 on Azure VM | ~$0* |
| Keyword tracking | Google Search Console API | Free |
| Sitemap & schema | Built-in generators | Free |
| Automated tracking | GitHub Actions (weekly) | Free |

\*VM (~$15–26/month) only needed for content generation. Tracking runs from GitHub Actions — VM can be off.

---

## Brands

| Brand | Type | Country | Slug |
|-------|------|---------|------|
| [Habun — Ras Al Khaimah](brands/habun-rak/README.md) | Restaurant | UAE | `habun-rak` |
| [Habun — Sharjah](brands/habun-sharjah/README.md) | Restaurant | UAE | `habun-sharjah` |
| [Nyrix](brands/nyrix/README.md) | SaaS | India | `nyrix` |
| [BlueMetal Pro](brands/bluemetal-pro/README.md) | SaaS | India | `bluemetal-pro` |

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/haneesh17-nirix/seo-pipeline.git
cd seo-pipeline
npm install
cp .env.example .env
```

### 2. Set up GSC credentials

Follow **[docs/gsc-setup.md](docs/gsc-setup.md)** for each brand.
Place credentials at `brands/<slug>/gsc-credentials.json` (gitignored).

### 3. (First time) Deploy Azure VM

```bash
cd infra && ./deploy.sh
```

Provisions Ollama + Llama 3.2 on a VM in **UAE North** (`20.216.5.173`).
Required only for content generation. Tracking needs no VM.

### 4. Open SSH tunnel (for content generation)

```bash
ssh -i ~/.ssh/id_rsa_habun_seo \
    -L 11434:localhost:11434 \
    seouser@20.216.5.173 -N &
```

### 5. Run commands

```bash
# List brands
seo brand list

# Generate content
seo generate --brand habun-rak --type blog-post --keyword "restaurant in Ras Al Khaimah"
seo generate --brand bluemetal-pro --type faq --all

# Track rankings
seo track --brand habun-rak
seo track-all                    # all brands with GSC credentials

# Sitemap + schema
seo sitemap --brand habun-rak
seo schema  --brand habun-rak
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `seo brand list` | List all brands with GSC status |
| `seo brand add` | Interactive wizard to add a new brand |
| `seo brand show <slug>` | Show keyword groups for a brand |
| `seo generate --brand <slug> --type <type> --keyword "..."` | Generate a single piece of content |
| `seo generate --brand <slug> --type <type> --group <group>` | Generate for a keyword group |
| `seo generate --brand <slug> --type <type> --all` | Generate for all brand keywords |
| `seo track --brand <slug>` | Fetch rankings from Google Search Console |
| `seo track-all` | Track all brands that have GSC credentials |
| `seo sitemap --brand <slug>` | Generate `sitemap.xml` |
| `seo schema --brand <slug>` | Generate JSON-LD schema markup |
| `seo report --brand <slug>` | Print latest rank snapshot |

Content types: `blog-post` · `landing-page` · `meta-tags` · `faq`

---

## Output

Each brand has isolated output directories:

```
brands/<slug>/
├── output/          ← sitemap.xml, schema/*.jsonld, generated content
├── reports/         ← report-YYYY-MM-DD.md, data-YYYY-MM-DD.json
└── logs/            ← rank-history.json (rolling 90 days)
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/PIPELINE.md](docs/PIPELINE.md) | Full system docs — architecture, CLI, infra, workflow |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Auto-maintained architecture notes |
| [docs/DESIGN.md](docs/DESIGN.md) | Design decisions |
| [docs/API.md](docs/API.md) | API / module reference |
| [docs/gsc-setup.md](docs/gsc-setup.md) | Google Search Console setup guide |
| [docs/HABUN-SEO-STRATEGY.md](docs/HABUN-SEO-STRATEGY.md) | Full SEO strategy for Habun (UAE restaurants) |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Infrastructure

- Azure VM `habun-seo-ollama` — UAE North — `20.216.5.173`
- Resource group: `habun-seo-rg`
- SSH key: `~/.ssh/id_rsa_habun_seo`

```bash
# Stop VM when not generating content (saves cost)
az vm deallocate -g habun-seo-rg -n habun-seo-ollama

# Start again
az vm start -g habun-seo-rg -n habun-seo-ollama
```

---

## Recommended Weekly Workflow

1. **Monday** — GitHub Actions auto-runs `seo track-all`, commits reports
2. **As needed** — Start VM, open SSH tunnel, generate content for lagging keywords
3. **Publish** — Copy output Markdown/JSON into your CMS or website
4. **Monthly** — Review `brands/*/reports/` for ranking trends
