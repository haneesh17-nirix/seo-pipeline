# Habun — Sharjah

**Brand slug:** `habun-sharjah`
**Type:** Restaurant
**Site:** https://habun.ae
**Target country:** UAE (ae / are)
**Languages:** English, Arabic

---

## SEO Strategy

Same white-hat, GEO/AEO-first approach as the RAK brand, with keywords and pages targeting Sharjah diners specifically. Both brands share the same domain (`habun.ae`) but use separate GSC credentials and keyword groups to allow independent tracking.

Full strategy document: [docs/HABUN-SEO-STRATEGY.md](../../docs/HABUN-SEO-STRATEGY.md)

---

## Keyword Groups

### Brand Sharjah
Target page: `/sharjah`
Schema: `Restaurant`

| Keyword |
|---------|
| Habun Sharjah |
| Habun restaurant Sharjah |
| Habun menu Sharjah |

### Local Sharjah
Target page: `/sharjah`
Schema: `Restaurant`

| Keyword |
|---------|
| restaurant in Sharjah |
| best restaurant Sharjah |
| family restaurant Sharjah |
| casual dining Sharjah |
| where to eat Sharjah |
| halal restaurant Sharjah |
| dine in Sharjah |
| restaurants near me Sharjah |

### AI & Voice (GEO/AEO)
Target page: `/sharjah`
Schema: `Restaurant`

Conversational queries designed to appear in Google SGE, ChatGPT, and Perplexity answers.

| Keyword |
|---------|
| best restaurant near me Sharjah |
| good family restaurant in Sharjah UAE |
| where should I eat in Sharjah |
| top rated restaurants Sharjah 2025 |
| restaurant with parking Sharjah |

---

## Pages

| Path | Label | Priority |
|------|-------|----------|
| `/` | Home | 1.0 |
| `/menu` | Menu | 0.85 |
| `/sharjah` | Sharjah Location | 0.85 |
| `/about` | About | 0.7 |
| `/reservations` | Reservations | 0.7 |
| `/contact` | Contact | 0.7 |

---

## API Endpoints

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/api/menu` | 200 | Menu API |
| GET | `/api/locations` | 200 | Locations API |

---

## Pipeline Commands

```bash
# Generate content (requires SSH tunnel to Azure VM)
seo generate --brand habun-sharjah --type blog-post --keyword "restaurant in Sharjah"
seo generate --brand habun-sharjah --type meta-tags --group "Local Sharjah"
seo generate --brand habun-sharjah --type faq --all

# Track rankings (requires gsc-credentials.json)
seo track --brand habun-sharjah
seo track --brand habun-sharjah --group "AI & Voice"

# Generate sitemap + schema
seo sitemap --brand habun-sharjah    # → output/sitemap.xml
seo schema  --brand habun-sharjah    # → output/schema/*.jsonld

# View latest report
seo report --brand habun-sharjah
```

---

## GSC Setup

This brand uses a **separate GSC service account** from the RAK brand, even though they share the same domain. This allows independent keyword tracking per location.

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property `https://habun.ae` (if not already added)
3. Create a **new** service account for Sharjah tracking
4. Download the JSON key and save as `brands/habun-sharjah/gsc-credentials.json` (gitignored)

Full instructions: [docs/gsc-setup.md](../../docs/gsc-setup.md)

---

## Ollama / Content Generation

All content is generated via the Azure VM in **UAE North** — location-accurate for Sharjah.

```bash
# Open SSH tunnel before running generate
ssh -i ~/.ssh/id_rsa_habun_seo -L 11434:localhost:11434 seouser@20.216.5.173 -N &
```

---

## Output Directories

| Directory | Contents |
|-----------|----------|
| `brands/habun-sharjah/output/` | sitemap.xml, schema/*.jsonld, generated content |
| `brands/habun-sharjah/reports/` | report-YYYY-MM-DD.md, data-YYYY-MM-DD.json |
| `brands/habun-sharjah/logs/` | rank-history.json (rolling 90 days) |

---

## Difference from habun-rak

| | habun-rak | habun-sharjah |
|---|---|---|
| Target city | Ras Al Khaimah | Sharjah |
| Location page | `/ras-al-khaimah` | `/sharjah` |
| Keyword focus | RAK dining, halal, family | Sharjah dining, parking, halal |
| GSC credentials | Separate | Separate |

---

## Related

- [Habun RAK](../habun-rak/README.md) — RAK location docs
- [SEO Strategy](../../docs/HABUN-SEO-STRATEGY.md) — full 90-day plan
- [Pipeline docs](../../docs/PIPELINE.md) — full CLI reference
