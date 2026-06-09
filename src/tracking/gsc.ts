import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

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

const HISTORY_FILE = path.join(process.cwd(), "data", "rank-history.json");

function loadHistory(): StoredHistory {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
}

function saveHistory(h: StoredHistory): void {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2), "utf8");
}

function getAuthClient() {
  const credFile = process.env.GSC_CREDENTIALS_FILE ?? "./gsc-credentials.json";
  const absPath = path.resolve(process.cwd(), credFile);

  if (!fs.existsSync(absPath)) {
    throw new Error(
      `GSC credentials not found at ${absPath}\nSee docs/gsc-setup.md for setup instructions.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(absPath, "utf8"));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

// Fetch positions for a list of keywords from Google Search Console
export async function fetchGscData(
  keywords: string[],
  country: string = "ind",
  daysBack: number = 7
): Promise<GscRow[]> {
  const siteUrl = process.env.GSC_SITE_URL ?? process.env.SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL not set in .env");

  const auth = getAuthClient();
  const sc = google.searchconsole({ version: "v1", auth });

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
        {
          filters: [
            {
              dimension: "country",
              operator: "equals",
              expression: country.toLowerCase(),
            },
          ],
        },
      ],
      rowLimit: 1000,
    },
  });

  const rows = res.data.rows ?? [];
  const checkedAt = new Date().toISOString();

  // Build a lookup: query -> metrics
  const lookup: Record<string, GscRow> = {};
  for (const row of rows) {
    const query = (row.keys?.[0] ?? "").toLowerCase();
    lookup[query] = {
      keyword: query,
      position: Math.round(row.position ?? 100),
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: Math.round((row.ctr ?? 0) * 10000) / 100, // percent, 2dp
      checkedAt,
    };
  }

  // Return results in the same order as the input keywords array
  return keywords.map((kw) => {
    const found = lookup[kw.toLowerCase()];
    return (
      found ?? {
        keyword: kw,
        position: 0, // 0 = no data / not appearing
        clicks: 0,
        impressions: 0,
        ctr: 0,
        checkedAt,
      }
    );
  });
}

export async function trackAndSave(
  keywords: string[],
  country: string = "in"
): Promise<GscRow[]> {
  // GSC uses 3-letter country codes
  const countryCode = country.length === 2
    ? { us: "usa", in: "ind", gb: "gbr", au: "aus", ca: "can" }[country] ?? country
    : country;

  console.log(`\nFetching GSC data for ${keywords.length} keywords...\n`);
  const results = await fetchGscData(keywords, countryCode);

  const history = loadHistory();
  for (const row of results) {
    if (!history[row.keyword]) history[row.keyword] = [];
    history[row.keyword].push(row);
    if (history[row.keyword].length > 90) history[row.keyword].shift();
  }
  saveHistory(history);

  return results;
}

export function getHistory(keyword: string): GscRow[] {
  return loadHistory()[keyword] ?? [];
}

export function getPositionDelta(keyword: string): number | null {
  const entries = getHistory(keyword);
  if (entries.length < 2) return null;
  const a = entries[entries.length - 2].position;
  const b = entries[entries.length - 1].position;
  if (!a || !b) return null;
  return b - a; // negative = moved up
}
