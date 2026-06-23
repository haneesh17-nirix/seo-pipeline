import * as fs from "fs";
import * as path from "path";
import * as cron from "node-cron";
import { getAllPending, parseReviewFile, updateReviewStatus, ReviewItem } from "../approval/telegram-bot";
import { postToInstagram, postToFacebook } from "./meta";
import { postToYouTube } from "./youtube";
import { publishBlogPost } from "./blog";

// ── Publish schedule config per content type ──────────────────────────────────
// Times are local (Asia/Kolkata). Best-engagement windows for India.

export const PUBLISH_SCHEDULE: Record<string, { days: string; hour: number; minute: number }[]> = {
  "blog-post":     [{ days: "2,5",   hour: 9,  minute: 0  }], // Tue + Fri 9am
  "social-post":   [{ days: "1,3,6", hour: 10, minute: 30 }], // Mon/Wed/Sat 10:30am
  "faq-page":      [{ days: "1",     hour: 8,  minute: 0  }], // Monday 8am
  "ad-copy":       [{ days: "1",     hour: 7,  minute: 0  }], // Monday 7am (manual review before spend)
  "service-landing":[{ days: "3",    hour: 11, minute: 0  }], // Wednesday 11am
};

// Platform routing per content type
export const PLATFORM_MAP: Record<string, string[]> = {
  "blog-post":      ["blog"],
  "social-post":    ["instagram", "facebook"],
  "faq-page":       ["blog"],
  "ad-copy":        ["google-ads"],           // drafts only — human confirms spend
  "service-landing": ["blog"],
};

// ── Publish queue file ────────────────────────────────────────────────────────

interface PublishJob {
  filePath: string;
  brand: string;
  contentType: string;
  platforms: string[];
  scheduledFor: string;
  status: "queued" | "published" | "failed";
  publishedAt?: string;
  error?: string;
  results?: Record<string, string>; // platform → post URL
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

// ── Enqueue approved items ────────────────────────────────────────────────────

export function enqueueApproved(brandSlug?: string): number {
  const brandsDir = path.join(process.cwd(), "brands");
  const slugs = brandSlug
    ? [brandSlug]
    : fs.readdirSync(brandsDir).filter((d) => fs.existsSync(path.join(brandsDir, d, "brand.json")));

  const queue = loadQueue();
  const queued = new Set(queue.map((j) => j.filePath));
  let added = 0;

  for (const slug of slugs) {
    const queueDir = path.join(brandsDir, slug, "output", "review-queue");
    if (!fs.existsSync(queueDir)) continue;

    for (const f of fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"))) {
      const filePath = path.join(queueDir, f);
      if (queued.has(filePath)) continue;

      const item = parseReviewFile(filePath);
      if (!item || item.status !== "approved") continue;

      const platforms = PLATFORM_MAP[item.contentType] ?? ["blog"];
      const schedule = PUBLISH_SCHEDULE[item.contentType];
      const scheduledFor = schedule
        ? nextSlot(schedule[0])
        : new Date(Date.now() + 3600_000).toISOString();

      queue.push({
        filePath,
        brand: item.brand,
        contentType: item.contentType,
        platforms,
        scheduledFor,
        status: "queued",
      });
      added++;
    }
  }

  saveQueue(queue);
  return added;
}

function nextSlot(slot: { days: string; hour: number; minute: number }): string {
  const now = new Date();
  const targetDays = slot.days.split(",").map(Number);
  const d = new Date(now);

  for (let i = 0; i < 7; i++) {
    d.setDate(now.getDate() + i);
    if (targetDays.includes(d.getDay())) {
      d.setHours(slot.hour, slot.minute, 0, 0);
      if (d > now) return d.toISOString();
    }
  }
  // Fallback: 24h from now
  return new Date(Date.now() + 86_400_000).toISOString();
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
    if (!item) {
      job.status = "failed";
      job.error = "Could not parse review file";
      continue;
    }

    console.log(`\n  [${job.brand}] ${job.contentType} → ${job.platforms.join(", ")}`);
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
            console.log(`    ⚠ Google Ads: draft created — requires manual budget approval before going live`);
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

    if (allOk) {
      updateReviewStatus(job.filePath, "approved", { publishedAt: job.publishedAt });
    }
  }

  saveQueue(queue);
}

// ── Cron runner ───────────────────────────────────────────────────────────────

export function startScheduler(dryRun = false): void {
  console.log("\n  ✓ Publisher scheduler started");
  console.log("    Checking every 15 minutes for due jobs...\n");

  // Check every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    const added = enqueueApproved();
    if (added > 0) console.log(`  [scheduler] ${added} newly approved item(s) added to queue`);
    await publishDueJobs(dryRun);
  }, { timezone: "Asia/Kolkata" });

  // Daily 7am digest — show what's queued for the day
  cron.schedule("0 7 * * *", () => {
    const queue = loadQueue();
    const today = new Date().toDateString();
    const todayJobs = queue.filter(
      (j) => j.status === "queued" && new Date(j.scheduledFor).toDateString() === today
    );
    if (todayJobs.length) {
      console.log(`\n  [scheduler] Today's publish schedule (${todayJobs.length} items):`);
      todayJobs.forEach((j) =>
        console.log(`    ${new Date(j.scheduledFor).toLocaleTimeString("en-IN")} — [${j.brand}] ${j.contentType} → ${j.platforms.join(", ")}`)
      );
    }
  }, { timezone: "Asia/Kolkata" });
}
