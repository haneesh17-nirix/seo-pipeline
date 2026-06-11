import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as readline from "readline";

export interface GscRow {
  keyword: string;
  position: number;
  clicks: number;
  impressions: number;
  ctr: number;
  checkedAt: string;
}

interface StoredHistory {
  [keyword: string]: GscRow[];
}

// Stored credentials file can be:
//   - service_account: standard GCP service account JSON (type: "service_account")
//   - oauth2: { type: "oauth2", client_id, client_secret, refresh_token }
interface OAuth2Credentials {
  type: "oauth2";
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

const GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

// ── history storage ────────────────────────────────────────────────────────────

function historyFile(brandSlug?: string): string {
  if (brandSlug) return path.join(process.cwd(), "brands", brandSlug, "logs", "rank-history.json");
  return path.join(process.cwd(), "data", "rank-history.json");
}

function loadHistory(brandSlug?: string): StoredHistory {
  const file = historyFile(brandSlug);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveHistory(h: StoredHistory, brandSlug?: string): void {
  const file = historyFile(brandSlug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(h, null, 2), "utf8");
}

// ── auth ───────────────────────────────────────────────────────────────────────

async function getAuthClient(credFile: string) {
  const absPath = path.resolve(process.cwd(), credFile);

  if (!fs.existsSync(absPath)) {
    throw new Error(
      `GSC credentials not found at ${absPath}\n` +
      `Run: seo auth --brand <slug>  to set up OAuth2 credentials\n` +
      `Or follow docs/gsc-setup.md for service account setup.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(absPath, "utf8"));

  if (credentials.type === "oauth2") {
    // OAuth2 user credentials (refresh token flow)
    const oauth2 = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret
    );
    oauth2.setCredentials({ refresh_token: credentials.refresh_token });
    return oauth2;
  }

  // Service account JSON
  return new google.auth.GoogleAuth({ credentials, scopes: GSC_SCOPES });
}

// ── OAuth2 browser flow ────────────────────────────────────────────────────────

const REDIRECT_PORT = 4242;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

export async function runOAuth2Flow(
  clientId: string,
  clientSecret: string,
  outputFile: string
): Promise<void> {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GSC_SCOPES,
  });

  console.log("\n────────────────────────────────────────────────────");
  console.log("  Open this URL in your browser to authorise access:");
  console.log("────────────────────────────────────────────────────\n");
  console.log(`  ${authUrl}\n`);

  // Try to open the browser automatically
  const { exec } = await import("child_process");
  exec(`open "${authUrl}" 2>/dev/null || xdg-open "${authUrl}" 2>/dev/null || true`);

  // Start local server to catch the redirect
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family:sans-serif;padding:40px">
          <h2>✓ Authorised</h2>
          <p>You can close this tab and return to the terminal.</p>
          </body></html>
        `);
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end("Missing code");
        reject(new Error("OAuth2 callback missing code"));
      }
    });
    server.listen(REDIRECT_PORT, () => {
      console.log(`  Waiting for browser callback on port ${REDIRECT_PORT}...`);
    });
    server.on("error", reject);
    // Timeout after 5 minutes
    setTimeout(() => { server.close(); reject(new Error("Auth timeout")); }, 300_000);
  });

  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. If you've authorised this app before, " +
      "go to https://myaccount.google.com/permissions and revoke access, then try again."
    );
  }

  const stored: OAuth2Credentials = {
    type: "oauth2",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(stored, null, 2), "utf8");

  console.log(`\n✓ Credentials saved to ${outputFile}`);
  console.log("  Refresh token stored — no expiry, no re-auth needed.\n");
}

// ── GSC data fetch ─────────────────────────────────────────────────────────────

export async function fetchGscData(
  keywords: string[],
  country: string = "ind",
  daysBack: number = 7,
  credFile?: string
): Promise<GscRow[]> {
  const siteUrl = process.env.GSC_SITE_URL ?? process.env.SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL not set");

  const resolvedCredFile = credFile ?? process.env.GSC_CREDENTIALS_FILE ?? "./gsc-credentials.json";
  const auth = await getAuthClient(resolvedCredFile);
  const sc = google.searchconsole({ version: "v1", auth: auth as any });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - daysBack);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ["query"],
      dimensionFilterGroups: [
        { filters: [{ dimension: "country", operator: "equals", expression: country.toLowerCase() }] },
      ],
      rowLimit: 1000,
    },
  });

  const rows = res.data.rows ?? [];
  const checkedAt = new Date().toISOString();

  const lookup: Record<string, GscRow> = {};
  for (const row of rows) {
    const query = (row.keys?.[0] ?? "").toLowerCase();
    lookup[query] = {
      keyword: query,
      position: Math.round(row.position ?? 100),
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: Math.round((row.ctr ?? 0) * 10000) / 100,
      checkedAt,
    };
  }

  return keywords.map((kw) => {
    const found = lookup[kw.toLowerCase()];
    return found ?? { keyword: kw, position: 0, clicks: 0, impressions: 0, ctr: 0, checkedAt };
  });
}

export async function trackAndSave(
  keywords: string[],
  country: string = "in",
  brandSlug?: string
): Promise<GscRow[]> {
  const countryCode = country.length === 2
    ? { us: "usa", in: "ind", gb: "gbr", au: "aus", ca: "can", ae: "are" }[country] ?? country
    : country;

  console.log(`\nFetching GSC data for ${keywords.length} keywords...\n`);
  const results = await fetchGscData(keywords, countryCode);

  const history = loadHistory(brandSlug);
  for (const row of results) {
    if (!history[row.keyword]) history[row.keyword] = [];
    history[row.keyword].push(row);
    if (history[row.keyword].length > 90) history[row.keyword].shift();
  }
  saveHistory(history, brandSlug);

  return results;
}

export function getHistory(keyword: string, brandSlug?: string): GscRow[] {
  return loadHistory(brandSlug)[keyword] ?? [];
}

export function getPositionDelta(keyword: string, brandSlug?: string): number | null {
  const entries = getHistory(keyword, brandSlug);
  if (entries.length < 2) return null;
  const a = entries[entries.length - 2].position;
  const b = entries[entries.length - 1].position;
  if (!a || !b) return null;
  return b - a;
}
