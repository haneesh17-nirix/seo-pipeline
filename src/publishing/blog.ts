import * as crypto from "crypto";
import * as path from "path";
import axios from "axios";
import { BlobServiceClient } from "@azure/storage-blob";
import { PublishItem as ReviewItem } from "./types";

export type BlogAdapter = "wordpress" | "ghost" | "azure-blob" | "webhook";

interface BlogCreds {
  adapter: BlogAdapter;
  url: string;
  token: string;
  storageAccount?: string;
  storageKey?: string;
  authorId?: string;
}

function blogCreds(brand: string): BlogCreds {
  const prefix = brand.toUpperCase().replace(/-/g, "_");
  return {
    adapter:        (process.env[`${prefix}_BLOG_ADAPTER`] ?? process.env.BLOG_ADAPTER ?? "azure-blob") as BlogAdapter,
    url:            process.env[`${prefix}_BLOG_URL`]    ?? process.env.SAHAYI_BLOG_URL   ?? process.env.AZURE_BLOG_CDN ?? "",
    token:          process.env[`${prefix}_BLOG_TOKEN`]  ?? process.env.BLOG_API_TOKEN    ?? "",
    storageAccount: process.env.AZURE_BLOG_STORAGE ?? "",
    storageKey:     process.env.AZURE_BLOG_KEY     ?? "",
    authorId:       process.env[`${prefix}_BLOG_AUTHOR`] ?? process.env.BLOG_AUTHOR_ID,
  };
}

// ── Main publish function ─────────────────────────────────────────────────────

