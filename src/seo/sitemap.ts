import { create } from "xmlbuilder2";
import * as fs from "fs";
import * as path from "path";
import { SITE, KEYWORD_GROUPS } from "../keywords/config";
import type { BrandConfig } from "../brands/loader";

interface SitemapPage {
  url: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

function buildPageList(brand?: BrandConfig): SitemapPage[] {
  const today = new Date().toISOString().split("T")[0];

  if (brand) {
    const pages: SitemapPage[] = brand.pages.map((p, i) => ({
      url: p.path,
      changefreq: p.path === "/" ? "weekly" : "monthly",
      priority: p.path === "/" ? 1.0 : 0.7,
      lastmod: today,
    }));
    const keywordPages: SitemapPage[] = brand.keywordGroups.map((g) => ({
      url: g.targetPage,
      changefreq: "weekly" as const,
      priority: 0.85,
      lastmod: today,
    }));
    // dedupe by path
    const seen = new Set(pages.map((p) => p.url));
    for (const p of keywordPages) {
      if (!seen.has(p.url)) { seen.add(p.url); pages.push(p); }
    }
    return pages;
  }

  const staticPages: SitemapPage[] = [
    { url: "/", changefreq: "weekly", priority: 1.0, lastmod: today },
    { url: "/about", changefreq: "monthly", priority: 0.6 },
    { url: "/contact", changefreq: "monthly", priority: 0.5 },
    { url: "/blog", changefreq: "daily", priority: 0.8 },
    { url: "/pricing", changefreq: "weekly", priority: 0.9 },
  ];

  const keywordPages: SitemapPage[] = KEYWORD_GROUPS.map((g) => ({
    url: g.targetPage,
    changefreq: "weekly" as const,
    priority: 0.85,
    lastmod: today,
  }));

  return [...staticPages, ...keywordPages];
}

export function generateSitemap(pages?: SitemapPage[], brand?: BrandConfig): string {
  const list = pages ?? buildPageList(brand);
  const base = (brand?.siteUrl ?? SITE.url).replace(/\/$/, "");

  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele("urlset", {
      xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
      "xmlns:xhtml": "http://www.w3.org/1999/xhtml",
    });

  for (const page of list) {
    const url = root.ele("url");
    url.ele("loc").txt(`${base}${page.url}`);
    if (page.lastmod) url.ele("lastmod").txt(page.lastmod);
    if (page.changefreq) url.ele("changefreq").txt(page.changefreq);
    if (page.priority !== undefined) url.ele("priority").txt(String(page.priority));
  }

  return root.end({ prettyPrint: true });
}

export function saveSitemap(brand?: BrandConfig, outputDir?: string): string {
  const dir = outputDir ?? path.join(process.cwd(), "output");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "sitemap.xml");
  fs.writeFileSync(filePath, generateSitemap(undefined, brand), "utf8");
  return filePath;
}
