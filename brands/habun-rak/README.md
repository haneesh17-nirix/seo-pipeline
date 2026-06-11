# Habun — Ras Al Khaimah

**Brand slug:** `habun-rak`
**Type:** Restaurant
**Site:** https://habun.ae
**Target country:** UAE (ae / are)
**Languages:** English, Arabic

---

## SEO Strategy

White-hat, GEO/AEO-first approach targeting diners in Ras Al Khaimah via organic search and AI answer engines (Google SGE, ChatGPT, Perplexity).

Full strategy document: [docs/HABUN-SEO-STRATEGY.md](../../docs/HABUN-SEO-STRATEGY.md)

---

## Keyword Groups

### Brand
Target page: `/`
Schema: `Restaurant`

| Keyword |
|---------|
| Habun restaurant |
| Habun UAE |
| Habun RAK |
| Habun Ras Al Khaimah |
| Habun menu |

### Local RAK
Target page: `/ras-al-khaimah`
Schema: `Restaurant`

| Keyword |
|---------|
| restaurant in Ras Al Khaimah |
| best restaurant Ras Al Khaimah |
| family restaurant RAK |
| casual dining Ras Al Khaimah |
| where to eat in RAK |
| halal restaurant Ras Al Khaimah |
| restaurants near me RAK |

### AI & Voice (GEO/AEO)
Target page: `/ras-al-khaimah`
Schema: `Restaurant`

These keywords are phrased as conversational queries so answers rank in AI engines (Google SGE, ChatGPT, Perplexity).

| Keyword |
|---------|
| best restaurant near me Ras Al Khaimah |
| good family restaurant in RAK UAE |
| where should I eat in Ras Al Khaimah |
| top rated restaurants RAK 2025 |

### Menu & Food
Target page: `/menu`
Schema: `Menu`

| Keyword |
|---------|
| Habun menu prices |
| halal food Ras Al Khaimah |
| Arabic restaurant RAK |
| best grills RAK |

---

## Pages

| Path | Label | Priority |
|------|-------|----------|
| `/` | Home | 1.0 |
| `/menu` | Menu | 0.85 |
| `/ras-al-khaimah` | RAK Location | 0.85 |
| `/about` | About | 0.7 |
| `/reservations` | Reservations | 0.7 |
| `/contact` | Contact | 0.7 |

---

## API Endpoints

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/api/menu` | 200 | Menu API |
| GET | `/api/locations` | 200 | Locations API |
| POST | `/api/reservations` | 201 | Reservations API |

---

## Pipeline Commands

```bash
# Generate content (requires SSH tunnel to Azure VM)
seo generate --brand habun-rak --type blog-post --keyword "restaurant in Ras Al Khaimah"
seo generate --brand habun-rak --type meta-tags --group "Local RAK"
seo generate --brand habun-rak --type faq --all

# Track rankings (requires gsc-credentials.json)
seo track --brand habun-rak
seo track --brand habun-rak --group "Local RAK"

# Generate sitemap + schema
seo sitemap --brand habun-rak    # → output/sitemap.xml
seo schema  --brand habun-rak    # → output/schema/*.jsonld

# View latest report
seo report --brand habun-rak
```

---

## GSC Setup

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property `https://habun.ae`
3. Create a service account and download the JSON key
4. Save as `brands/habun-rak/gsc-credentials.json` (gitignored)
5. Grant the service account **Restricted** access to the property

Full instructions: [docs/gsc-setup.md](../../docs/gsc-setup.md)

---

## Ollama / Content Generation

All content for this brand is generated via the Azure VM in **UAE North** so that AI suggestions are location-aware.

```bash
# Open SSH tunnel before running generate
ssh -i ~/.ssh/id_rsa_habun_seo -L 11434:localhost:11434 seouser@20.216.5.173 -N &
```

Model: `llama3.2` (configured in `brand.json`)

---

## Output Directories

| Directory | Contents |
|-----------|----------|
| `brands/habun-rak/output/` | sitemap.xml, schema/*.jsonld, generated content |
| `brands/habun-rak/reports/` | report-YYYY-MM-DD.md, data-YYYY-MM-DD.json |
| `brands/habun-rak/logs/` | rank-history.json (rolling 90 days) |

---

## Related

- [Habun Sharjah](../habun-sharjah/README.md) — same site, different location keywords
- [SEO Strategy](../../docs/HABUN-SEO-STRATEGY.md) — full 90-day plan, GEO/AEO, GBP, citations
- [Pipeline docs](../../docs/PIPELINE.md) — full CLI reference