export async function publishBlogPost(item: ReviewItem): Promise<string> {
  const creds = blogCreds(item.brand);

  const title    = item.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? item.keyword;
  const metaDesc = item.content.match(/META:\s*(.+)/)?.[1]?.trim() ?? "";
  const bodyMd   = item.content.replace(/^META:.+$/m, "").replace(/^#\s+.+$/m, "").trim();
  const slug     = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const tags     = buildTags(item);
  const lang     = item.params?.outputLanguage?.startsWith("Malayalam") ? "ml" : "en";

  switch (creds.adapter) {
    case "azure-blob": return publishToAzureBlob(creds, item, { title, bodyMd, metaDesc, slug, tags, lang });
    case "ghost":      return publishToGhost(creds, { title, bodyMd, metaDesc, slug, tags, lang });
    case "wordpress":  return publishToWordPress(creds, { title, bodyMd, metaDesc, slug, tags, lang });
    default:           return publishViaWebhook(creds, { title, body: bodyMd, metaDesc, slug, tags, item });
  }
}

// ── Azure Blob Storage static site ───────────────────────────────────────────
// Generates a full HTML page and uploads to $web container.
// Path: blog/<slug>/index.html  →  CDN serves at /blog/<slug>/

interface PostMeta { title: string; bodyMd: string; metaDesc: string; slug: string; tags: string[]; lang: string }

async function publishToAzureBlob(creds: BlogCreds, item: ReviewItem, post: PostMeta): Promise<string> {
  if (!creds.storageAccount || !creds.storageKey) {
    throw new Error("Azure blob credentials not set — run bash infra/deploy-static-blog.sh");
  }

  const html = buildBlogHtml(item, post);
  const blobPath = `blog/${post.slug}/index.html`;

  const connStr = `DefaultEndpointsProtocol=https;AccountName=${creds.storageAccount};AccountKey=${creds.storageKey};EndpointSuffix=core.windows.net`;
  const client = BlobServiceClient.fromConnectionString(connStr);
  const container = client.getContainerClient("$web");
  const blob = container.getBlockBlobClient(blobPath);

  await blob.upload(Buffer.from(html, "utf8"), Buffer.byteLength(html, "utf8"), {
    blobHTTPHeaders: {
      blobContentType: "text/html; charset=utf-8",
      blobCacheControl: "public, max-age=3600",
    },
  });

  // Also upload to blog/index.html (listing page update)
  await updateBlogIndex(container, item, post, creds);

  const baseUrl = creds.url.replace(/\/$/, "");
  const postUrl = `${baseUrl}/blog/${post.slug}/`;
  return postUrl;
}

async function updateBlogIndex(
  container: any,
  item: ReviewItem,
  post: PostMeta,
  creds: BlogCreds
): Promise<void> {
  // Read existing index or create fresh
  const indexBlob = container.getBlockBlobClient("blog/index.html");
  let existingHtml = "";
  try {
    const dl = await indexBlob.download(0);
    const chunks: Buffer[] = [];
    for await (const chunk of dl.readableStreamBody!) chunks.push(Buffer.from(chunk));
    existingHtml = Buffer.concat(chunks).toString("utf8");
  } catch { /* first post */ }

  const baseUrl = creds.url.replace(/\/$/, "");
  const postDate = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
  const newCard = `
  <article class="post-card">
    <time>${postDate}</time>
    <h2><a href="/blog/${post.slug}/">${post.title}</a></h2>
    <p>${post.metaDesc}</p>
    <div class="tags">${post.tags.slice(0, 4).map(t => `<span>${t}</span>`).join("")}</div>
  </article>`;

  const indexHtml = existingHtml.includes("<!-- POSTS -->")
    ? existingHtml.replace("<!-- POSTS -->", `${newCard}\n  <!-- POSTS -->`)
    : buildBlogIndexHtml(newCard, baseUrl, post.lang);

  await indexBlob.upload(Buffer.from(indexHtml, "utf8"), Buffer.byteLength(indexHtml, "utf8"), {
    blobHTTPHeaders: { blobContentType: "text/html; charset=utf-8", blobCacheControl: "public, max-age=300" },
  });
}

function buildBlogHtml(item: ReviewItem, post: PostMeta): string {
  const bodyHtml = markdownToHtml(post.bodyMd);
  const postDate = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
  const isMalayalam = post.lang === "ml";
  const readingMins = Math.max(1, Math.ceil(post.bodyMd.split(/\s+/).length / 200));

  // JSON-LD Article schema for AEO/SGE
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.metaDesc,
    "datePublished": new Date().toISOString(),
    "dateModified": new Date().toISOString(),
    "author": { "@type": "Organization", "name": "Sahayi", "url": "https://www.sahayi.co.in" },
    "publisher": {
      "@type": "Organization",
      "name": "Sahayi",
      "url": "https://www.sahayi.co.in",
      "logo": { "@type": "ImageObject", "url": "https://www.sahayi.co.in/logo.png" }
    },
    "keywords": post.tags.join(", "),
    "inLanguage": post.lang,
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://www.sahayi.co.in/blog/${post.slug}/` }
  });

  return `<!DOCTYPE html>
<html lang="${post.lang}" dir="${isMalayalam ? "ltr" : "ltr"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} — Sahayi Blog</title>
  <meta name="description" content="${post.metaDesc}">
  <meta name="keywords" content="${post.tags.join(", ")}">
  <link rel="canonical" href="https://www.sahayi.co.in/blog/${post.slug}/">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${post.metaDesc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://www.sahayi.co.in/blog/${post.slug}/">
  <meta property="og:site_name" content="Sahayi">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${post.title}">
  <meta name="twitter:description" content="${post.metaDesc}">
  ${isMalayalam ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;600&display=swap" rel="stylesheet">' : ""}
  <script type="application/ld+json">${schema}</script>
  <style>
    :root{--brand:#E85D26;--text:#1a1a1a;--muted:#666;--bg:#fff;--card:#f8f8f6}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${isMalayalam ? "'Noto Sans Malayalam'," : ""}'Georgia',serif;color:var(--text);background:var(--bg);line-height:1.75}
    .nav{background:var(--brand);padding:12px 24px;display:flex;align-items:center;gap:16px}
    .nav a{color:#fff;text-decoration:none;font-family:sans-serif;font-size:14px}
    .nav .logo{font-weight:700;font-size:18px;letter-spacing:-0.5px}
    .hero{background:var(--card);padding:48px 24px 32px;border-bottom:1px solid #e8e8e8}
    .hero .inner{max-width:720px;margin:0 auto}
    .hero h1{font-size:clamp(24px,4vw,40px);line-height:1.25;margin-bottom:12px}
    .hero .meta{color:var(--muted);font-family:sans-serif;font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
    .hero .tags span{background:var(--brand);color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-family:sans-serif}
    .article-body{max-width:720px;margin:40px auto;padding:0 24px 80px}
    .article-body h2{font-size:22px;margin:40px 0 12px;color:var(--text)}
    .article-body h3{font-size:18px;margin:32px 0 10px;color:var(--text)}
    .article-body p{margin-bottom:20px;font-size:17px}
    .article-body ul,.article-body ol{margin:16px 0 20px 24px}
    .article-body li{margin-bottom:8px;font-size:17px}
    .article-body strong{font-weight:600}
    .article-body em{font-style:italic}
    .article-body code{background:#f4f4f2;border-radius:3px;padding:1px 5px;font-size:14px}
    .cta-box{background:var(--brand);color:#fff;border-radius:12px;padding:32px;margin:48px 0;text-align:center}
    .cta-box h3{font-size:22px;margin-bottom:10px}
    .cta-box p{margin-bottom:20px;opacity:.9}
    .cta-box a{background:#fff;color:var(--brand);padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-family:sans-serif;font-size:15px}
    footer{background:#1a1a1a;color:#999;text-align:center;padding:24px;font-family:sans-serif;font-size:13px}
    footer a{color:#ccc}
    @media(max-width:600px){.hero{padding:32px 16px 24px}.article-body{padding:0 16px 60px}}
  </style>
</head>
<body>

<nav class="nav">
  <a class="logo" href="https://www.sahayi.co.in">Sahayi</a>
  <a href="/blog/">Blog</a>
  <a href="https://www.sahayi.co.in/services/">Services</a>
</nav>

<div class="hero">
  <div class="inner">
    <h1>${post.title}</h1>
    <div class="meta">
      <span>${postDate}</span>
      <span>${readingMins} min read</span>
      <span class="tags">${post.tags.slice(0, 3).map(t => `<span>${t}</span>`).join(" ")}</span>
    </div>
  </div>
</div>

<main class="article-body">
${bodyHtml}

<div class="cta-box">
  <h3>${isMalayalam ? "ഇന്നു തന്നെ ബുക്ക് ചെയ്യൂ" : "Book a Verified Professional Today"}</h3>
  <p>${isMalayalam ? "Kerala-യിലെ verified professionals — 60 seconds-ൽ book ചെയ്യാം." : "Trusted home service professionals across Kerala. Same-day availability."}</p>
  <a href="https://www.sahayi.co.in">${isMalayalam ? "Sahayi.co.in" : "Book on Sahayi →"}</a>
</div>
</main>

<footer>
  <p>© ${new Date().getFullYear()} Sahayi — Home Services Kerala &nbsp;·&nbsp;
  <a href="https://www.sahayi.co.in">sahayi.co.in</a> &nbsp;·&nbsp;
  <a href="/blog/">Blog</a></p>
</footer>

</body>
</html>`;
}

