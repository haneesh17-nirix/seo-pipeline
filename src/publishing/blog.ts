import axios from "axios";
import * as crypto from "crypto";
import { PublishItem as ReviewItem } from "./types";

export type BlogAdapter = "wordpress" | "ghost" | "webhook";

interface BlogCreds {
  adapter: BlogAdapter;
  url: string;
  token: string;      // Ghost: Admin API key (id:secret). WordPress: JWT token.
  authorId?: string;
}

function blogCreds(brand: string): BlogCreds {
  const prefix = brand.toUpperCase().replace(/-/g, "_");
  return {
    adapter:  (process.env[`${prefix}_BLOG_ADAPTER`] ?? process.env.BLOG_ADAPTER ?? "ghost") as BlogAdapter,
    url:      process.env[`${prefix}_BLOG_URL`]    ?? process.env.BLOG_URL       ?? "",
    token:    process.env[`${prefix}_BLOG_TOKEN`]  ?? process.env.BLOG_API_TOKEN ?? "",
    authorId: process.env[`${prefix}_BLOG_AUTHOR`] ?? process.env.BLOG_AUTHOR_ID,
  };
}

// ── Ghost JWT signing ─────────────────────────────────────────────────────────
// Ghost Admin API key format: "<id>:<secret>" (hex string, 64 chars)
// Must be signed as a JWT — raw key is not accepted in Authorization header.

function signGhostJwt(adminApiKey: string): string {
  const [id, secret] = adminApiKey.split(":");
  if (!id || !secret) throw new Error("Ghost API key must be in format id:secret");

  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" })).toString("base64url");
  const sigInput = `${header}.${payload}`;
  const sig = crypto
    .createHmac("sha256", Buffer.from(secret, "hex"))
    .update(sigInput)
    .digest("base64url");

  return `${sigInput}.${sig}`;
}

// ── Main publish function ─────────────────────────────────────────────────────

export async function publishBlogPost(item: ReviewItem): Promise<string> {
  const creds = blogCreds(item.brand);
  if (!creds.url) throw new Error("Blog URL not configured — set BLOG_URL in .env");
  if (!creds.token) throw new Error("Blog token not configured — set BLOG_API_TOKEN in .env");

  const title      = item.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? item.keyword;
  const metaDesc   = item.content.match(/META:\s*(.+)/)?.[1]?.trim() ?? "";
  const bodyMd     = item.content.replace(/^META:.+$/m, "").replace(/^#\s+.+$/m, "").trim();
  const bodyHtml   = markdownToHtml(bodyMd);
  const slug       = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const tags       = buildTags(item);
  const lang       = item.params?.outputLanguage?.startsWith("Malayalam") ? "ml" : "en";

  switch (creds.adapter) {
    case "ghost":     return publishToGhost(creds, { title, bodyHtml, metaDesc, slug, tags, lang });
    case "wordpress": return publishToWordPress(creds, { title, bodyHtml, metaDesc, slug, tags });
    default:          return publishViaWebhook(creds, { title, body: bodyMd, metaDesc, slug, tags, item });
  }
}

// ── Ghost Admin API ───────────────────────────────────────────────────────────

interface GhostPost {
  title: string;
  bodyHtml: string;
  metaDesc: string;
  slug: string;
  tags: string[];
  lang: string;
}

async function publishToGhost(creds: BlogCreds, post: GhostPost): Promise<string> {
  const jwt = signGhostJwt(creds.token);
  const base = creds.url.replace(/\/$/, "");

  const res = await axios.post(
    `${base}/ghost/api/admin/posts/?source=html`,
    {
      posts: [{
        title:           post.title,
        html:            post.bodyHtml,
        custom_excerpt:  post.metaDesc,
        meta_description: post.metaDesc,
        og_description:  post.metaDesc,
        slug:            post.slug,
        status:          "published",
        tags:            post.tags.map((name) => ({ name })),
        locale:          post.lang,
        // canonical_url left blank — Ghost infers from slug
      }],
    },
    {
      headers: {
        Authorization: `Ghost ${jwt}`,
        "Content-Type": "application/json",
        "Accept-Version": "v5.0",
      },
      timeout: 15000,
    }
  );

  return res.data.posts[0].url;
}

// ── WordPress REST API ────────────────────────────────────────────────────────

interface WpPost { title: string; bodyHtml: string; metaDesc: string; slug: string; tags: string[] }

async function publishToWordPress(creds: BlogCreds, post: WpPost): Promise<string> {
  const base = creds.url.replace(/\/$/, "");
  const res = await axios.post(
    `${base}/wp-json/wp/v2/posts`,
    {
      title:   post.title,
      content: post.bodyHtml,
      excerpt: post.metaDesc,
      slug:    post.slug,
      status:  "publish",
      meta:    { _yoast_wpseo_metadesc: post.metaDesc },
    },
    { headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" } }
  );
  return res.data.link;
}

// ── Webhook fallback ──────────────────────────────────────────────────────────

async function publishViaWebhook(creds: BlogCreds, payload: object): Promise<string> {
  const res = await axios.post(creds.url, payload, {
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    timeout: 10000,
  });
  return res.data?.url ?? res.data?.permalink ?? creds.url;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTags(item: ReviewItem): string[] {
  const base = ["Sahayi", "Kerala", "home services"];
  const kw = item.keyword.split(/\s+/).filter((w) => w.length > 3);
  const lang = item.params?.outputLanguage;
  if (lang?.startsWith("Malayalam")) base.push("Malayalam", "മലയാളം");
  if (lang?.startsWith("Manglish"))  base.push("Manglish");
  return [...new Set([...base, ...kw])].slice(0, 10);
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,   "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/`(.+?)`/g,       "<code>$1</code>")
    .replace(/^- (.+)$/gm,    "<li>$1</li>")
    .replace(/(<li>[\s\S]+?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .split(/\n\n+/)
    .map((block) => {
      if (block.startsWith("<h") || block.startsWith("<ul") || block.startsWith("<li")) return block;
      return `<p>${block.replace(/\n/g, " ")}</p>`;
    })
    .join("\n")
    .replace(/<p><\/p>/g, "");
}
