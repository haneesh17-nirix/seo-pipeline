import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { ReviewItem } from "../approval/telegram-bot";

// YouTube Data API v3 — publish Shorts and long-form videos

function ytAuth(brand: string) {
  const prefix = brand.toUpperCase().replace(/-/g, "_");
  const credFile = process.env[`${prefix}_YT_CREDENTIALS`]
    ?? `./brands/${brand}/yt-credentials.json`;

  if (!fs.existsSync(credFile)) throw new Error(`YouTube credentials not found: ${credFile}`);
  const creds = JSON.parse(fs.readFileSync(credFile, "utf8"));

  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });
  return auth;
}

export interface VideoPublishOptions {
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;    // 22 = People & Blogs, 26 = Howto & Style
  privacyStatus?: "public" | "unlisted" | "private";
  isShort?: boolean;
  videoFilePath: string;
  thumbnailPath?: string;
  scheduledPublishAt?: string; // ISO date
}

export async function uploadVideo(brand: string, opts: VideoPublishOptions): Promise<string> {
  const auth = ytAuth(brand);
  const youtube = google.youtube({ version: "v3", auth });

  const fileSize = fs.statSync(opts.videoFilePath).size;
  const videoStream = fs.createReadStream(opts.videoFilePath);

  const description = opts.isShort
    ? `${opts.description}\n\n#Shorts ${opts.tags.map((t) => `#${t}`).join(" ")}`
    : opts.description;

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: opts.title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: opts.tags.slice(0, 500),
        categoryId: opts.categoryId ?? "26",
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: opts.privacyStatus ?? "public",
        publishAt: opts.scheduledPublishAt,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: "video/mp4",
      body: videoStream,
    },
  } as any);

  const videoId = res.data.id!;

  // Upload thumbnail if provided
  if (opts.thumbnailPath && fs.existsSync(opts.thumbnailPath)) {
    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: "image/jpeg",
        body: fs.createReadStream(opts.thumbnailPath),
      },
    } as any);
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Publish a content item as a YouTube Short (video must exist — from video generator)
export async function postToYouTube(item: ReviewItem): Promise<string> {
  const videoPath = item.filePath.replace(".md", ".mp4");
  if (!fs.existsSync(videoPath)) {
    throw new Error(`No video file found at ${videoPath} — run video generator first`);
  }

  const title = item.content.match(/^#\s+(.+)$/m)?.[1] ?? item.keyword;
  const description = item.content.replace(/^#{1,6}\s+/gm, "").slice(0, 500);
  const tags = item.keyword.split(" ").concat([item.brand, "Kerala", "homeservices"]);

  return uploadVideo(item.brand, {
    title,
    description,
    tags,
    isShort: item.contentType === "social-post",
    videoFilePath: videoPath,
    privacyStatus: "public",
  });
}

// Generate a YouTube-optimised description from a blog post
export function buildYouTubeDescription(item: ReviewItem, videoUrl: string): string {
  const body = item.content
    .replace(/META:.+\n/, "")
    .replace(/^#{1,6}\s+/gm, "")
    .slice(0, 3000);

  const timestamps = "00:00 Intro\n00:30 The problem\n01:15 The solution\n02:00 How Sahayi works\n02:45 Book now";

  return [
    body,
    "",
    "──────────────────────────────",
    timestamps,
    "──────────────────────────────",
    `🌐 Book a service: https://www.sahayi.co.in`,
    `📱 Instagram: @sahayi.in`,
    `📘 Facebook: facebook.com/sahayi`,
    "",
    item.keyword.split(" ").concat(["Kerala", "homeservices", "Sahayi"]).map((t) => `#${t}`).join(" "),
  ].join("\n");
}
