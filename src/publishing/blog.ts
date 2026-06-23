import axios from "axios";
import * as fs from "fs";
import { ReviewItem } from "../approval/telegram-bot";

// Generic blog publishing via webhook/REST API
// Supports: WordPress REST API, Ghost Admin API, custom webhook

export type BlogAdapter = "wordpress" | "ghost" | "webhook";

interface BlogCreds {
  adapter: BlogAdapter;
  url: string;
  token: string;
  authorId?: string;
}

function blogCreds(brand: string): BlogCreds {
  const prefix = brand.toUpperCase().replace(/-/g, "_");
  return {
    adapter: (process.env[`${prefix}_BLOG_ADAPTER`] ?? process.env.BLOG_ADAPTER ?? "webhook") as BlogAdapter,
    url:     process.env[`${prefix}_BLOG_URL`]     ?? process.env.BLOG_WEBHOOK_URL ?? "",
    token:   process.env[`${prefix}_BLOG_TOKEN`]   ?? process.env.BLOG_API_TOKEN   ?? "",
    authorId: process.env[`${prefix}_BLOG_AUTHOR`] ?? process.env.BLOG_AUTHOR_ID,
  };
}

export async function publishBlogPost(item: ReviewItem): Promise<string> {
  const creds = blogCreds(item.brand);
  if (!creds.url) throw new Error("Blog URL not configured — set BLOG_WEBHOOK_URL in .env");

  const title    = item.content.match(/^#\s+(.+)$/m)?.[1] ?? item.keyword;
  const metaDesc = item.content.match(/META:\s*(.+)/)?.[1]?.trim() ?? "";
  const body     = item.content.replace(/META:.+\n/, "").replace(/^#\s+.+\n/, "").trim();
  const slug     = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  const tags     = [item.brand, item.contentType, ...item.keyword.split(" "), "Kerala"];

  switch (creds.adapter) {
    case "wordpress": return publishToWordPress(creds, title, body, metaDesc, slug, tags);
    case "ghost":     return publishToGhost(creds, title, body, metaDesc, slug, tags);
    default:          return publishViaWebhook(creds, { title, body, metaDesc, slug, tags, item });
  }
}

async function publishToWordPress(
  creds: BlogCreds, title: string, body: string,
  excerpt: string, slug: string, tags: string[]
): Promise<string> {
  const res = await axios.post(`${creds.url}/wp-json/wp/v2/posts`, {
    title,
    content: markdownToHtml(body),
    excerpt,
    slug,
    status: "publish",
    tags: [],          // resolve tag IDs if needed
    meta: { _yoast_wpseo_metadesc: excerpt },
  }, {
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
  });
  return res.data.link;
}

async function publishToGhost(
  creds: BlogCreds, title: string, body: string,
  custom_excerpt: string, slug: string, tags: string[]
): Promise<string> {
  const res = await axios.post(`${creds.url}/ghost/api/admin/posts/?source=html`, {
    posts: [{
      title,
      html: markdownToHtml(body),
      custom_excerpt,
      slug,
      status: "published",
      tags: tags.map((name) => ({ name })),
    }],
  }, {
    headers: { Authorization: `Ghost ${creds.token}`, "Content-Type": "application/json" },
  });
  return res.data.posts[0].url;
}

async function publishViaWebhook(
  creds: BlogCreds,
  payload: object
): Promise<string> {
  const res = await axios.post(creds.url, payload, {
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
  });
  return res.data?.url ?? res.data?.permalink ?? creds.url;
}

// Minimal markdown → HTML for blog adapters that don't accept markdown
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/^(?!<[hup])(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}
