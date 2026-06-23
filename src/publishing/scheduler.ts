import * as fs from "fs";
import * as path from "path";
import * as cron from "node-cron";
import { parseReviewFile, updateReviewStatus } from "../approval/discord-bot";
import { postToInstagram, postToFacebook } from "./meta";
import { postToYouTube } from "./youtube";
import { publishBlogPost } from "./blog";

// ── Kerala timezone reference ─────────────────────────────────────────────────
// All scheduling logic uses IST (Asia/Kolkata, UTC+5:30).
// "Time of day" is always relative to what a Keralite actually experiences.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

function istToUtc(ist: Date): Date {
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

// ── Human posting behaviour model ─────────────────────────────────────────────
// Kerala internet/social behaviour patterns, observed:
//   - Morning burst: 7–9am (before work, post-prayer, chai time)
//   - Lunch browse: 12:30–2pm
//   - Evening wind-down: 6–8:30pm (commute, home, family time)
//   - Late night: 10pm–midnight (younger audience, weekend-heavy)
//   - Weekends: volume +40%, timing shifts 1hr later
//   - Onam/Vishu/Christmas/Eid: brief content pause then burst
//   - Never post: 2am–6am (even social media sleeps in Kerala)
//
// Human randomness:
//   - A real person doesn't post at exactly 9:00am every Tuesday
//   - They post when they get a moment: 8:47am, then nothing for 4 days,
//     then two posts on a Saturday afternoon 90 minutes apart
//   - Clusters happen (a productive Sunday evening), then silence for 3 days
//   - No two posts land at the exact same minute

interface PostingWindow {
  startHour: number;    // IST hour
  endHour: number;      // IST hour (exclusive)
  weight: number;       // relative likelihood (higher = more common)
  name: string;
}

const WEEKDAY_WINDOWS: PostingWindow[] = [
  { name: "morning-burst",    startHour: 7,    endHour: 9.5,  weight: 30 },
  { name: "lunch-browse",     startHour: 12.5, endHour: 14,   weight: 20 },
  { name: "evening-unwind",   startHour: 18,   endHour: 20.5, weight: 35 },
  { name: "late-night",       startHour: 22,   endHour: 24,   weight: 15 },
];

const WEEKEND_WINDOWS: PostingWindow[] = [
  { name: "lazy-morning",     startHour: 8.5,  endHour: 11,   weight: 25 },
  { name: "afternoon-peak",   startHour: 14,   endHour: 17,   weight: 35 },
  { name: "evening-prime",    startHour: 18.5, endHour: 21,   weight: 30 },
  { name: "late-night",       startHour: 22,   endHour: 24,   weight: 10 },
];

// Weighted random pick from windows
function pickWindow(windows: PostingWindow[], seed: number): PostingWindow {
  const total = windows.reduce((s, w) => s + w.weight, 0);
  let r = (seed % total + total) % total;
  for (const w of windows) {
    r -= w.weight;
    if (r < 0) return w;
  }
  return windows[windows.length - 1];
}

function isWeekend(d: Date): boolean {
  const day = d.getDay(); // IST weekday
  return day === 0 || day === 6;
}

// ── Gap model ─────────────────────────────────────────────────────────────────
// How long between two consecutive posts.
// Based on content type — blog posts are bigger events, space them further.
// Social posts cluster more.

interface GapConfig {
  minDays: number;
  maxDays: number;
  // Probability of a "cluster" (2 posts within 90min of each other)
  clusterChance: number;
  clusterMaxGapMinutes: number;
}

const GAP_CONFIG: Record<string, GapConfig> = {
  "blog-post":       { minDays: 2,   maxDays: 6,   clusterChance: 0.08, clusterMaxGapMinutes: 180 },
  "social-post":     { minDays: 0.5, maxDays: 3,   clusterChance: 0.25, clusterMaxGapMinutes: 90  },
  "faq-page":        { minDays: 3,   maxDays: 8,   clusterChance: 0.05, clusterMaxGapMinutes: 240 },
  "ad-copy":         { minDays: 4,   maxDays: 10,  clusterChance: 0.02, clusterMaxGapMinutes: 360 },
  "service-landing": { minDays: 5,   maxDays: 14,  clusterChance: 0.03, clusterMaxGapMinutes: 480 },
};

// Seeded pseudo-random (no Math.random — deterministic per file so re-runs produce
// the same schedule for the same content, but each file gets a unique seed)
function seededRandom(seed: number): number {
  // LCG: produces values in [0, 1)
  const a = 1664525, c = 1013904223, m = 2 ** 32;
  return ((a * seed + c) >>> 0) / m;
}

function filenameSeed(filePath: string): number {
  let h = 0;
  for (let i = 0; i < filePath.length; i++) {
    h = (Math.imul(31, h) + filePath.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Core scheduling function ──────────────────────────────────────────────────
// Given the last scheduled post time and a content type, compute the next
// human-feeling timestamp in IST, returned as UTC ISO string.

export function humanScheduleNext(
  afterUtc: Date,
  contentType: string,
  filePath: string
): string {
  const gap = GAP_CONFIG[contentType] ?? GAP_CONFIG["blog-post"];
  const seed = filenameSeed(filePath);
  const r1 = seededRandom(seed);
  const r2 = seededRandom(seed + 1);
  const r3 = seededRandom(seed + 2);
  const r4 = seededRandom(seed + 3);

  // Days to wait before posting — weighted toward shorter gaps (human impatience)
  // Use a power-law-ish distribution: most gaps are shorter, rare long ones
  const range = gap.maxDays - gap.minDays;
  const rawGap = gap.minDays + range * Math.pow(r1, 1.5); // skews shorter
  const gapMs = rawGap * 24 * 60 * 60 * 1000;

  // Base target day in IST
  const afterIST = new Date(afterUtc.getTime() + IST_OFFSET_MS);
  const targetIST = new Date(afterIST.getTime() + gapMs);

  // Weekend bias: if we land Mon-Fri and it's close to a weekend, nudge
  const isWknd = isWeekend(targetIST);
  const windows = isWknd ? WEEKEND_WINDOWS : WEEKDAY_WINDOWS;
  const window = pickWindow(windows, Math.floor(r2 * 1000));

  // Pick a minute within the window — gaussian-ish cluster toward middle
  const windowMinutes = (window.endHour - window.startHour) * 60;
  const gaussOffset = (r3 + r4 - 1) * windowMinutes * 0.4; // -40% to +40% of window
  const midOffset = (window.endHour - window.startHour) / 2 * 60;
  const minuteInWindow = Math.max(0, Math.min(windowMinutes - 1, midOffset + gaussOffset));

  const postHour = window.startHour + minuteInWindow / 60;
  const hours = Math.floor(postHour);
  const minutes = Math.round((postHour - hours) * 60);

  targetIST.setHours(hours, minutes, Math.floor(r1 * 59), 0);

  return istToUtc(targetIST).toISOString();
}

// ── Assign varied schedules to a batch ───────────────────────────────────────
// Given N items approved together, spread them across time with human-like gaps.
// Some may cluster (real people have productive bursts), others space far apart.

export function assignBatchSchedule(
  items: Array<{ filePath: string; contentType: string }>,
  startAfterUtc?: Date
): Map<string, string> {
  const schedule = new Map<string, string>();
  let cursor = startAfterUtc ?? new Date();

  for (const item of items) {
    const seed = filenameSeed(item.filePath);
    const gap = GAP_CONFIG[item.contentType] ?? GAP_CONFIG["blog-post"];
    const r = seededRandom(seed + 99);

    // Cluster check: should this post follow the previous very closely?
    const shouldCluster = r < gap.clusterChance && schedule.size > 0;

    let scheduledUtc: string;
    if (shouldCluster) {
      const clusterMinutes = Math.floor(seededRandom(seed + 88) * gap.clusterMaxGapMinutes) + 20;
      scheduledUtc = new Date(cursor.getTime() + clusterMinutes * 60_000).toISOString();
    } else {
      scheduledUtc = humanScheduleNext(cursor, item.contentType, item.filePath);
    }

    schedule.set(item.filePath, scheduledUtc);
    cursor = new Date(scheduledUtc);
  }

  return schedule;
}

// Platform routing per content type
export const PLATFORM_MAP: Record<string, string[]> = {
  "blog-post":       ["blog"],
  "social-post":     ["instagram", "facebook"],
  "faq-page":        ["blog"],
  "ad-copy":         ["google-ads"],
  "service-landing": ["blog"],
};

// ── Publish queue ─────────────────────────────────────────────────────────────

interface PublishJob {
  filePath: string;
  brand: string;
  contentType: string;
  platforms: string[];
  scheduledFor: string;        // UTC ISO — post goes out at this moment
  scheduledWindow: string;     // human-readable IST window name (for logs)
  status: "queued" | "published" | "failed";
  publishedAt?: string;
  error?: string;
  results?: Record<string, string>;
}

function queueFilePath(): string {
  return path.join(process.cwd(), "logs", "publish-queue.json");
}

export function loadQueue(): PublishJob[] {
  const f = queueFilePath();
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; }
}

function saveQueue(queue: PublishJob[]): void {
  fs.mkdirSync(path.dirname(queueFilePath()), { recursive: true });
  fs.writeFileSync(queueFilePath(), JSON.stringify(queue, null, 2), "utf8");
}

function windowLabel(utcIso: string): string {
  const ist = new Date(new Date(utcIso).getTime() + IST_OFFSET_MS);
  const h = ist.getHours();
  if (h >= 7  && h < 10)  return "morning-burst (IST)";
  if (h >= 12 && h < 14)  return "lunch-browse (IST)";
  if (h >= 18 && h < 21)  return "evening-unwind (IST)";
  if (h >= 22)             return "late-night (IST)";
  return "off-peak (IST)";
}

// ── Enqueue approved items with human scheduling ───────────────────────────────

export function enqueueApproved(brandSlug?: string): number {
  const brandsDir = path.join(process.cwd(), "brands");
  const slugs = brandSlug
    ? [brandSlug]
    : fs.readdirSync(brandsDir).filter((d) => fs.existsSync(path.join(brandsDir, d, "brand.json")));

  const queue = loadQueue();
  const queued = new Set(queue.map((j) => j.filePath));

  // Collect all new approved items
  const newItems: Array<{ filePath: string; contentType: string; brand: string }> = [];

  for (const slug of slugs) {
    const queueDir = path.join(brandsDir, slug, "output", "review-queue");
    if (!fs.existsSync(queueDir)) continue;

    for (const f of fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"))) {
      const filePath = path.join(queueDir, f);
      if (queued.has(filePath)) continue;

      const item = parseReviewFile(filePath);
      if (!item || item.status !== "approved") continue;

      newItems.push({ filePath, contentType: item.contentType ?? "blog-post", brand: item.brand ?? slug });
    }
  }

  if (!newItems.length) return 0;

  // Find the latest already-queued time to start the cascade from
  const latestQueued = queue
    .filter((j) => j.status === "queued")
    .map((j) => new Date(j.scheduledFor).getTime())
    .reduce((max, t) => Math.max(max, t), Date.now());

  const startAfter = new Date(Math.max(latestQueued, Date.now()));
  const scheduleMap = assignBatchSchedule(newItems, startAfter);

  for (const item of newItems) {
    const scheduledFor = scheduleMap.get(item.filePath) ?? new Date(Date.now() + 3_600_000).toISOString();
    queue.push({
      filePath: item.filePath,
      brand: item.brand,
      contentType: item.contentType,
      platforms: PLATFORM_MAP[item.contentType] ?? ["blog"],
      scheduledFor,
      scheduledWindow: windowLabel(scheduledFor),
      status: "queued",
    });
  }

  saveQueue(queue);
  return newItems.length;
}

// ── Publisher ─────────────────────────────────────────────────────────────────

export async function publishDueJobs(dryRun = false): Promise<void> {
  const queue = loadQueue();
  const now = new Date();
  const due = queue.filter((j) => j.status === "queued" && new Date(j.scheduledFor) <= now);

  if (!due.length) {
    console.log("  No jobs due for publishing.");
    return;
  }

  console.log(`  ${due.length} job(s) due for publishing...`);

  for (const job of due) {
    const item = parseReviewFile(job.filePath);
    if (!item) { job.status = "failed"; job.error = "Could not parse review file"; continue; }

    console.log(`\n  [${job.brand}] ${job.contentType} → ${job.platforms.join(", ")}  (${job.scheduledWindow})`);
    job.results = {};

    for (const platform of job.platforms) {
      try {
        if (dryRun) {
          console.log(`    [dry-run] would publish to ${platform}`);
          job.results[platform] = "dry-run";
          continue;
        }

        let url = "";
        switch (platform) {
          case "instagram": url = await postToInstagram(item); break;
          case "facebook":  url = await postToFacebook(item);  break;
          case "youtube":   url = await postToYouTube(item);   break;
          case "blog":      url = await publishBlogPost(item); break;
          case "google-ads":
            console.log(`    ⚠ Google Ads: draft — needs manual budget approval before going live`);
            url = "ads-draft";
            break;
        }
        job.results[platform] = url;
        console.log(`    ✓ ${platform}: ${url}`);
      } catch (err: any) {
        console.log(`    ✗ ${platform}: ${err.message}`);
        job.results[platform] = `error: ${err.message}`;
      }
    }

    const allOk = Object.values(job.results).every((v) => !v.startsWith("error:"));
    job.status = allOk ? "published" : "failed";
    job.publishedAt = new Date().toISOString();
  }

  saveQueue(queue);
}

// ── Cron runner ───────────────────────────────────────────────────────────────

export function startScheduler(dryRun = false): void {
  console.log("\n  ✓ Publisher scheduler started (human-pattern mode, Asia/Kolkata)");
  console.log("    Checking every 5 minutes for due jobs...\n");

  cron.schedule("*/5 * * * *", async () => {
    const added = enqueueApproved();
    if (added > 0) {
      console.log(`  [scheduler] ${added} newly approved item(s) added to queue`);
      const queue = loadQueue();
      const newJobs = queue.filter((j) => j.status === "queued").slice(-added);
      newJobs.forEach((j) => {
        const ist = new Date(new Date(j.scheduledFor).getTime() + IST_OFFSET_MS);
        console.log(`    → ${j.contentType} scheduled for ${ist.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST  [${j.scheduledWindow}]`);
      });
    }
    await publishDueJobs(dryRun);
  }, { timezone: "Asia/Kolkata" });

  // 7am IST digest
  cron.schedule("30 1 * * *", () => {
    const queue = loadQueue();
    const todayIST = nowIST().toDateString();
    const todayJobs = queue.filter(
      (j) => j.status === "queued" &&
             new Date(new Date(j.scheduledFor).getTime() + IST_OFFSET_MS).toDateString() === todayIST
    );
    if (todayJobs.length) {
      console.log(`\n  [scheduler] Today's publish schedule — ${todayJobs.length} item(s):`);
      todayJobs.forEach((j) => {
        const ist = new Date(new Date(j.scheduledFor).getTime() + IST_OFFSET_MS);
        console.log(`    ${ist.toLocaleTimeString("en-IN")} IST — [${j.brand}] ${j.contentType} → ${j.platforms.join(", ")}  [${j.scheduledWindow}]`);
      });
    }
  }, { timezone: "Asia/Kolkata" });
}
