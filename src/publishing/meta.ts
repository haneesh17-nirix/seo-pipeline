import axios from "axios";
import * as fs from "fs";
import { PublishItem as ReviewItem } from "./types";

// Meta Graph API — Instagram + Facebook publishing
// Credentials set per-brand in brand.json or env vars

const BASE = "https://graph.facebook.com/v19.0";

function metaCreds(brand: string) {
  const prefix = brand.toUpperCase().replace(/-/g, "_");
  return {
    igAccountId:  process.env[`${prefix}_IG_ACCOUNT_ID`]  ?? process.env.META_IG_ACCOUNT_ID ?? "",
    fbPageId:     process.env[`${prefix}_FB_PAGE_ID`]      ?? process.env.META_FB_PAGE_ID    ?? "",
    accessToken:  process.env[`${prefix}_META_TOKEN`]       ?? process.env.META_ACCESS_TOKEN  ?? "",
  };
}

// ── Instagram ─────────────────────────────────────────────────────────────────

export async function postToInstagram(item: ReviewItem): Promise<string> {
  const { igAccountId, accessToken } = metaCreds(item.brand);
  if (!igAccountId || !accessToken) throw new Error("Instagram credentials not configured");

  // Extract caption (first 2200 chars) and image URL from content frontmatter
  const caption = buildInstagramCaption(item);

  // Step 1: create media container
  const container = await axios.post(`${BASE}/${igAccountId}/media`, null, {
    params: {
      caption,
      media_type: "IMAGE",
      // image_url: item.imageUrl ?? undefined,  // set when image generation is wired
      access_token: accessToken,
    },
  });

  const containerId: string = container.data.id;

  // Step 2: publish
  const publish = await axios.post(`${BASE}/${igAccountId}/media_publish`, null, {
    params: { creation_id: containerId, access_token: accessToken },
  });

  return `https://www.instagram.com/p/${publish.data.id}/`;
}

function buildInstagramCaption(item: ReviewItem): string {
  // Extract text up to 2200 chars, strip markdown headers
  const text = item.content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/META:.*\n/g, "")
    .trim()
    .slice(0, 2150);

  // Extract hashtags from content or generate from keyword
  const tags = extractOrBuildHashtags(item);
  return `${text}\n\n${tags}`;
}

function extractOrBuildHashtags(item: ReviewItem): string {
  const existing = item.content.match(/#\w+/g) ?? [];
  if (existing.length >= 5) return existing.slice(0, 30).join(" ");

  // Build from keyword + brand + service
  const words = item.keyword.toLowerCase().split(/\s+/);
  const tags = [
    ...words.map((w) => `#${w.replace(/[^a-z0-9]/g, "")}`),
    `#${item.brand.toLowerCase()}`,
    "#homeservices", "#Kerala", "#India",
    "#trusted", "#professional",
  ].filter((t) => t.length > 2).slice(0, 20);
  return tags.join(" ");
}

// ── Facebook ──────────────────────────────────────────────────────────────────

export async function postToFacebook(item: ReviewItem): Promise<string> {
  const { fbPageId, accessToken } = metaCreds(item.brand);
  if (!fbPageId || !accessToken) throw new Error("Facebook credentials not configured");

  const message = item.content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/META:.*\n/g, "")
    .trim()
    .slice(0, 63206); // FB post limit

  const res = await axios.post(`${BASE}/${fbPageId}/feed`, null, {
    params: { message, access_token: accessToken },
  });

  return `https://www.facebook.com/${fbPageId}/posts/${res.data.id.split("_")[1]}`;
}

// ── Reply generation ──────────────────────────────────────────────────────────
// Generates reply drafts for comments — owner approves before posting.
// NEVER auto-posts replies. Always queued for owner review.

export interface CommentReplyDraft {
  commentId: string;
  commentText: string;
  commentAuthor: string;
  replyDraft: string;
  platform: "instagram" | "facebook";
  postUrl: string;
  generatedAt: string;
  status: "pending_owner_approval";
}

export async function fetchUnrepliedComments(brand: string): Promise<CommentReplyDraft[]> {
  const { igAccountId, accessToken } = metaCreds(brand);
  if (!igAccountId || !accessToken) return [];

  // Fetch recent media
  const media = await axios.get(`${BASE}/${igAccountId}/media`, {
    params: { fields: "id,permalink,comments_count", access_token: accessToken, limit: 10 },
  });

  const drafts: CommentReplyDraft[] = [];

  for (const post of (media.data.data ?? []).slice(0, 5)) {
    if (!post.comments_count) continue;

    const comments = await axios.get(`${BASE}/${post.id}/comments`, {
      params: { fields: "id,text,username,replies", access_token: accessToken },
    });

    for (const comment of (comments.data.data ?? [])) {
      // Skip if already replied
      if (comment.replies?.data?.length > 0) continue;

      const replyDraft = generateReplyDraft(comment.text, brand);
      drafts.push({
        commentId: comment.id,
        commentText: comment.text,
        commentAuthor: comment.username,
        replyDraft,
        platform: "instagram",
        postUrl: post.permalink,
        generatedAt: new Date().toISOString(),
        status: "pending_owner_approval",
      });
    }
  }

  return drafts;
}

function generateReplyDraft(commentText: string, brand: string): string {
  const text = commentText.toLowerCase();

  if (/price|cost|charge|rate|how much/i.test(text))
    return `Hi! Pricing depends on the specific service and location. Drop us a DM or visit ${brand}.co.in/pricing for a quick quote 🙌`;

  if (/available|timing|when|hour|open/i.test(text))
    return `We're available 7 days a week, 8am–8pm. Book anytime at ${brand}.co.in — same-day slots available! 📅`;

  if (/good|great|love|amazing|excellent|thanks|thank/i.test(text))
    return `Thank you so much! 🙏 Really means a lot. Hope to serve you again soon!`;

  if (/bad|worst|terrible|disappointed|not good|useless/i.test(text))
    return `We're really sorry to hear this 😞 Please DM us your booking details and we'll make it right right away.`;

  if (/how|process|work|steps/i.test(text))
    return `Simple 3 steps — pick your service, choose a time, and a verified professional arrives at your door. Book at ${brand}.co.in 👍`;

  // Generic warm reply
  return `Thanks for engaging with us! 😊 Feel free to DM if you have any questions — always happy to help.`;
}

export async function saveReplyDrafts(drafts: CommentReplyDraft[], brand: string): Promise<string> {
  const outDir = `brands/${brand}/output/reply-drafts`;
  fs.mkdirSync(outDir, { recursive: true });
  const file = `${outDir}/drafts-${new Date().toISOString().split("T")[0]}.json`;
  fs.writeFileSync(file, JSON.stringify(drafts, null, 2), "utf8");
  return file;
}

// Owner calls this after approving a draft — only then does it post
export async function postApprovedReply(
  commentId: string,
  replyText: string,
  accessToken: string
): Promise<string> {
  const res = await axios.post(`${BASE}/${commentId}/replies`, null, {
    params: { message: replyText, access_token: accessToken },
  });
  return res.data.id;
}
