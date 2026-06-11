# Google Search Console Setup

Two auth methods are supported. Use **OAuth2** if your organisation blocks service account key downloads (`iam.disableServiceAccountKeyCreation`). Otherwise either works.

| Method | When to use |
|--------|-------------|
| **OAuth2 Desktop** ← recommended | Org policy blocks service account keys; personal accounts |
| Service account JSON | Unmanaged GCP projects; CI/CD with secret injection |

---

## Method A — OAuth2 (recommended, works under org policy)

### Step 1 — Enable the API

1. Go to **https://console.cloud.google.com**
2. Select or create a project
3. **APIs & Services → Library** → search **"Google Search Console API"** → Enable

### Step 2 — Create OAuth2 Desktop credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Desktop app**
3. Name: `seo-pipeline` → Create
4. Copy the **Client ID** and **Client Secret** (shown on screen, or download the JSON)

> These are NOT service account keys — they are not blocked by `iam.disableServiceAccountKeyCreation`.

### Step 3 — Configure OAuth consent screen (first time only)

1. **APIs & Services → OAuth consent screen**
2. User type: **External** → Create
3. App name: `seo-pipeline`, add your email as a test user → Save
4. Scopes: add `https://www.googleapis.com/auth/webmasters.readonly`

### Step 4 — Add credentials to .env

```bash
# .env
GSC_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GSC_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

### Step 5 — Run the auth command

```bash
seo auth --brand nyrix
```

This opens your browser. Log in with the Google account that has access to the GSC property. On success, `brands/nyrix/gsc-credentials.json` is created with a refresh token — no re-auth needed.

To authorise other brands (each can use the same or different Google account):

```bash
seo auth --brand habun-rak
seo auth --brand habun-sharjah
seo auth --brand bluemetal-pro
```

### Step 6 — Add the Google account to Search Console

If the Google account you logged in with doesn't already have access to the property:

1. Go to **https://search.google.com/search-console**
2. Open the property → **Settings → Users and permissions → Add user**
3. Add the email you used to log in → Role: **Restricted** → Add

---

## Method B — Service account JSON

Use this if your GCP project does not have the `iam.disableServiceAccountKeyCreation` org policy.

1. **APIs & Services → Credentials → Create Credentials → Service account**
2. Name: `seo-tracker` → Done
3. Click the service account → **Keys → Add Key → Create new key → JSON** → Download
4. Save as `brands/<slug>/gsc-credentials.json` (gitignored)
5. Add the service account email to your GSC property: **Settings → Users and permissions → Add user** → Role: **Restricted**

---

## Verifying it works

```bash
seo track --brand nyrix
```

If you see keyword positions (or `no data` for new sites), auth is working.

> GSC data has a **2–3 day delay** — this is normal.
> New sites with little traffic may show `no data` until Google indexes them.

---

## GitHub Actions (CI tracking)

For automated weekly tracking in GitHub Actions, store the contents of the credentials file as a repository secret:

1. **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `GSC_CREDENTIALS_NYRIX`
3. Value: paste the full contents of `brands/nyrix/gsc-credentials.json`

Repeat for each brand. The workflow reads these secrets and writes them to the expected path before running.
