# API / Interface Documentation

> Auto-maintained. Updated whenever route or handler files change.

## CLI Commands

| Command | Description |
|---------|-------------|
| `seo generate --type blog-post --keyword "..."\ | Generate a blog post |
| `seo generate --type landing-page --keyword "..."` | Generate landing page copy |
| `seo generate --type meta-tags --group "Crusher Apps"` | Generate meta tags for a group |
| `seo generate --type faq --all` | Generate FAQs for all keywords |
| `seo track` | Pull keyword positions from Google Search Console |
| `seo track --group "Tracking Systems"` | Track one keyword group |
| `seo sitemap` | Generate sitemap.xml |
| `seo schema` | Generate JSON-LD schema markup |
| `seo report` | Print latest rank snapshot |
| `seo keywords` | List all configured keywords |

## External APIs Used

| API | Auth | Cost | Purpose |
|-----|------|------|---------|
| Ollama (`/api/generate`) | None (local) | Free | Content generation |
| Google Search Console API | Service account JSON | Free | Keyword rank data |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SITE_URL` | Yes | Your website URL |
| `OLLAMA_HOST` | Yes | Ollama server (local or via SSH tunnel) |
| `OLLAMA_MODEL` | No | LLM model, default: llama3.2 |
| `GSC_CREDENTIALS_FILE` | Yes (for track) | Path to Google service account JSON |
| `GSC_SITE_URL` | Yes (for track) | Site URL as registered in GSC |
| `TARGET_COUNTRY` | No | Country filter, default: in |

## Change History

