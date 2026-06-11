# Nyrix

**Brand slug:** `nyrix`
**Type:** SaaS
**Site:** https://www.nyrix.aazhara.in
**Target country:** India (in / ind)
**Languages:** English

---

## About

Nyrix is a smart tracking and asset management platform — request tracking software, asset tracking software, and operations management.

---

## Keyword Groups

### Tracking Systems
Target page: `/tracking-software`
Schema: `SoftwareApplication`

Core category keywords — high intent, target users searching for a tracking/asset management solution.

| Keyword | Intent |
|---------|--------|
| tracking systems | Broad / awareness |
| tracking software | Broad / awareness |
| request tracking software | High intent |
| asset tracking software | High intent |
| asset tracking system | High intent |
| request management software | High intent |
| Nyrix tracking system | Brand |

### Brand
Target page: `/`
Schema: `SoftwareApplication`

| Keyword |
|---------|
| Nyrix |
| Nyrix software |
| Nyrix app |
| Nyrix asset tracking |
| Nyrix review |

---

## Pages

| Path | Label | Priority |
|------|-------|----------|
| `/` | Home | 1.0 |
| `/tracking-software` | Tracking Software | 0.85 |
| `/pricing` | Pricing | 0.9 |
| `/about` | About | 0.7 |

---

## API Endpoints

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/api/health` | 200 | Health check |
| GET | `/api/assets` | 200 | Assets API |

---

## Pipeline Commands

```bash
# Generate content (Ollama must be running locally or via tunnel)
seo generate --brand nyrix --type blog-post --keyword "asset tracking software"
seo generate --brand nyrix --type landing-page --group "Tracking Systems"
seo generate --brand nyrix --type meta-tags --all
seo generate --brand nyrix --type faq --all

# Track rankings
seo track --brand nyrix
seo track --brand nyrix --group "Tracking Systems"

# Generate sitemap + schema
seo sitemap --brand nyrix    # → brands/nyrix/output/sitemap.xml
seo schema  --brand nyrix    # → brands/nyrix/output/schema/*.jsonld

# View latest report
seo report --brand nyrix
```

---

## Ollama / Content Generation

Nyrix targets India — content can be generated using a **local Ollama instance** (no SSH tunnel needed for this brand). The Azure VM in UAE North can also be used if the local machine is unavailable.

```bash
# Option A: local Ollama
ollama serve &
# No OLLAMA_HOST override needed — defaults to http://localhost:11434

# Option B: Azure VM tunnel (if running from India and want consistency)
ssh -i ~/.ssh/id_rsa_habun_seo -L 11434:localhost:11434 seouser@20.216.5.173 -N &
```

---

## GSC Setup

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property `https://www.nyrix.aazhara.in`
3. Create a service account and download the JSON key
4. Save as `brands/nyrix/gsc-credentials.json` (gitignored)

Full instructions: [docs/gsc-setup.md](../../docs/gsc-setup.md)

---

## Output Directories

| Directory | Contents |
|-----------|----------|
| `brands/nyrix/output/` | sitemap.xml, schema/*.jsonld, generated content |
| `brands/nyrix/reports/` | report-YYYY-MM-DD.md, data-YYYY-MM-DD.json |
| `brands/nyrix/logs/` | rank-history.json (rolling 90 days) |

---

## SEO Focus Areas

1. **Category keywords** — rank for generic terms like "asset tracking software" and "request tracking software" where there is a large search volume
2. **Long-tail intent** — "request management software for small teams", "asset tracking system India"
3. **Brand search** — dominate all searches for "Nyrix" with schema-rich results
4. **Schema.org SoftwareApplication** — enables rich results (star ratings, pricing, download count)

---

## Related

- [BlueMetal Pro](../bluemetal-pro/README.md) — sister brand (crusher/operations SaaS)
- [Pipeline docs](../../docs/PIPELINE.md) — full CLI reference
