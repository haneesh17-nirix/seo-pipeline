# Google Search Console Setup (Free — 30 minutes)

This is a one-time setup. After this, tracking is completely free forever.

---

## Step 1 — Verify your site in Google Search Console

1. Go to **https://search.google.com/search-console**
2. Sign in with your Google account
3. Click **"Add property"** → choose **"URL prefix"**
4. Enter: `https://www.nyrix.aazhara.in`
5. Google gives you 5 verification options — the easiest is **HTML tag**:
   - Copy the `<meta>` tag it gives you
   - Add it inside the `<head>` of your homepage HTML
   - Click **Verify**

> If you can't edit your HTML, choose **"Domain"** property type instead and add a TXT record to your DNS (at wherever you registered `aazhara.in`).

---

## Step 2 — Create a Google Cloud project and service account

This allows the pipeline to read your GSC data automatically.

### 2a. Create a Google Cloud project
1. Go to **https://console.cloud.google.com/**
2. Click the project dropdown → **New Project**
3. Name it `seo-pipeline` → Create

### 2b. Enable the Search Console API
1. In your new project, go to **APIs & Services → Library**
2. Search for **"Google Search Console API"**
3. Click it → **Enable**

### 2c. Create a service account
1. Go to **APIs & Services → Credentials**
2. Click **"Create Credentials"** → **"Service account"**
3. Name: `seo-tracker` → Click through, no special roles needed → Done
4. Click the service account you just created → **Keys** tab
5. **Add Key → Create new key → JSON** → Download the file
6. **Rename it `gsc-credentials.json`** and place it in the root of this project
   - It is already in `.gitignore` — it will NEVER be committed

### 2d. Add the service account to Search Console
1. Copy the service account's email address (looks like `seo-tracker@seo-pipeline-xxxxx.iam.gserviceaccount.com`)
2. In Google Search Console, go to your property → **Settings → Users and permissions**
3. Click **"Add user"** → paste the service account email → Role: **Restricted** (read-only) → Add

**Done.** The pipeline can now read your keyword data from Google.

---

## Step 3 — For GitHub Actions (automated weekly tracking)

1. Open your GitHub repo → **Settings → Secrets and variables → Actions**
2. Click **"New repository secret"**
3. Name: `GSC_CREDENTIALS_JSON`
4. Value: paste the entire contents of your `gsc-credentials.json` file

The weekly workflow will then run automatically every Monday.

---

## Notes

- GSC data has a **2-3 day delay** — this is normal, not a bug.
- Your site needs to have **Google Search traffic** for data to appear.
  If the site is new, submit your sitemap first: GSC → Sitemaps → paste your sitemap URL.
- Free usage limits are extremely generous (25,000 queries/day).