function buildBlogIndexHtml(firstCard: string, baseUrl: string, lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sahayi Blog — Home Services Kerala</title>
  <meta name="description" content="Tips, guides and local insights on home services across Kerala from Sahayi.">
  <link rel="canonical" href="https://www.sahayi.co.in/blog/">
  <style>
    :root{--brand:#E85D26}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;color:#1a1a1a;background:#fff;line-height:1.6}
    .nav{background:var(--brand);padding:12px 24px;display:flex;gap:16px;align-items:center}
    .nav a{color:#fff;text-decoration:none;font-size:14px}.nav .logo{font-weight:700;font-size:18px}
    .hero{padding:48px 24px;max-width:860px;margin:0 auto}
    .hero h1{font-size:clamp(24px,4vw,36px);margin-bottom:8px}
    .hero p{color:#666;font-size:16px}
    .posts{max-width:860px;margin:0 auto;padding:0 24px 80px;display:grid;gap:24px}
    .post-card{border:1px solid #e8e8e8;border-radius:10px;padding:24px;background:#fafaf8}
    .post-card time{font-size:12px;color:#999;display:block;margin-bottom:6px}
    .post-card h2{font-size:20px;margin-bottom:8px}
    .post-card h2 a{color:#1a1a1a;text-decoration:none}
    .post-card h2 a:hover{color:var(--brand)}
    .post-card p{font-size:15px;color:#555;margin-bottom:12px}
    .post-card .tags span{background:#f0e9e5;color:var(--brand);border-radius:4px;padding:2px 8px;font-size:11px;margin-right:4px}
    footer{background:#1a1a1a;color:#999;text-align:center;padding:24px;font-size:13px}
    footer a{color:#ccc}
  </style>
</head>
<body>
<nav class="nav">
  <a class="logo" href="https://www.sahayi.co.in">Sahayi</a>
  <a href="/blog/">Blog</a>
  <a href="https://www.sahayi.co.in/services/">Services</a>
</nav>
<div class="hero">
  <h1>Sahayi Blog</h1>
  <p>Home service tips, local guides and stories from across Kerala.</p>
</div>
<section class="posts">
  ${firstCard}
  <!-- POSTS -->
</section>
<footer><p>© ${new Date().getFullYear()} Sahayi — <a href="https://www.sahayi.co.in">sahayi.co.in</a></p></footer>
</body>
</html>`;
}

// ── Ghost Admin API ───────────────────────────────────────────────────────────

function signGhostJwt(adminApiKey: string): string {
  const [id, secret] = adminApiKey.split(":");
  if (!id || !secret) throw new Error("Ghost API key must be id:secret format");
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" })).toString("base64url");
  const sig = crypto.createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

async function publishToGhost(creds: BlogCreds, post: PostMeta): Promise<string> {
  const jwt = signGhostJwt(creds.token);
  const res = await axios.post(`${creds.url.replace(/\/$/, "")}/ghost/api/admin/posts/?source=html`, {
    posts: [{
      title: post.title, html: markdownToHtml(post.bodyMd),
      custom_excerpt: post.metaDesc, meta_description: post.metaDesc,
      slug: post.slug, status: "published",
      tags: post.tags.map(name => ({ name })), locale: post.lang,
    }],
  }, {
    headers: { Authorization: `Ghost ${jwt}`, "Content-Type": "application/json", "Accept-Version": "v5.0" },
    timeout: 15000,
  });
  return res.data.posts[0].url;
}

// ── WordPress ─────────────────────────────────────────────────────────────────

async function publishToWordPress(creds: BlogCreds, post: PostMeta): Promise<string> {
  const res = await axios.post(`${creds.url.replace(/\/$/, "")}/wp-json/wp/v2/posts`, {
    title: post.title, content: markdownToHtml(post.bodyMd),
    excerpt: post.metaDesc, slug: post.slug, status: "publish",
    meta: { _yoast_wpseo_metadesc: post.metaDesc },
  }, { headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" } });
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
  const kw = item.keyword.split(/\s+/).filter(w => w.length > 3);
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
    .replace(/(<li>[\s\S]+?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .split(/\n\n+/)
    .map(block => {
      if (/^<(h[123]|ul|ol|li)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, " ")}</p>`;
    })
    .join("\n")
    .replace(/<p><\/p>/g, "");
}
