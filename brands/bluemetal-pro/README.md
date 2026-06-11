# BlueMetal Pro

**Brand slug:** `bluemetal-pro`
**Type:** SaaS
**Site:** https://www.blumetal.pro
**Target country:** India (in / ind)
**Languages:** English

---

## About

BlueMetal Pro is a professional-grade app suite for industrial operations — specialising in crusher management and operations software for the mining and quarry industry.

---

## Keyword Groups

### Crusher Apps
Target page: `/crusher-app`
Schema: `SoftwareApplication`

Primary category — users searching for a crusher management solution.

| Keyword | Intent |
|---------|--------|
| best crusher app | High intent |
| crusher apps | Broad |
| crusher application | Broad |
| top crusher software | High intent |
| BlueMetal Pro crusher app | Brand + category |
| crusher management software | High intent |

### Brand
Target page: `/`
Schema: `SoftwareApplication`

| Keyword |
|---------|
| BlueMetal Pro |
| BlueMetal Pro software |
| BlueMetal Pro app |
| BlueMetal Pro review |

---

## Pages

| Path | Label | Priority |
|------|-------|----------|
| `/` | Home | 1.0 |
| `/crusher-app` | Crusher App | 0.85 |
| `/pricing` | Pricing | 0.9 |
| `/about` | About | 0.7 |

---

## API Endpoints

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/api/health` | 200 | Health check |
| GET | `/api/crushers` | 200 | Crushers API |

---

## Pipeline Commands

```bash
# Generate content
seo generate --brand bluemetal-pro --type blog-post --keyword "best crusher app"
seo generate --brand bluemetal-pro --type landing-page --group "Crusher Apps"
seo generate --brand bluemetal-pro --type meta-tags --all
seo generate --brand bluemetal-pro --type faq --all

# Track rankings
seo track --brand bluemetal-pro
seo track --brand bluemetal-pro --group "Crusher Apps"

# Generate sitemap + schema
seo sitemap --brand bluemetal-pro    # → brands/bluemetal-pro/output/sitemap.xml
seo schema  --brand bluemetal-pro    # → brands/bluemetal-pro/output/schema/*.jsonld

# View latest report
seo report --brand bluemetal-pro
```

---

## Ollama / Content Generation

BlueMetal Pro targets India — Ollama can run locally.

```bash
# Local Ollama (recommended for India-targeted brands)
ollama serve &
# OLLAMA_HOST defaults to http://localhost:11434

# Override model if needed
OLLAMA_MODEL=llama3.2 seo generate --brand bluemetal-pro ...
```

---

## GSC Setup

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property `https://www.blumetal.pro`
3. Create a service account and download the JSON key
4. Save as `brands/bluemetal-pro/gsc-credentials.json` (gitignored)

Full instructions: [docs/gsc-setup.md](../../docs/gsc-setup.md)

---

## Output Directories

| Directory | Contents |
|-----------|----------|
| `brands/bluemetal-pro/output/` | sitemap.xml, schema/*.jsonld, generated content |
| `brands/bluemetal-pro/reports/` | report-YYYY-MM-DD.md, data-YYYY-MM-DD.json |
| `brands/bluemetal-pro/logs/` | rank-history.json (rolling 90 days) |

---

## SEO Focus Areas

1. **Niche dominance** — "crusher app" and "crusher management software" are low-competition terms; realistic first-page ranking with quality content
2. **Long-tail** — "crusher management software for quarry", "best crusher app India", "stone crusher app"
3. **Schema.org SoftwareApplication** — rich results: star rating, platform, offer
4. **Content strategy** — blog posts explaining crusher management, ROI of software vs manual, industry guides — builds topical authority
5. **Brand search** — structured data + consistent NAP ensures brand queries return sitelinks

---

## Related

- [Nyrix](../nyrix/README.md) — sister brand (asset/request tracking SaaS)
- [Pipeline docs](../../docs/PIPELINE.md) — full CLI reference
