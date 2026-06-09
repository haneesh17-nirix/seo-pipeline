# SEO Pipeline — Nyrix / BlueMetal Pro

**100% free.** No paid APIs. Runs on Azure with a local LLM.

| Module | Tool | Cost |
|--------|------|------|
| Content generation | Ollama + Llama 3.2 (Azure VM) | ~$0* |
| Keyword tracking | Google Search Console API | Free |
| Sitemap generator | Built-in | Free |
| Schema markup | Built-in | Free |
| Automated tracking | GitHub Actions (weekly) | Free |

*VM costs ~$5/day when running. Deallocate when not generating content — tracking runs from GitHub Actions.

---

## Quick start

### 1 — Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/seo-pipeline.git
cd seo-pipeline
npm install
cp .env.example .env
```

### 2 — Set up Google Search Console (one-time, ~30 min)
See **[docs/gsc-setup.md](docs/gsc-setup.md)** — step-by-step with screenshots.

### 3 — Deploy the Azure VM (one-time)
```bash
cd infra
chmod +x deploy.sh
./deploy.sh
```
This provisions a VM with Ollama + Llama 3.2 pre-installed.

### 4 — Run the pipeline

**Generate content** (requires VM + SSH tunnel):
```bash
# Open SSH tunnel to Ollama on the VM (run once, keep it open)
ssh -i ~/.ssh/id_rsa_seo_ollama -L 11434:localhost:11434 seouser@<VM_IP> -N &

# Generate a blog post
npm run dev -- generate --type blog-post --keyword "best crusher app"

# Generate meta tags for a whole group
npm run dev -- generate --type meta-tags --group "Crusher Apps"

# Generate FAQs for all keywords
npm run dev -- generate --type faq --all
```

**Track rankings** (no VM needed — uses Google Search Console):
```bash
npm run dev -- track
```

**Generate sitemap** (upload to your website root):
```bash
npm run dev -- sitemap
# → output/sitemap.xml
```

**Generate schema markup** (paste into your pages' <head>):
```bash
npm run dev -- schema
# → output/schema/*.jsonld
```

---

## Commands reference

| Command | Description |
|---------|-------------|
| `seo keywords` | List all 23 configured keywords |
| `seo generate --type blog-post --keyword "..."` | Write a full SEO blog post |
| `seo generate --type landing-page --keyword "..."` | Write landing page copy |
| `seo generate --type meta-tags --group "Crusher Apps"` | Title/meta JSON for a group |
| `seo generate --type faq --all` | FAQ blocks for every keyword |
| `seo track` | Fetch positions from Google Search Console |
| `seo track --group "Tracking Systems"` | Track one group only |
| `seo sitemap` | Generate sitemap.xml |
| `seo schema` | Generate JSON-LD schema markup |
| `seo report` | Print latest snapshot from history |

---

## Adding keywords

Edit [`src/keywords/config.ts`](src/keywords/config.ts).

---

## Cost management

```bash
# Stop VM when not in use (saves ~$5/day)
az vm deallocate --resource-group seo-pipeline-rg --name seo-ollama

# Restart it
az vm start --resource-group seo-pipeline-rg --name seo-ollama
```

Tracking runs automatically via GitHub Actions — the VM does not need to be running for that.

---

## Recommended weekly workflow

1. **Monday** — GitHub Actions auto-runs `seo track` and commits results
2. **As needed** — Start VM, open SSH tunnel, generate content for lagging keywords
3. **Publish** — Copy generated Markdown/JSON into your CMS or website
4. **Monthly** — Check `reports/` folder to see ranking trends
